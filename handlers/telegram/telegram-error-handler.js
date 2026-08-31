import axios from 'axios'
import { _l } from '#handlers/telegram/i18n'
import {
    classifyMediaSendError,
    telegramErrorDescription,
    telegramRetryAfter
} from '#handlers/telegram/media-send-result'
import { logTelegramFailure } from '#handlers/telegram/delivery-telemetry'
import { reportAdminDeliveryError } from '#handlers/telegram/delivery-error-report'

export const CatchilyDecision = Object.freeze({
    NEXT_SOURCE: 'next_source',
    RETRY_TRANSPORT: 'retry_transport',
    TERMINAL: 'terminal'
})

const GENERIC_HTTP_CODES = new Set([
    'ERR_BAD_REQUEST',
    'ERR_BAD_RESPONSE',
    'PIXIV_DETAIL_REQUEST_FAILED',
    'PIXIV_DOCUMENT_DOWNLOAD_FAILED',
    'TELEGRAM_MEDIA_SEND_FAILED'
])

export async function handleTelegramError(e, chatId, languageCode = 'en', options) {
    const { bot, logger, masterId, refetchApi } = options
    const mediaFailure = classifyMediaSendError(e)
    const rawDescription = telegramErrorDescription(e)
    const description = rawDescription.toLowerCase()
    const httpStatus = Number(e?.response?.status)
    const isTelegramError = Boolean(e?.method || Number.isInteger(e?.error_code) || e?.ok === false)
    const preserveHttpStatus = !isTelegramError && Number.isInteger(httpStatus) && (
        !options.errorCode || GENERIC_HTTP_CODES.has(options.errorCode)
    )
    const errorCode = preserveHttpStatus
        ? `HTTP_${httpStatus}`
        : options.errorCode || mediaFailure.code
    const decision = mediaFailure.terminal
        ? CatchilyDecision.TERMINAL
        : description.includes('too many requests') || e?.error_code === 429
            ? CatchilyDecision.RETRY_TRANSPORT
            : CatchilyDecision.NEXT_SOURCE
    const failedIndex = Number.isInteger(mediaFailure.failedIndex)
        ? mediaFailure.failedIndex + 1
        : options.failedIndex
    const diagnosticFields = {
        requestId: options.requestId,
        chatId,
        illustIds: options.illustIds,
        illustId: options.illustId,
        page: options.page,
        method: options.method,
        errorCode,
        attempt: options.attempt,
        failedIndex
    }
    logTelegramFailure(logger, e, diagnosticFields)
    await reportAdminDeliveryError({
        error: e,
        masterId,
        sendMessage: (targetId, report) => bot.api.sendMessage(targetId, report),
        logger,
        ...diagnosticFields
    })

    let userNotified = false
    try {
        if (options.notifyUser !== false && description.includes('media_caption_too_long')) {
            userNotified = await bot.api.sendMessage(
                chatId,
                _l(languageCode, 'error_text_too_long'),
                { parse_mode: 'MarkdownV2' }
            ).then(() => true, () => false)
        } else if (options.notifyUser !== false && description.includes("can't parse entities: character")) {
            userNotified = await bot.api.sendMessage(
                chatId,
                _l(languageCode, 'error_format', rawDescription)
            ).then(() => true, () => false)
        } else if (options.notifyUser !== false && description.includes('not enough rights to send')) {
            userNotified = await bot.api.sendMessage(
                chatId,
                _l(languageCode, 'error_not_enough_rights'),
                { parse_mode: 'MarkdownV2' }
            ).then(() => true, () => false)
        } else if (description.includes('message thread not found')) {
            logger.log('Message thread not found, skipping message')
        } else if (description.includes('too many requests')) {
            logger.log(chatId, 'sleep', telegramRetryAfter(e), 's')
        }
        scheduleRefetch(e, description, refetchApi, logger)
    } catch (error) {
        logTelegramFailure(logger, error)
    }
    return { decision, userNotified, errorCode }
}

function scheduleRefetch(error, description, refetchApi, logger) {
    if (!refetchApi) return
    let urls = []
    if (description.includes('failed to send message') && error?.method === 'sendMediaGroup') {
        const match = description.match(/failed to send message #(\d+)/)
        const item = match ? error?.payload?.media?.[Number.parseInt(match[1], 10) - 1] : null
        if (typeof item?.media === 'string' && item.media.startsWith('https://')) urls = [item.media]
    } else if (error?.method === 'sendPhoto' && typeof error?.payload?.photo === 'string') {
        urls = [error.payload.photo]
    } else if (error?.method === 'sendDocument' && typeof error?.payload?.document === 'string') {
        urls = [error.payload.document]
    } else if (error?.method === 'sendMediaGroup' && Array.isArray(error?.payload?.media)) {
        urls = error.payload.media.map(item => item.media).filter(url => typeof url === 'string' && url.startsWith('https://'))
    }
    if (urls.length === 0) return
    void axios.post(refetchApi, { url: urls.join('\n') }).then(
        () => logger.log('[ok] refetch request completed'),
        refetchError => logTelegramFailure(logger, refetchError, { errorCode: 'REFETCH_REQUEST_FAILED' })
    )
}
