import {
    currentDeliveryTraceCorrelation,
    logTelegramFailure,
    safeDeliveryErrorCode
} from '#handlers/telegram/delivery-telemetry'
import { telegramErrorDescription } from '#handlers/telegram/media-send-result'

export const ADMIN_ERROR_REPORT_LIMIT = 1000
const REASON_LIMIT = 240

function truncate(value, limit) {
    return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

function sanitizeLabel(value, fallback, limit = 80) {
    const normalized = String(value || '')
        .replace(/[^a-z0-9_.:-]/gi, '_')
        .slice(0, limit)
    return normalized || fallback
}

export function safeDeliveryErrorReason(error) {
    const reason = telegramErrorDescription(error)
        .replace(/\bhttps?:\/\/\S+/gi, '[redacted-url]')
        .replace(/\b\d{5,}:[a-z0-9_-]{20,}\b/gi, '[redacted-token]')
        .replace(/\b(caption|payload|media|document|photo)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return truncate(reason || 'No safe error reason available', REASON_LIMIT)
}

export function formatAdminDeliveryError(error, fields = {}) {
    const correlation = currentDeliveryTraceCorrelation(fields)
    const parts = [
        '[delivery-error]',
        `request=${sanitizeLabel(correlation.requestId, 'unscoped')}`,
        `chat=${correlation.chatId ?? 'unknown'}`,
        `method=${sanitizeLabel(error?.method, 'unknown')}`,
        `code=${safeDeliveryErrorCode(error, fields.errorCode)}`,
        `reason=${safeDeliveryErrorReason(error)}`
    ]
    if (correlation.attempt !== undefined) parts.push(`attempt=${correlation.attempt}`)
    if (correlation.failedIndex !== undefined) parts.push(`failedItem=${correlation.failedIndex}`)
    return truncate(parts.join(' '), ADMIN_ERROR_REPORT_LIMIT)
}

export async function reportAdminDeliveryError(options) {
    const {
        error,
        masterId,
        sendMessage,
        logger,
        ...fields
    } = options
    if (!Number.isSafeInteger(masterId) || masterId <= 0 || typeof sendMessage !== 'function') {
        return false
    }
    try {
        await sendMessage(masterId, formatAdminDeliveryError(error, fields))
        return true
    } catch (reportError) {
        logTelegramFailure(logger, reportError, { errorCode: 'ADMIN_ERROR_REPORT_FAILED' })
        return false
    }
}
