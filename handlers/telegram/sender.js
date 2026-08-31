import { getBot } from '../../bot.js'
import { _l } from './i18n.js'
import { honsole, fetch_tmp_file, isStaleMediaError } from '../common.js'
import { mg_filter } from './mediagroup.js'
import { InputFile } from 'grammy'
import config from '../../config.js'
import axios from 'axios'
import {
    MediaSendKind,
    classifyMediaSendError,
    queueLocalMediaRetry,
    telegramErrorDescription,
    telegramRetryAfter
} from './media-send-result.js'
import { runMediaGroupAttempts } from '#handlers/telegram/media-group-retry'
import { logTelegramFailure } from '#handlers/telegram/delivery-telemetry'
import { reportAdminDeliveryError } from '#handlers/telegram/delivery-error-report'
import {
    classifyDocumentFailure,
    deliverDocument,
    publicDocumentRecoveryUrl
} from '#handlers/telegram/document-delivery'

export { MediaSendKind, classifyMediaSendError }

export const CatchilyDecision = Object.freeze({
    NEXT_SOURCE: 'next_source',
    RETRY_TRANSPORT: 'retry_transport',
    TERMINAL: 'terminal'
})

/**
 * catch error report && reply
 * @param {*} e error
 * @param {*} chat_id chat_id
 * @param {*} language_code language code
 */
