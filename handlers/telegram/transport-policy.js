export const TELEGRAM_UPDATE_CONCURRENCY = 500
export const TELEGRAM_CLIENT_TIMEOUT_SECONDS = 60

// Bottleneck adds an internal `id` to these option objects at runtime.
// Keep them mutable or the first Telegram API request will fail.
export const TELEGRAM_THROTTLER_OPTIONS = {
    global: {
        reservoir: 30,
        reservoirRefreshAmount: 30,
        reservoirRefreshInterval: 1000
    },
    group: {
        maxConcurrent: 4,
        minTime: 1000,
        reservoir: 20,
        reservoirRefreshAmount: 20,
        reservoirRefreshInterval: 60000
    },
    out: {
        maxConcurrent: 2,
        minTime: 1000
    }
}

export const TELEGRAM_AUTO_RETRY_OPTIONS = Object.freeze({
    maxDelaySeconds: 10,
    maxRetryAttempts: 1,
    rethrowHttpErrors: true,
    rethrowInternalServerErrors: false
})

export const TELEGRAM_DELIVERY_GATE_OPTIONS = Object.freeze({
    mediaWeight: Object.freeze({
        capacity: 20,
        windowMs: 60_000
    }),
    flood: Object.freeze({
        maxWaitSeconds: TELEGRAM_AUTO_RETRY_OPTIONS.maxDelaySeconds
    })
})
