import { logTelegramFailure } from '#handlers/telegram/delivery-telemetry'
import { isDefiniteTelegramRejection } from '#handlers/telegram/send-retry-policy'

export const FailureNotificationState = Object.freeze({
    PENDING: 'pending',
    SENT: 'sent',
    FAILED: 'failed',
    SUPPRESSED: 'suppressed'
})

const inFlight = new WeakMap()

export function recordFailureNotification(lifecycle, result) {
    if (result.userNotified) {
        lifecycle.failureNotified = true
        lifecycle.failureNotificationState = FailureNotificationState.SENT
    } else if ((result.userNotificationUncertain || result.userNotificationFailed) && !lifecycle.failureNotified) {
        lifecycle.failureNotificationState = FailureNotificationState.FAILED
        lifecycle.failureNotificationRetryable = !result.userNotificationUncertain
        lifecycle.failureNotificationAttempts = Math.max(1, lifecycle.failureNotificationAttempts || 0)
        lifecycle.failureNotificationDeferred = !result.userNotificationUncertain
    }
}

function resultFailure(result) {
    return result?.ok === false ? result : null
}

/**
 * Sends an illustration failure notification once its delivery outcome is known.
 * A confirmed Telegram 4xx rejection receives one later-boundary retry; timeout
 * and 5xx outcomes remain failed because Telegram may already have delivered it.
 */
export function notifyFailureOnce({ lifecycle, send, logger }) {
    if (lifecycle.failureNotified || lifecycle.failureNotificationState === FailureNotificationState.SENT) {
        return Promise.resolve(FailureNotificationState.SENT)
    }
    if (lifecycle.errorCode === 'TELEGRAM_FLOOD_GATE_ACTIVE') {
        lifecycle.failureNotificationState = FailureNotificationState.SUPPRESSED
        return Promise.resolve(FailureNotificationState.SUPPRESSED)
    }

    const current = inFlight.get(lifecycle)
    if (current) return current

    if (lifecycle.failureNotificationDeferred) {
        lifecycle.failureNotificationDeferred = false
        return Promise.resolve(FailureNotificationState.FAILED)
    }

    const attempts = lifecycle.failureNotificationAttempts || 0
    if (lifecycle.failureNotificationState === FailureNotificationState.FAILED &&
        (!lifecycle.failureNotificationRetryable || attempts >= 2)) {
        return Promise.resolve(FailureNotificationState.FAILED)
    }

    lifecycle.failureNotificationState = FailureNotificationState.PENDING
    lifecycle.failureNotificationAttempts = attempts + 1
    const operation = Promise.resolve()
        .then(send)
        .then(result => {
            const error = resultFailure(result)
            if (error) throw error
            lifecycle.failureNotified = true
            lifecycle.failureNotificationState = FailureNotificationState.SENT
            return FailureNotificationState.SENT
        })
        .catch(error => {
            lifecycle.failureNotificationState = FailureNotificationState.FAILED
            lifecycle.failureNotificationRetryable = isDefiniteTelegramRejection(error)
            logTelegramFailure(logger, error, {
                errorCode: 'ILLUSTRATION_FAILURE_NOTIFICATION_FAILED'
            })
            return FailureNotificationState.FAILED
        })
        .finally(() => inFlight.delete(lifecycle))
    inFlight.set(lifecycle, operation)
    return operation
}