export async function catchily(e, chat_id, language_code = 'en', options = {}) {
    const bot = options.bot || getBot()
    const logger = options.logger || honsole
    const masterId = options.masterId || config.tg.master_id
    const default_extra = {
        parse_mode: 'MarkdownV2'
    }
    const mediaFailure = classifyMediaSendError(e)
    const rawDescription = telegramErrorDescription(e)
    const description = rawDescription.toLowerCase()
    const httpStatus = Number(e?.response?.status)
    const isTelegramError = Boolean(e?.method || Number.isInteger(e?.error_code) || e?.ok === false)
    const errorCode = options.errorCode || (
        !isTelegramError && Number.isInteger(httpStatus)
            ? `HTTP_${httpStatus}`
            : mediaFailure.code
    )
    const decision = mediaFailure.terminal
        ? CatchilyDecision.TERMINAL
        : description.includes('too many requests') || e?.error_code === 429
            ? CatchilyDecision.RETRY_TRANSPORT
            : CatchilyDecision.NEXT_SOURCE
    logTelegramFailure(logger, e, {
        chatId: chat_id,
        illustIds: options.illustIds,
        illustId: options.illustId,
        page: options.page,
        method: options.method,
        errorCode,
        attempt: options.attempt,
        failedIndex: Number.isInteger(mediaFailure.failedIndex)
            ? mediaFailure.failedIndex + 1
            : options.failedIndex
    })
    await reportAdminDeliveryError({
        error: e,
        masterId,
        sendMessage: (masterId, report) => bot.api.sendMessage(masterId, report),
        logger,
        chatId: chat_id,
        illustIds: options.illustIds,
        illustId: options.illustId,
        page: options.page,
        method: options.method,
        errorCode,
        attempt: options.attempt,
        failedIndex: Number.isInteger(mediaFailure.failedIndex)
            ? mediaFailure.failedIndex + 1
            : options.failedIndex
    })
    let userNotified = false
    try {
        if (!e.ok) {
            if (options.notifyUser !== false && description.includes('media_caption_too_long')) {
                userNotified = await bot.api.sendMessage(
                    chat_id,
                    _l(language_code, 'error_text_too_long'),
                    default_extra
                ).then(() => true, () => false)
            } else if (description.includes('can\'t parse entities: character')) {
                if (options.notifyUser !== false) {
                    userNotified = await bot.api.sendMessage(
                        chat_id,
                        _l(language_code, 'error_format', rawDescription)
                    ).then(() => true, () => false)
                }
                // banned by user
            } else if (description.includes('forbidden:')) {
                // not have permission
            } else if (description.includes('not enough rights to send')) {
                if (options.notifyUser !== false) {
                    userNotified = await bot.api.sendMessage(
                        chat_id,
                        _l(language_code, 'error_not_enough_rights'),
                        default_extra
                    ).then(() => true, () => false)
                }
                // message thread not found - give up sending
            } else if (description.includes('message thread not found')) {
                console.log('Message thread not found, skipping message')
                // just a moment
            } else if (description.includes('too many requests')) {
                console.log(chat_id, 'sleep', telegramRetryAfter(e), 's')
            } else if (description.includes('failed to send message') && description.includes('#')) {
                // Handle specific media item failure: "failed to send message #N with the error message 'WEBPAGE_MEDIA_EMPTY'"
                const failed_index_match = description.match(/failed to send message #(\d+)/);
                if (failed_index_match && e.method === 'sendMediaGroup' && e.payload.media) {
                    const failed_index = parseInt(failed_index_match[1]) - 1; // Convert to 0-based index
                    if (failed_index >= 0 && failed_index < e.payload.media.length) {
                        const failed_media = e.payload.media[failed_index];
                        if (failed_media.media && typeof failed_media.media === 'string' && failed_media.media.includes('https://')) {
                            const failed_url = failed_media.media;
                            honsole.log(`[refetch] Media item #${failed_index + 1} failed`);
                            if (config.tg.refetch_api) {
                                (async () => {
                                    try {
                                        await axios.post(config.tg.refetch_api, {
                                            url: failed_url
                                        })
                                        honsole.log('[ok] refetch request completed')
                                    } catch (error) {
                                        logTelegramFailure(honsole, error, { errorCode: 'REFETCH_REQUEST_FAILED' })
                                    }
                                })()
                            }
                        }
                    }
                }
                // Don't return here, let it continue to check other error types
            } else if (description.includes('failed to get http url content') || description.includes('wrong file identifier/http url specified') || description.includes('wrong type of the web page content') || description.includes('group send failed') || description.includes('can\'t parse inputmedia') || description.includes('media not found')) {
                let photo_urls = []
                if (e.method === 'sendPhoto') {
                    photo_urls[0] = e.payload.photo
                } else if (e.method === 'sendMediaGroup' && e.payload.media) {
                    photo_urls = e.payload.media.filter(m => {
                        return m.media && typeof m.media === 'string' && m.media.includes('https://')
                    }).map(m => {
                        return m.media
                    })
                } else if (e.method === 'sendDocument') {
                    photo_urls[0] = e.payload.document
                }
                if (config.tg.refetch_api && photo_urls) {
                    (async () => {
                        try {
                            await axios.post(config.tg.refetch_api, {
                                url: photo_urls.join('\n')
                            })
                            honsole.log('[ok] refetch request completed')
                        } catch (error) {
                            logTelegramFailure(honsole, error, { errorCode: 'REFETCH_REQUEST_FAILED' })
                        }
                    })()
                }
            }
        }
    } catch (error) {
        logTelegramFailure(logger, error)
    }
    return { decision, userNotified, errorCode }
}

/**
 * Mark failed media item and schedule retry with download fallback
 * @param {Array} mg Media group array
 * @param {number} failed_index Failed item index (0-based)
 * @param {string} current_type Current media type that failed
 * @param {Array} mg_type_queue Media type queue to update
 * @returns {boolean} Success status
 */
export function markFailedMediaItem(mg, failed_index, current_type, mg_type_queue) {
    if (!queueLocalMediaRetry(mg, failed_index, current_type, mg_type_queue)) {
        honsole.warn(`Invalid media index ${failed_index + 1}, media group has ${mg.length} items`)
        return false
    }

    honsole.log(`Media item #${failed_index + 1} failed with ${current_type}, retrying only that item as a local upload`)
    return true
}

/**
 * Send media group with smart retry logic
 * - Parses Telegram error messages to identify specific failed media items
 * - Marks failed items as invalid and retries with local downloads
 * - Only retries failed items instead of entire media group
 * - Prevents infinite retries with configurable limit
 * @param {*} chat_id Telegram chat ID
 * @param {*} language_code User's language code for error messages
 * @param {*} mg Media group array
 * @param {*} extra Extra options for Telegram API
 * @param {*} mg_type Array of media types to try (e.g., ['r', 'o', 'dlr', 'dlo'])
 * @param {*} retryCount Current retry attempt count (internal use)
 * @returns Promise<object> Structured sent, stale_media, or failed result
 */
export async function sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type = []) {
    const bot = getBot()
    const hasInvalidMedia = mg.some(m => !m.media && !m.media_o && !m.media_r && !m.media_t)
    if (hasInvalidMedia) {
        honsole.warn('Media group contains invalid URLs, skipping send')
        return { kind: MediaSendKind.FAILED, code: 'TELEGRAM_MEDIA_INVALID' }
    }
    const chatAction = mg[0].type === 'document' ? 'upload_document' :
                      (mg[0].type === 'video' ? 'upload_video' : 'upload_photo')
    bot.api.sendChatAction(chat_id, chatAction, extra.message_thread_id ? {
        message_thread_id: extra.message_thread_id
    } : {}).catch(() => { })

    if (mg[0].type !== 'document') {
        const result = await runMediaGroupAttempts({
            mediaGroup: mg,
            mediaTypes: mg_type,
            buildMedia: (mediaGroup, currentType) => mg_filter(mediaGroup, currentType),
            sendMedia: media => bot.api.sendMediaGroup(chat_id, media, extra),
            classifyError: classifyMediaSendError,
            reportError: (error, fields) => catchily(error, chat_id, language_code, fields)
        })
        if (result.exhausted) {
            honsole.warn('Media group retry budget exhausted', chat_id, mg.length, 'items')
        }
        return result
    }

    const queue = [...mg_type]
    let lastError
    let lastDocumentClassification = null
    let lastFailedIndex = null
    let attempts = 0
    const attemptLimit = mg[0].type === 'document' ? 2 : 5
    for (let attempt = 1; attempt <= attemptLimit && queue.length > 0; attempt++) {
        attempts = attempt
        const currentType = queue.shift()
        try {
            const result = await bot.api.sendMediaGroup(chat_id, await mg_filter([...mg], currentType), extra)
            return { kind: MediaSendKind.SENT, result }
        } catch (error) {
            lastError = error
            const documentMode = mg[0].type === 'document'
            const mediaClassification = classifyMediaSendError(error)
            const documentClassification = documentMode
                ? classifyDocumentFailure(error, currentType.startsWith('dl') ? 'download' : 'send')
                : null
            lastDocumentClassification = documentClassification
            lastFailedIndex = mediaClassification.failedIndex
            const classification = documentMode
                ? {
                    stale: documentClassification.kind === MediaSendKind.STALE_MEDIA,
                    retryLocal: mediaClassification.retryLocal,
                    failedIndex: mediaClassification.failedIndex,
                    code: mediaClassification.retryLocal
                        ? mediaClassification.code
                        : documentClassification.code
                }
                : mediaClassification
            const catchResult = await catchily(error, chat_id, language_code, {
                notifyUser: !documentMode,
                attempt,
                failedIndex: Number.isInteger(classification.failedIndex)
                    ? classification.failedIndex + 1
                    : undefined,
                errorCode: classification.code
            })
            if (classification.stale) {
                return {
                    kind: MediaSendKind.STALE_MEDIA,
                    code: classification.code,
                    failedIndex: classification.failedIndex,
                    error,
                    attempts: attempt
                }
            }
            if (documentMode && !classification.retryLocal &&
                documentClassification.retryable === false) {
                const failedItem = mg[classification.failedIndex ?? 0]
                return {
                    kind: MediaSendKind.FAILED,
                    code: documentClassification.code,
                    error,
                    failedIndex: classification.failedIndex,
                    attempts: attempt,
                    recoveryUrl: publicDocumentRecoveryUrl(
                        failedItem?.media_o,
                        config.pixiv.pximgproxy
                    )
                }
            }
            if (classification.failedIndex !== null) {
                markFailedMediaItem(mg, classification.failedIndex, currentType, queue)
            } else if (catchResult.decision === CatchilyDecision.RETRY_TRANSPORT) {
                queue.unshift(currentType)
            } else if (catchResult.decision === CatchilyDecision.TERMINAL) {
                return {
                    kind: MediaSendKind.FAILED,
                    code: classification.code,
                    error,
                    failedIndex: classification.failedIndex,
                    attempts: attempt,
                    userNotified: catchResult.userNotified
                }
            }
        }
    }
    honsole.warn('Media group retry budget exhausted', chat_id, mg.length, 'items')
    if (mg[0].type === 'document') {
        return {
            kind: MediaSendKind.FAILED,
            code: lastDocumentClassification?.retryable
                ? 'TELEGRAM_DOCUMENT_RETRY_EXHAUSTED'
                : lastDocumentClassification?.code || 'TELEGRAM_DOCUMENT_SEND_FAILED',
            error: lastError,
            failedIndex: lastFailedIndex,
            attempts,
            recoveryUrl: publicDocumentRecoveryUrl(
                mg[0]?.media_o,
                config.pixiv.pximgproxy
            )
        }
    }
    return {
        kind: MediaSendKind.FAILED,
        code: 'TELEGRAM_MEDIA_RETRY_EXHAUSTED',
        error: lastError,
        failedIndex: lastFailedIndex,
        attempts
    }
}

