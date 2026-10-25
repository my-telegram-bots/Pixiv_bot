import { MediaSendKind, classifyMediaSendError } from '#handlers/telegram/media-send-result'
import { logTelegramFailure } from '#handlers/telegram/delivery-telemetry'
import { withMediaBufferBudget } from '#handlers/utils/media-buffer-budget'
import { canRetryMediaSource, releaseBufferedErrorPayload } from '#handlers/telegram/send-retry-policy'

export async function deliverAnimation({ media, send, download, allowLocalFallback, reportError, logger }) {
    let error
    try {
        return { kind: MediaSendKind.SENT, result: await send(media) }
    } catch (sendError) {
        error = sendError
    }

    const initial = classifyMediaSendError(error)
    if (allowLocalFallback && initial.retryLocal && canRetryMediaSource(error, initial)) {
        try {
            return await withMediaBufferBudget(1, async () => {
                const localMedia = await download(media)
                return { kind: MediaSendKind.SENT, result: await send(localMedia) }
            })
        } catch (fallbackError) {
            error = fallbackError
        }
    }

    const classification = classifyMediaSendError(error)
    releaseBufferedErrorPayload(error)
    let report
    if (!classification.stale) {
        try {
            report = await reportError(error)
        } catch (reportError) {
            logTelegramFailure(logger, error, { method: 'sendAnimation', errorCode: classification.code })
            logTelegramFailure(logger, reportError, { errorCode: 'ADMIN_ERROR_REPORT_FAILED' })
        }
    }
    return {
        kind: classification.stale ? MediaSendKind.STALE_MEDIA : MediaSendKind.FAILED,
        code: report?.errorCode || classification.code,
        userNotified: report?.userNotified === true,
        userNotificationUncertain: report?.userNotificationUncertain === true,
        userNotificationFailed: report?.userNotificationFailed === true,
        error
    }
}
