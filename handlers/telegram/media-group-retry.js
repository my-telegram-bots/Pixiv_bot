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
    let attempts = 0

    for (let attempt = 1; attempt <= maxAttempts && queue.length > 0; attempt++) {
        attempts = attempt
        const currentType = queue.shift()
        try {
            const result = await sendMedia(await buildMedia([...mediaGroup], currentType))
            return { kind: MediaSendKind.SENT, result, attempts: attempt }
        } catch (error) {
            lastError = error
            const classification = classifyError(error, currentType)
            lastClassification = classification
            traceFailedAttempt(mediaGroup, currentType, attempt, classification)
            let reportResult = {
                decision: classification.terminal ? 'terminal' : 'next_source',
                userNotified: false,
                errorCode: classification.code
            }
            try {
                reportResult = await reportError(error, {
                    attempt,
                    failedIndex: Number.isInteger(classification.failedIndex)
                        ? classification.failedIndex + 1
                        : undefined,
                    errorCode: classification.code
                })
            } catch {
                // Reporting must never change transport retry or continuation.
            }
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

            if (classification.failedIndex !== null) {
                queueLocalMediaRetry(mediaGroup, classification.failedIndex, currentType, queue)
            } else if (reportResult.decision === 'retry_transport') {
                queue.unshift(currentType)
            } else if (reportResult.decision === 'terminal') {
                return {
                    kind: MediaSendKind.FAILED,
                    code: classification.code,
                    error,
                    userNotified: reportResult.userNotified,
                    attempts: attempt
                }
            }
        }
    }

    return {
        kind: MediaSendKind.FAILED,
        code: options.exhaustedCode?.(lastClassification) || 'TELEGRAM_MEDIA_RETRY_EXHAUSTED',
        error: lastError,
        failedIndex: lastClassification?.failedIndex,
        attempts,
        exhausted: true,
        lastClassification
    }
}