/**
 * send photo with retry
 * @param {*} chat_id
 * @param {*} language_code
 * @param {*} photo_urls
 * @param {*} extra
 * @returns
 */
export async function sendPhotoWithRetry(chat_id, language_code, photo_urls = [], extra) {
    const bot = getBot()
    if (photo_urls.length === 0) {
        honsole.warn('error send photo', chat_id, 'candidate count', photo_urls.length)
        return { kind: MediaSendKind.FAILED, code: 'TELEGRAM_MEDIA_FALLBACK_EXHAUSTED' }
    }
    // Send upload_photo action
    bot.api.sendChatAction(chat_id, 'upload_photo', extra.message_thread_id ? {
        message_thread_id: extra.message_thread_id
    } : {}).catch(() => { })

    let lastError
    let userNotified = false
    const candidates = [...photo_urls]
    const attemptLimit = photo_urls.length + 1
    let attempts = 0
    while (attempts < attemptLimit && candidates.length > 0) {
        attempts++
        const candidate = candidates.shift()
        try {
            const photo = candidate.startsWith('dl-')
                ? new InputFile(await fetch_tmp_file(candidate.substring(3)))
                : candidate
            const result = await bot.api.sendPhoto(chat_id, photo, extra)
            return { kind: MediaSendKind.SENT, result, attempts }
        } catch (error) {
            lastError = error
            const classification = classifyMediaSendError(error)
            const catchResult = await catchily(error, chat_id, language_code, {
                attempt: attempts,
                errorCode: classification.code
            })
            if (classification.stale) {
                return {
                    kind: MediaSendKind.STALE_MEDIA,
                    code: classification.code,
                    error,
                    attempts
                }
            }
            if (catchResult.decision === CatchilyDecision.RETRY_TRANSPORT) {
                candidates.unshift(candidate)
            } else if (catchResult.decision === CatchilyDecision.TERMINAL) {
                userNotified = catchResult.userNotified
                break
            }
        }
    }
    honsole.warn('error send photo', chat_id, 'candidate count', photo_urls.length)
    return {
        kind: MediaSendKind.FAILED,
        code: 'TELEGRAM_MEDIA_SEND_FAILED',
        error: lastError,
        userNotified,
        attempts
    }
}

/**
 * sendDocumentWithRetry
 * @param {*} chat_id
 * @param {*} media_o - Can be URL or local file path
 * @param {*} extra
 */
export async function sendDocumentWithRetry(chat_id, media_o, extra, language_code = 'en') {
    const bot = getBot()
    // Send upload_document action
    bot.api.sendChatAction(chat_id, 'upload_document', extra.message_thread_id ? {
        message_thread_id: extra.message_thread_id
    } : {}).catch(() => { })

    extra = {
        ...extra,
        disable_content_type_detection: true
    }
    const delivery = await deliverDocument({
        mediaUrl: media_o,
        extra,
        createLocalInputFile: (path, filename) => new InputFile(path, filename),
        fetchRemoteFile: fetch_tmp_file,
        createBufferedInputFile: (data, filename) => new InputFile(data, filename),
        sendDocument: (file, sendExtra) => bot.api.sendDocument(chat_id, file, sendExtra),
        reportError: (error, fields) => catchily(error, chat_id, language_code, {
            ...fields,
            notifyUser: false
        })
    })
    delivery.recoveryUrl = publicDocumentRecoveryUrl(
        delivery.recoveryUrl,
        config.pixiv.pximgproxy
    )
    return delivery
}
