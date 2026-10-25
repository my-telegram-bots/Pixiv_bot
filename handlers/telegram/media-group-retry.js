import {
    MediaSendKind,
    queueLocalMediaRetry,
    selectMediaRetryType
} from '#handlers/telegram/media-send-result'
import { deliveryTraceEvent } from '#handlers/telegram/delivery-telemetry'
import { canRetryMediaSource, releaseBufferedErrorPayload } from '#handlers/telegram/send-retry-policy'

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
        maxAttempts = 5,
        runAttempt = (_type, task) => task()
    } = options
    const queue = [...mediaTypes]
    let lastError
    let lastClassification
    let knownFailedIndex = null
    let attempts = 0
    let userNotified = false
    let userNotificationUncertain = false
    let userNotificationFailed = false

    for (let attempt = 1; attempt <= maxAttempts && queue.length > 0; attempt++) {
        attempts = attempt
        const currentType = queue.shift()
        let phase = 'prepare'
        try {
            const result = await runAttempt(currentType, async () => {
                const media = await buildMedia([...mediaGroup], currentType)
                phase = 'send'
                return sendMedia(media)
            })
            return { kind: MediaSendKind.SENT, result, attempts: attempt }
        } catch (error) {
            lastError = error
            let classification = classifyError(error, currentType, phase)
            releaseBufferedErrorPayload(error)
            if (Number.isInteger(classification.failedIndex)) {
                knownFailedIndex = classification.failedIndex
            } else if (classification.code === 'TELEGRAM_PHOTO_TOO_LARGE' &&
                Number.isInteger(knownFailedIndex)) {
                classification = { ...classification, failedIndex: knownFailedIndex }
            }
            if (classification.retryRegular && canRetryMediaSource(error, classification, phase)) {
                const failedItems = Number.isInteger(classification.failedIndex)
                    ? [mediaGroup[classification.failedIndex]]
                    : mediaGroup
                if (failedItems.every(item => item?.media_r)) {
                    lastClassification = classification
                    traceFailedAttempt(mediaGroup, currentType, attempt, classification)
                    if (!queue.includes('r')) queue.unshift('r')
                    continue
                }
                classification = {
                    ...classification,
                    retryRegular: false,
                    terminal: true
                }
            }
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
                    mediaType: currentType,
                    failedIndex: Number.isInteger(classification.failedIndex)
                        ? classification.failedIndex + 1
                        : undefined,
                    errorCode: classification.code
                })
            } catch {
                // Reporting must never change transport retry or continuation.
            }
            userNotified ||= reportResult?.userNotified === true
            userNotificationUncertain ||= reportResult?.userNotificationUncertain === true
            userNotificationFailed ||= reportResult?.userNotificationFailed === true
            if (classification.stale) {
                return {
                    kind: MediaSendKind.STALE_MEDIA,
                    code: classification.code,
                    failedIndex: classification.failedIndex,
                    error,
                    attempts: attempt,
                    userNotified,
                    userNotificationUncertain,
                    userNotificationFailed
                }
            }
            if (!canRetryMediaSource(error, classification, phase)) {
                return {
                    kind: MediaSendKind.FAILED,
                    code: reportResult?.errorCode || classification.code,
                    failedIndex: classification.failedIndex,
                    error,
                    attempts: attempt,
                    userNotified,
                    userNotificationUncertain,
                    userNotificationFailed
                }
            }

            if (classification.retryLocal && Number.isInteger(classification.failedIndex)) {
                queueLocalMediaRetry(mediaGroup, classification.failedIndex, currentType, queue)
            }
        }
    }

    return {
        kind: MediaSendKind.FAILED,
        code: options.exhaustedCode?.(lastClassification) || 'TELEGRAM_MEDIA_RETRY_EXHAUSTED',
        error: lastError,
        failedIndex: lastClassification?.failedIndex,
        attempts,
        userNotified,
        userNotificationUncertain,
        userNotificationFailed,
        exhausted: true,
        lastClassification
    }
}
