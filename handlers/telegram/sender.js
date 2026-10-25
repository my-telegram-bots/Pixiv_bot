import { withMediaBufferBudget } from '#handlers/utils/media-buffer-budget'
import { mediaGroupBufferWeight } from '#handlers/telegram/media-buffer-weight'
import { deliverPhoto } from '#handlers/telegram/photo-delivery'
import { getBot } from '../../bot.js'
import { honsole, fetch_tmp_file } from '../common.js'
import { mg_filter } from './mediagroup.js'
import { InputFile } from 'grammy'
import {
    MediaSendKind,
    classifyMediaSendError
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

    const documentMode = mg[0].type === 'document'
    const result = await runMediaGroupAttempts({
        mediaGroup: mg,
        mediaTypes: mg_type,
        maxAttempts: documentMode ? 2 : 5,
        runAttempt: (type, task) => withMediaBufferBudget(mediaGroupBufferWeight(mg, type), task),
        buildMedia: (items, type) => mg_filter(items, type),
        sendMedia: media => bot.api.sendMediaGroup(chat_id, media, extra),
        classifyError: (error, type, phase) => {
            const media = classifyMediaSendError(error, type)
            if (!documentMode) return media
            const document = classifyDocumentFailure(error, phase === 'prepare' ? 'download' : 'send')
            return {
                ...media,
                retryRegular: false,
                stale: document.kind === MediaSendKind.STALE_MEDIA,
                terminal: media.terminal || (!media.retryLocal && document.retryable === false),
                code: media.retryLocal ? media.code : document.code
            }
        },
        reportError: (error, fields) => {
            const item = Number.isInteger(fields.failedIndex) ? mg[fields.failedIndex - 1] : null
            return catchily(error, chat_id, language_code, {
                ...fields,
                notifyUser: !documentMode,
                illustId: item?.id,
                page: item?.p,
                method: 'sendMediaGroup'
            })
        },
        exhaustedCode: documentMode ? () => 'TELEGRAM_DOCUMENT_RETRY_EXHAUSTED' : undefined
    })
    if (documentMode && result.kind !== MediaSendKind.SENT) {
        result.recoveryUrl = publicDocumentRecoveryUrl(
            mg[result.failedIndex ?? 0]?.media_o, config.pixiv.pximgproxy
        )
    }
    if (result.exhausted) honsole.warn('Media group retry budget exhausted', chat_id, mg.length, 'items')
    return result
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

    const candidates = photo_urls.map(candidate => typeof candidate === 'string'
        ? { source: candidate.startsWith('dl-') ? candidate.substring(3) : candidate, local: candidate.startsWith('dl-') }
        : candidate)
    return deliverPhoto({
        candidates,
        runAttempt: (candidate, task) => withMediaBufferBudget(candidate.local ? 1 : 0, task),
        prepare: async candidate => candidate.local
            ? new InputFile(await fetch_tmp_file(candidate.source))
            : candidate.source,
        send: photo => bot.api.sendPhoto(chat_id, photo, extra),
        reportError: (error, fields) => catchily(error, chat_id, language_code, fields)
    })
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
    const delivery = await withMediaBufferBudget(String(media_o).includes('tmp/') ? 0 : 1, () => deliverDocument({
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
    }))
    delivery.recoveryUrl = publicDocumentRecoveryUrl(
        delivery.recoveryUrl,
        config.pixiv.pximgproxy
    )
    return delivery
}
