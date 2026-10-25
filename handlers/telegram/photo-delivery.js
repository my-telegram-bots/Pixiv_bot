import { MediaSendKind, classifyMediaSendError } from '#handlers/telegram/media-send-result'
import { canRetryMediaSource, releaseBufferedErrorPayload } from '#handlers/telegram/send-retry-policy'

export async function deliverPhoto({ candidates, prepare, send, reportError, runAttempt = (_item, task) => task() }) {
    const queue = [...candidates]
    let lastError
    let lastCode = 'TELEGRAM_MEDIA_FALLBACK_EXHAUSTED'
    let userNotified = false
    let userNotificationUncertain = false
    let userNotificationFailed = false
    let attempts = 0
    while (queue.length) {
        const candidate = queue.shift()
        attempts++
        let phase = 'prepare'
        try {
            const result = await runAttempt(candidate, async () => {
                const photo = await prepare(candidate)
                phase = 'send'
                return send(photo)
            })
            return { kind: MediaSendKind.SENT, result, attempts }
        } catch (error) {
            lastError = error
            let classification = classifyMediaSendError(error, candidate.type)
            releaseBufferedErrorPayload(error)
            if (classification.retryRegular && !queue.some(item => ['r', 'dlr'].includes(item.type))) {
                classification = classifyMediaSendError(error, 'r')
            }
            const retry = canRetryMediaSource(error, classification, phase)
            if (classification.retryRegular && retry) continue
            let report
            try {
                report = await reportError(error, {
                    method: 'sendPhoto', attempt: attempts,
                    mediaType: candidate.type, errorCode: classification.code
                })
            } catch {
                // Diagnostic delivery cannot decide whether another send is safe.
            }
            userNotified ||= report?.userNotified === true
            userNotificationUncertain ||= report?.userNotificationUncertain === true
            userNotificationFailed ||= report?.userNotificationFailed === true
            lastCode = report?.errorCode || classification.code
            if (!retry) {
                return {
                    kind: classification.stale ? MediaSendKind.STALE_MEDIA : MediaSendKind.FAILED,
                    code: lastCode, error, attempts, userNotified, userNotificationUncertain, userNotificationFailed
                }
            }
        }
    }
    return { kind: MediaSendKind.FAILED, code: lastCode, error: lastError, attempts, userNotified, userNotificationUncertain, userNotificationFailed }
}
