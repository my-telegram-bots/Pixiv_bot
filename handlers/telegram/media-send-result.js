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

export function classifyMediaSendError(error) {
    const description = telegramErrorDescription(error).toLowerCase()
    const failedIndexMatch = description.match(/failed to send message #(\d+)/)
    const stale = error?.code === 'PIXIV_MEDIA_STALE'
    const retryLocal = !stale && telegramRemoteFetchDescriptions.some(value => description.includes(value))
    return {
        stale,
        retryLocal,
        failedIndex: failedIndexMatch ? Number.parseInt(failedIndexMatch[1], 10) - 1 : null,
        code: stale
            ? 'PIXIV_MEDIA_STALE'
            : retryLocal
                ? 'TELEGRAM_MEDIA_FETCH_FAILED'
                : 'TELEGRAM_MEDIA_SEND_FAILED'
    }
}

export function telegramErrorDescription(error) {
    return String(error?.description || error?.message || '')
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
