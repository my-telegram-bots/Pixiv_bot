export const MediaSendKind = Object.freeze({
    SENT: 'sent',
    STALE_MEDIA: 'stale_media',
    FAILED: 'failed'
})

const staleTelegramDescriptions = [
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
    const description = (error?.description || error?.message || '').toLowerCase()
    const failedIndexMatch = description.match(/failed to send message #(\d+)/)
    const stale = error?.code === 'PIXIV_MEDIA_STALE' ||
        staleTelegramDescriptions.some(value => description.includes(value))
    return {
        stale,
        failedIndex: failedIndexMatch ? Number.parseInt(failedIndexMatch[1], 10) - 1 : null,
        code: stale ? 'PIXIV_MEDIA_STALE' : 'TELEGRAM_MEDIA_SEND_FAILED'
    }
}
