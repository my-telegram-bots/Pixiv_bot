// Only source preparation and an explicit media rejection are safe to replay.
// 429 retries belong to the transport transformer, never an outer send loop.
export function canRetryMediaSource(error, classification, phase = 'send') {
    if (classification.stale || classification.terminal || error?.code?.startsWith('MEDIA_QUEUE_')) return false
    if (phase === 'prepare') return true
    return error?.error_code === 400 && Boolean(
        classification.retryLocal || classification.retryRegular
    )
}

export function isDefiniteTelegramRejection(error) {
    return Number.isInteger(error?.error_code) && error.error_code >= 400 && error.error_code < 500
}

export function releaseBufferedErrorPayload(error) {
    // Grammy errors retain their request payload. Preserve URL diagnostics but
    // do not retain uploaded buffers in a completed failure or retry result.
    const payload = error?.payload
    if (!payload || typeof payload !== 'object') return
    const clear = (object, key) => {
        if (object?.[key] && typeof object[key] !== 'string') {
            try { delete object[key] } catch { /* Read-only diagnostic payload. */ }
        }
    }
    for (const key of ['photo', 'document', 'animation', 'video']) clear(payload, key)
    if (Array.isArray(payload.media)) {
        for (const item of payload.media) clear(item, 'media')
    }
}
