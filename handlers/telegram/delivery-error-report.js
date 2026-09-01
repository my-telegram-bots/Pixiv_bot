import {
    currentDeliveryTraceCorrelation,
    logTelegramFailure,
    safeDeliveryErrorCode
} from '#handlers/telegram/delivery-telemetry'
import { telegramErrorDescription } from '#handlers/telegram/media-send-result'

export const ADMIN_ERROR_REPORT_LIMIT = 1000
export const ADMIN_FLOOD_OCCURRENCE_LIMIT = 9999
const REASON_LIMIT = 240
const defaultSchedule = (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs)
    timer.unref?.()
    return timer
}

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
        .replace(/\b(?:caption|payload|media|document|photo)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[redacted-field]')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return truncate(reason || 'No safe error reason available', REASON_LIMIT)
}

export function formatAdminDeliveryError(error, fields = {}) {
    const correlation = currentDeliveryTraceCorrelation(fields)
    const illust = correlation.illustId ?? (
        correlation.illustIds?.length > 0 ? correlation.illustIds.join(',') : 'unknown'
    )
    const parts = [
        '[delivery-error]',
        `request=${sanitizeLabel(correlation.requestId, 'unscoped')}`,
        `chat=${correlation.chatId ?? 'unknown'}`,
        `method=${sanitizeLabel(fields.method || error?.method, 'unknown')}`,
        `code=${safeDeliveryErrorCode(error, fields.errorCode)}`,
        `illust=${illust}`
    ]
    if (correlation.page !== undefined) parts.push(`page=${correlation.page}`)
    if (correlation.attempt !== undefined) parts.push(`attempt=${correlation.attempt}`)
    if (fields.transportAttempts !== undefined) parts.push(`transportAttempts=${fields.transportAttempts}`)
    if (fields.retryAfter !== undefined) parts.push(`retryAfter=${fields.retryAfter}`)
    if (fields.occurrences !== undefined) parts.push(`occurrences=${fields.occurrences}`)
    if (correlation.failedIndex !== undefined) parts.push(`failedItem=${correlation.failedIndex}`)
    parts.push(`reason=${safeDeliveryErrorReason(error)}`)
    return truncate(parts.join(' '), ADMIN_ERROR_REPORT_LIMIT)
}

export function createAdminFloodReportAggregator(options = {}) {
    const schedule = options.schedule || defaultSchedule
    const now = options.now || Date.now
    const buckets = new Map()

    return {
        queue({ key, windowMs, error, fields, send, logger }) {
            const existing = buckets.get(key)
            if (existing && existing.expiresAt > now()) {
                existing.occurrences = Math.min(
                    ADMIN_FLOOD_OCCURRENCE_LIMIT,
                    existing.occurrences + 1
                )
                existing.retryAfter = Math.max(existing.retryAfter, fields.retryAfter || 0)
                existing.expiresAt = Math.max(existing.expiresAt, now() + windowMs)
                return
            }
            if (existing) buckets.delete(key)

            const bucket = {
                occurrences: 1,
                retryAfter: fields.retryAfter || 0,
                expiresAt: now() + windowMs,
                error,
                fields,
                send,
                logger
            }
            buckets.set(key, bucket)
            schedule(flush, windowMs)

            async function flush() {
                if (buckets.get(key) !== bucket) return
                const remainingMs = bucket.expiresAt - now()
                if (remainingMs > 0) {
                    schedule(flush, remainingMs)
                    return
                }
                buckets.delete(key)
                try {
                    await bucket.send(formatAdminDeliveryError(bucket.error, {
                        ...bucket.fields,
                        retryAfter: bucket.retryAfter,
                        occurrences: bucket.occurrences
                    }))
                } catch (reportError) {
                    logTelegramFailure(bucket.logger, reportError, {
                        errorCode: 'ADMIN_ERROR_REPORT_FAILED'
                    })
                }
            }
        }
    }
}

const adminFloodReportAggregator = createAdminFloodReportAggregator()

export async function reportAdminDeliveryError(options) {
    const {
        error,
        masterId,
        sendMessage,
        logger,
        floodAggregator = adminFloodReportAggregator,
        ...fields
    } = options
    if (!Number.isSafeInteger(masterId) || masterId <= 0 || typeof sendMessage !== 'function') {
        return false
    }
    const retryAfter = Number(error?.parameters?.retry_after)
    if (error?.error_code === 429 && Number.isFinite(retryAfter) && retryAfter >= 0) {
        const method = fields.method || error?.method || 'unknown'
        floodAggregator.queue({
            key: `${masterId}:${fields.chatId ?? 'unknown'}:${method}`,
            windowMs: Math.max(1000, retryAfter * 1000),
            error,
            fields: { ...fields, retryAfter },
            send: report => sendMessage(masterId, report),
            logger
        })
        return true
    }
    try {
        await sendMessage(masterId, formatAdminDeliveryError(error, fields))
        return true
    } catch (reportError) {
        logTelegramFailure(logger, reportError, { errorCode: 'ADMIN_ERROR_REPORT_FAILED' })
        return false
    }
}
