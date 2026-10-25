import { MediaSendKind } from '#handlers/telegram/media-send-result'
import { releaseBufferedErrorPayload } from '#handlers/telegram/send-retry-policy'

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
    if (error?.code === 'TELEGRAM_FLOOD_GATE_ACTIVE' || error?.parameters?.flood_gate === true) {
        return { kind: MediaSendKind.FAILED, code: 'TELEGRAM_FLOOD_GATE_ACTIVE', retryable: false }
    }
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
        // Rate-limit retries are owned by the transport. Uncertain sends must
        // never be replayed here, including timeouts and server failures.
        retryable: false
    }
}

export async function deliverDocument({
    mediaUrl,
    extra,
    createLocalInputFile,
    fetchRemoteFile,
    createBufferedInputFile,
    sendDocument,
    reportError = async () => {}
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
        try {
            await reportError(error, { attempt: 0, errorCode: classification.code })
        } catch {
            // Reporting must never change document recovery or retry.
        }
        return { ...classification, error, recoveryUrl: mediaUrl, attempts: 0 }
    }

    try {
        const result = await sendDocument(createInputFile(), extra)
        return { kind: MediaSendKind.SENT, result, attempts: 1 }
    } catch (error) {
        const classification = classifyDocumentFailure(error, 'send')
        releaseBufferedErrorPayload(error)
        try {
            await reportError(error, { attempt: 1, errorCode: classification.code })
        } catch {
            // Reporting must never change document recovery.
        }
        return {
            ...classification,
            retryable: undefined,
            error,
            recoveryUrl: mediaUrl,
            attempts: 1
        }
    }
}
