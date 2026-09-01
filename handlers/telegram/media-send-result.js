export const MediaSendKind = Object.freeze({
    SENT: 'sent',
    STALE_MEDIA: 'stale_media',
    FAILED: 'failed'
})

const telegramRemoteFetchDescriptions = [
    'failed to get http url content',
    'wrong file identifier/http url specified',
    'wrong type of the web page content',
    'group send failed',
    "can't parse inputmedia",
    'media not found',
    'webpage_media_empty',
    'webpage_curl_failed'
]

export function buildPhotoCandidates(item) {
    const variants = [
        ['r', item?.media_r],
        ['o', item?.media_o]
    ].filter(([, source]) => Boolean(source))
    return [
        ...variants.map(([type, source]) => ({ type, source, local: false })),
        ...variants.map(([type, source]) => ({ type: `dl${type}`, source, local: true }))
    ]
}

function rejectedPhotoSize(description) {
    const match = description.match(/file of size (\d+) bytes is too big for (?:a )?photo\b/i)
    if (!match) return null
    const bytes = Number(match[1])
    return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null
}

function inputFileSize(media) {
    const data = media?.fileData
    return data instanceof Uint8Array ? data.byteLength : null
}

function failedUploadIndex(error, rejectedBytes) {
    if (!rejectedBytes || !Array.isArray(error?.payload?.media)) return null
    const matches = []
    error.payload.media.forEach((item, index) => {
        if (inputFileSize(item?.media) === rejectedBytes) matches.push(index)
    })
    return matches.length === 1 ? matches[0] : null
}

export function classifyMediaSendError(error, currentType) {
    const description = telegramErrorDescription(error).toLowerCase()
    const failedIndexMatch = description.match(/failed to send message #(\d+)/)
    const photoSize = rejectedPhotoSize(description)
    const sizeFailedIndex = failedUploadIndex(error, photoSize)
    const stale = error?.code === 'PIXIV_MEDIA_STALE'
    const floodGateActive = error?.code === 'TELEGRAM_FLOOD_GATE_ACTIVE' ||
        error?.parameters?.flood_gate === true
    const retryLocal = !stale && telegramRemoteFetchDescriptions.some(value => description.includes(value))
    const retryRegular = photoSize !== null && !['r', 'dlr'].includes(currentType)
    const terminalCode = floodGateActive
        ? 'TELEGRAM_FLOOD_GATE_ACTIVE'
        : photoSize !== null && !retryRegular
            ? 'TELEGRAM_PHOTO_TOO_LARGE'
            : description.includes('media_caption_too_long')
                ? 'TELEGRAM_CAPTION_TOO_LONG'
                : description.includes("can't parse entities: character")
                    ? 'TELEGRAM_FORMAT_INVALID'
                    : description.includes('forbidden:')
                        ? 'TELEGRAM_FORBIDDEN'
                        : description.includes('not enough rights to send')
                            ? 'TELEGRAM_PERMISSION_DENIED'
                            : description.includes('message thread not found') || description.includes('topic_closed')
                                ? 'TELEGRAM_TOPIC_UNAVAILABLE'
                                : null
    return {
        stale,
        retryLocal,
        retryRegular,
        terminal: terminalCode !== null,
        failedIndex: failedIndexMatch
            ? Number.parseInt(failedIndexMatch[1], 10) - 1
            : sizeFailedIndex,
        code: terminalCode || (photoSize !== null
            ? 'TELEGRAM_PHOTO_TOO_LARGE'
            : stale
                ? 'PIXIV_MEDIA_STALE'
                : retryLocal
                    ? 'TELEGRAM_MEDIA_FETCH_FAILED'
                    : 'TELEGRAM_MEDIA_SEND_FAILED')
    }
}

export function telegramErrorDescription(error) {
    return String(error?.description || error?.error?.description || error?.message || '')
}

export function telegramRetryAfter(error) {
    const retryAfter = Number(error?.parameters?.retry_after)
    return Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null
}

export function queueLocalMediaRetry(mediaGroup, failedIndex, currentType, queue) {
    if (!Array.isArray(mediaGroup) || failedIndex < 0 || failedIndex >= mediaGroup.length) {
        return false
    }
    const item = mediaGroup[failedIndex]
    if (!Array.isArray(item.invaild)) item.invaild = []
    if (!item.invaild.includes(currentType)) item.invaild.push(currentType)
    if (!queue.includes(currentType)) queue.unshift(currentType)
    return true
}

export function selectMediaRetryType(item, requestedType) {
    if (requestedType.startsWith('dl') || !item.invaild?.includes(requestedType)) {
        return requestedType
    }
    return `dl${requestedType}`
}
