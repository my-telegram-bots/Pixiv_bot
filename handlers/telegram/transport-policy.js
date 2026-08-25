export const TELEGRAM_UPDATE_CONCURRENCY = 500
export const TELEGRAM_CLIENT_TIMEOUT_SECONDS = 60

export const TELEGRAM_THROTTLER_OPTIONS = Object.freeze({
    global: Object.freeze({
        reservoir: 30,
        reservoirRefreshAmount: 30,
        reservoirRefreshInterval: 1000
    }),
    group: Object.freeze({
        maxConcurrent: 4,
        minTime: 1000,
        reservoir: 20,
        reservoirRefreshAmount: 20,
        reservoirRefreshInterval: 60000
    }),
    out: Object.freeze({
        maxConcurrent: 2,
        minTime: 1000
    })
})

export const TELEGRAM_AUTO_RETRY_OPTIONS = Object.freeze({
    maxDelaySeconds: 10,
    maxRetryAttempts: 1,
    rethrowHttpErrors: true,
    rethrowInternalServerErrors: false
})
