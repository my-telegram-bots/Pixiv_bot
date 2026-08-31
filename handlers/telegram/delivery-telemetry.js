import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

const deliveryTraceStorage = new AsyncLocalStorage()
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/

const allowedFields = new Set([
    'requestId',
    'stage',
    'timestamp',
    'elapsedMs',
    'durationMs',
    'chatId',
    'userId',
    'deliveryMode',
    'illustIds',
    'illustId',
    'page',
    'resolvedCount',
    'method',
    'status',
    'errorCode',
    'failedIndex',
    'attempt',
    'retryAfter',
    'mediaType',
    'mediaMode'
])

function safeInteger(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
        const parsed = Number(value)
        if (Number.isSafeInteger(parsed)) return parsed
    }
    return undefined
}

export function safeDeliveryErrorCode(error, preferredCode) {
    if (typeof preferredCode === 'string' && SAFE_CODE.test(preferredCode)) {
        return preferredCode
    }
    for (const value of [error?.code, error?.cause?.code]) {
        if (typeof value === 'string' && SAFE_CODE.test(value)) return value
    }
    const apiCode = safeInteger(error?.error_code)
    return apiCode === undefined ? 'TELEGRAM_REQUEST_FAILED' : `TELEGRAM_API_${apiCode}`
}

function safeFields(fields) {
    const result = {}
    for (const [key, value] of Object.entries(fields)) {
        if (!allowedFields.has(key) || value === undefined || value === null) continue
        if (key === 'illustIds') {
            result[key] = Array.isArray(value)
                ? value.map(safeInteger).filter(item => item !== undefined)
                : []
        } else if (['chatId', 'userId', 'illustId', 'page', 'resolvedCount', 'failedIndex', 'attempt', 'retryAfter', 'durationMs', 'elapsedMs'].includes(key)) {
            const integer = safeInteger(value)
            if (integer !== undefined) result[key] = integer
        } else if (key === 'errorCode') {
            if (typeof value === 'string' && SAFE_CODE.test(value)) result[key] = value
        } else if (typeof value === 'string' || typeof value === 'boolean') {
            result[key] = value
        }
    }
    return result
}

export function createDeliveryTraceContext(ctx, logger, options = {}) {
    return {
        requestId: options.requestId || randomUUID(),
        startedAt: options.now?.() ?? Date.now(),
        now: options.now || Date.now,
        logger,
        chatId: ctx.chat_id ?? ctx.message?.chat?.id,
        userId: ctx.user_id ?? ctx.from?.id
    }
}

export function runWithDeliveryTrace(context, callback) {
    return deliveryTraceStorage.run(context, callback)
}

export function runWithDeliveryTraceFields(fields, callback) {
    const context = deliveryTraceStorage.getStore()
    if (!context) return callback()
    return deliveryTraceStorage.run({ ...context, ...safeFields(fields) }, callback)
}

export function updateDeliveryTraceFields(fields) {
    const context = deliveryTraceStorage.getStore()
    if (!context) return
    Object.assign(context, safeFields(fields))
}

export function currentDeliveryTraceCorrelation(fields = {}) {
    const context = deliveryTraceStorage.getStore()
    return safeFields({
        requestId: context?.requestId,
        chatId: fields.chatId ?? context?.chatId,
        attempt: fields.attempt,
        failedIndex: fields.failedIndex
    })
}

export function deliveryTraceEvent(stage, fields = {}) {
    const context = deliveryTraceStorage.getStore()
    if (!context?.logger) return
    const now = context.now()
    const record = safeFields({
        requestId: context.requestId,
        stage,
        timestamp: new Date(now).toISOString(),
        elapsedMs: Math.max(0, now - context.startedAt),
        chatId: fields.chatId ?? context.chatId,
        userId: context.userId,
        deliveryMode: context.deliveryMode,
        illustIds: context.illustIds,
        illustId: context.illustId,
        page: context.page,
        ...fields
    })
    try {
        context.logger.log('[delivery]', JSON.stringify(record))
    } catch {
        // Diagnostics must never interrupt the delivery they describe.
    }
}

export function logTelegramFailure(logger, error, fields = {}) {
    const record = safeFields({
        stage: 'telegram_error',
        method: error?.method,
        errorCode: safeDeliveryErrorCode(error),
        failedIndex: fields.failedIndex,
        retryAfter: error?.parameters?.retry_after,
        ...fields
    })
    const context = deliveryTraceStorage.getStore()
    if (context) {
        deliveryTraceEvent('telegram_error', record)
    } else {
        try {
            logger.warn('[telegram-error]', JSON.stringify(record))
        } catch {
            // Diagnostics must never interrupt the delivery they describe.
        }
    }
    return record
}

export function createTelegramAttemptTraceTransformer(options = {}) {
    const now = options.now || Date.now
    return async (previous, method, payload, signal) => {
        const startedAt = now()
        deliveryTraceEvent('api_started', { method, chatId: payload?.chat_id })
        try {
            const response = await previous(method, payload, signal)
            const fields = {
                method,
                chatId: payload?.chat_id,
                durationMs: Math.max(0, now() - startedAt),
                status: response?.ok === false ? 'failed' : 'sent'
            }
            if (response?.ok === false) {
                fields.errorCode = safeDeliveryErrorCode(response)
                deliveryTraceEvent('api_failed', fields)
            } else {
                deliveryTraceEvent('api_finished', fields)
            }
            return response
        } catch (error) {
            deliveryTraceEvent('api_failed', {
                method,
                chatId: payload?.chat_id,
                durationMs: Math.max(0, now() - startedAt),
                status: 'failed',
                errorCode: safeDeliveryErrorCode(error)
            })
            throw error
        }
    }
}

export function createTelegramQueueTraceTransformer() {
    return async (previous, method, payload, signal) => {
        deliveryTraceEvent('telegram_queued', { method, chatId: payload?.chat_id })
        return previous(method, payload, signal)
    }
}
