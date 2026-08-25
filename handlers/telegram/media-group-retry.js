import {
    MediaSendKind,
    queueLocalMediaRetry,
    selectMediaRetryType
} from '#handlers/telegram/media-send-result'
import { deliveryTraceEvent } from '#handlers/telegram/delivery-telemetry'

function traceFailedAttempt(mediaGroup, currentType, attempt, classification) {
    const failedIndex = classification.failedIndex
    const failedItem = Number.isInteger(failedIndex) ? mediaGroup[failedIndex] : null
    const selectedType = failedItem
        ? selectMediaRetryType(failedItem, currentType)
        : currentType
    deliveryTraceEvent('media_group_retry', {
        failedIndex: Number.isInteger(failedIndex) ? failedIndex + 1 : undefined,
        illustId: failedItem?.id,
        page: failedItem?.p,
        attempt,
        mediaType: selectedType,
        mediaMode: selectedType?.startsWith('dl') ? 'local' : 'remote',
        errorCode: classification.code
    })
}

export async function runMediaGroupAttempts(options) {
    const {
        mediaGroup,
        mediaTypes,
        buildMedia,
        sendMedia,
        classifyError,
        reportError,
        maxAttempts = 5
    } = options
    const queue = [...mediaTypes]
    let lastError
    let lastClassification

    for (let attempt = 1; attempt <= maxAttempts && queue.length > 0; attempt++) {
        const currentType = queue.shift()
        try {
            const result = await sendMedia(await buildMedia([...mediaGroup], currentType))
            return { kind: MediaSendKind.SENT, result, attempts: attempt }
        } catch (error) {
            lastError = error
            const classification = classifyError(error, currentType)
            lastClassification = classification
            traceFailedAttempt(mediaGroup, currentType, attempt, classification)
            if (classification.stale) {
                return {
                    kind: MediaSendKind.STALE_MEDIA,
                    code: classification.code,
                    failedIndex: classification.failedIndex,
                    error,
                    attempts: attempt
                }
            }
            if (classification.terminal) {
                return {
                    kind: MediaSendKind.FAILED,
                    code: classification.code,
                    failedIndex: classification.failedIndex,
                    error,
                    attempts: attempt
                }
            }

            const reportStatus = await reportError(error)
            if (classification.failedIndex !== null) {
                queueLocalMediaRetry(mediaGroup, classification.failedIndex, currentType, queue)
            } else if (reportStatus === 'redo') {
                queue.unshift(currentType)
            } else if (reportStatus === false) {
                return {
                    kind: MediaSendKind.FAILED,
                    code: classification.code,
                    error,
                    userNotified: true,
                    attempts: attempt
                }
            }
        }
    }

    return {
        kind: MediaSendKind.FAILED,
        code: options.exhaustedCode?.(lastClassification) || 'TELEGRAM_MEDIA_RETRY_EXHAUSTED',
        error: lastError,
        attempts: maxAttempts,
        exhausted: true,
        lastClassification
    }
}
