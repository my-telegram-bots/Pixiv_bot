import {
    MediaSendKind,
    queueLocalMediaRetry,
    selectMediaRetryType
} from '#handlers/telegram/media-send-result'

export function mediaGroupAttemptLog(mediaGroup, requestedType, attempt) {
    return mediaGroup.map((item, index) => {
        const selectedType = selectMediaRetryType(item, requestedType)
        return {
            albumIndex: index + 1,
            illustId: item.id ?? null,
            page: item.p ?? null,
            retry: attempt,
            mediaType: selectedType,
            mode: selectedType.startsWith('dl') ? 'local' : 'remote'
        }
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
        logAttempt = () => {},
        maxAttempts = 5
    } = options
    const queue = [...mediaTypes]
    let lastError
    let lastClassification

    for (let attempt = 1; attempt <= maxAttempts && queue.length > 0; attempt++) {
        const currentType = queue.shift()
        logAttempt(mediaGroupAttemptLog(mediaGroup, currentType, attempt))
        try {
            const result = await sendMedia(await buildMedia([...mediaGroup], currentType))
            return { kind: MediaSendKind.SENT, result, attempts: attempt }
        } catch (error) {
            lastError = error
            const classification = classifyError(error, currentType)
            lastClassification = classification
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
