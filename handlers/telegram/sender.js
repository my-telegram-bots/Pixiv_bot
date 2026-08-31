import { getBot } from '../../bot.js'
import { honsole, fetch_tmp_file, isStaleMediaError } from '../common.js'
import { mg_filter } from './mediagroup.js'
import { InputFile } from 'grammy'
import {
    MediaSendKind,
    classifyMediaSendError,
    queueLocalMediaRetry
} from './media-send-result.js'
import { runMediaGroupAttempts } from '#handlers/telegram/media-group-retry'
import {
    CatchilyDecision,
    handleTelegramError
} from '#handlers/telegram/telegram-error-handler'
import {
    classifyDocumentFailure,
    deliverDocument,
    publicDocumentRecoveryUrl
} from '#handlers/telegram/document-delivery'

export { MediaSendKind, classifyMediaSendError }

export { CatchilyDecision }

let runtimeConfigPromise

function loadRuntimeConfig() {
    runtimeConfigPromise ||= import('../../config.js').then(module => module.default)
    return runtimeConfigPromise
}

/**
 * catch error report && reply
 * @param {*} e error
 * @param {*} chat_id chat_id
 * @param {*} language_code language code
 */
export async function catchily(e, chat_id, language_code = 'en', options = {}) {
    const bot = options.bot || getBot()
    const logger = options.logger || honsole
    const runtimeConfig = options.config || (
        options.masterId === undefined ? await loadRuntimeConfig() : { tg: {} }
    )
    const masterId = options.masterId ?? runtimeConfig.tg.master_id
    const refetchApi = options.refetchApi ?? runtimeConfig.tg.refetch_api
    return handleTelegramError(e, chat_id, language_code, {
        ...options,
        bot,
        logger,
        masterId,
        refetchApi
    })
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
    const config = await loadRuntimeConfig()
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
            reportError: (error, fields) => {
                const item = Number.isInteger(fields.failedIndex)
                    ? mg[fields.failedIndex - 1]
                    : null
                return catchily(error, chat_id, language_code, {
                    ...fields,
                    illustId: item?.id,
                    page: item?.p,
                    method: 'sendMediaGroup'
                })
            }
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
                illustId: Number.isInteger(classification.failedIndex)
                    ? mg[classification.failedIndex]?.id
                    : undefined,
                page: Number.isInteger(classification.failedIndex)
                    ? mg[classification.failedIndex]?.p
                    : undefined,
                method: 'sendMediaGroup',
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
                method: 'sendPhoto',
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
    const config = await loadRuntimeConfig()
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
            method: 'sendDocument',
            notifyUser: false
        })
    })
    delivery.recoveryUrl = publicDocumentRecoveryUrl(
        delivery.recoveryUrl,
        config.pixiv.pximgproxy
    )
    return delivery
}
