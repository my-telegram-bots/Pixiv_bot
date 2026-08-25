import { MediaSendKind } from '#handlers/telegram/media-send-result'

const terminalDescriptions = Object.freeze({
    permission: ['forbidden:', 'not enough rights to send', 'chat write forbidden'],
    format: ['media_caption_too_long', "can't parse entities", 'wrong type of the web page content'],
    topic: ['message thread not found', 'topic_closed'],
    size: ['file is too big', 'request entity too large', 'maxcontentlength', 'maxbodylength', 'exceeds size limit']
})

const transientDescriptions = Object.freeze([
    'too many requests',
    'temporarily unavailable',
    'timeout',
    'timed out',
    'connection reset',
    'internal server error',
    'bad gateway',
    'service unavailable'
])

const transientCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT'
])

function includesAny(description, values) {
    return values.some(value => description.includes(value))
}

const failureMessages = Object.freeze({
    TELEGRAM_DOCUMENT_TOO_LARGE: result => ['document_too_large', result.recoveryUrl || ''],
    PIXIV_DOCUMENT_DOWNLOAD_FAILED: result => ['document_download_failed', result.code],
    TELEGRAM_DOCUMENT_PERMISSION_DENIED: result => ['document_permission_failed', result.code],
    TELEGRAM_DOCUMENT_FORMAT_INVALID: result => ['document_format_failed', result.code],
    TELEGRAM_DOCUMENT_TOPIC_UNAVAILABLE: result => ['document_topic_failed', result.code],
    TELEGRAM_DOCUMENT_RETRY_EXHAUSTED: result => ['document_retry_exhausted', result.code],
    TELEGRAM_DOCUMENT_SEND_FAILED: result => ['document_delivery_failed', result.code],
    TELEGRAM_DOCUMENT_GROUP_SEND_FAILED: result => ['document_delivery_failed', result.code]
})

export function documentFailureMessage(result = {}) {
    return failureMessages[result.code]?.(result) || null
}

export function publicDocumentRecoveryUrl(url, pximgProxy) {
    if (!url || !pximgProxy) return url
    return String(url).replace('i.pximg.net', pximgProxy)
}

export function classifyDocumentFailure(error, phase = 'send') {
    const description = String(error?.description || error?.message || '').toLowerCase()
    if (error?.code === 'PIXIV_MEDIA_STALE') {
        return { kind: MediaSendKind.STALE_MEDIA, code: 'PIXIV_MEDIA_STALE', retryable: false }
    }
    if (error?.response?.status === 413 || error?.error_code === 413 ||
        includesAny(description, terminalDescriptions.size) ||
        error?.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED') {
        return { kind: MediaSendKind.FAILED, code: 'TELEGRAM_DOCUMENT_TOO_LARGE', retryable: false }
    }
    if (phase === 'download') {
        return { kind: MediaSendKind.FAILED, code: 'PIXIV_DOCUMENT_DOWNLOAD_FAILED', retryable: false }
    }
    if (includesAny(description, terminalDescriptions.permission)) {
        return { kind: MediaSendKind.FAILED, code: 'TELEGRAM_DOCUMENT_PERMISSION_DENIED', retryable: false }
    }
    if (includesAny(description, terminalDescriptions.format)) {
        return { kind: MediaSendKind.FAILED, code: 'TELEGRAM_DOCUMENT_FORMAT_INVALID', retryable: false }
    }
    if (includesAny(description, terminalDescriptions.topic)) {
        return { kind: MediaSendKind.FAILED, code: 'TELEGRAM_DOCUMENT_TOPIC_UNAVAILABLE', retryable: false }
    }

    const status = error?.error_code || error?.response?.status
    const retryable = status === 429 || status >= 500 || transientCodes.has(error?.code) ||
        includesAny(description, transientDescriptions)
    return {
        kind: MediaSendKind.FAILED,
        code: retryable ? 'TELEGRAM_DOCUMENT_RETRY_EXHAUSTED' : 'TELEGRAM_DOCUMENT_SEND_FAILED',
        // Preserve the former one-retry behavior for unknown Telegram transport
        // failures while excluding failures that require user action.
        retryable: retryable || status === undefined
    }
}

export async function deliverDocument({
    mediaUrl,
    extra,
    createLocalInputFile,
    fetchRemoteFile,
    createBufferedInputFile,
    sendDocument,
    maxSendAttempts = 2
}) {
    const filename = String(mediaUrl || '').slice(String(mediaUrl || '').lastIndexOf('/') + 1)
    let createInputFile
    try {
        if (String(mediaUrl || '').includes('tmp/')) {
            createInputFile = () => createLocalInputFile(mediaUrl, filename)
        } else {
            const data = await fetchRemoteFile(mediaUrl)
            createInputFile = () => createBufferedInputFile(data, filename)
        }
    } catch (error) {
        const classification = classifyDocumentFailure(error, 'download')
        return { ...classification, error, recoveryUrl: mediaUrl, attempts: 0 }
    }

    let lastError
    const attemptLimit = Math.max(1, maxSendAttempts)
    for (let attempt = 1; attempt <= attemptLimit; attempt++) {
        try {
            const result = await sendDocument(createInputFile(), extra)
            return { kind: MediaSendKind.SENT, result, attempts: attempt }
        } catch (error) {
            lastError = error
            const classification = classifyDocumentFailure(error, 'send')
            if (!classification.retryable || attempt === attemptLimit) {
                return {
                    ...classification,
                    retryable: undefined,
                    error,
                    recoveryUrl: mediaUrl,
                    attempts: attempt
                }
            }
        }
    }

    return {
        kind: MediaSendKind.FAILED,
        code: 'TELEGRAM_DOCUMENT_RETRY_EXHAUSTED',
        error: lastError,
        recoveryUrl: mediaUrl,
        attempts: attemptLimit
    }
}
