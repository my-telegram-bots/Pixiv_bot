export const REGULAR_ILLUSTRATION_FILE_ID_CACHE_FAILED =
    'REGULAR_ILLUSTRATION_FILE_ID_CACHE_FAILED'

function largestPhotoFileId(message) {
    const photos = message?.photo
    if (!Array.isArray(photos)) return null
    const largest = photos.reduce((selected, photo) => {
        if (typeof photo?.file_id !== 'string' || !photo.file_id) return selected
        if (!selected) return photo
        return Number(photo.width || 0) * Number(photo.height || 0) >=
            Number(selected.width || 0) * Number(selected.height || 0)
            ? photo
            : selected
    }, null)
    return largest?.file_id || null
}

export function collectRegularIllustrationPageFileIds(mediaItems, sentMessages) {
    if (!Array.isArray(mediaItems) || !Array.isArray(sentMessages) ||
        mediaItems.length !== sentMessages.length) {
        return []
    }

    const pagesByIllust = new Map()
    for (let index = 0; index < mediaItems.length; index++) {
        const item = mediaItems[index]
        if (item?.type !== 'photo' || item?.media_t ||
            !Number.isSafeInteger(item?.id) || !Number.isSafeInteger(item?.p) ||
            item.p < 0) {
            continue
        }
        const fileId = largestPhotoFileId(sentMessages[index])
        if (!fileId) continue
        const pages = pagesByIllust.get(item.id) || []
        pages.push({ pageIndex: item.p, fileId })
        pagesByIllust.set(item.id, pages)
    }
    return [...pagesByIllust].map(([illustId, pages]) => ({ illustId, pages }))
}

export async function cacheRegularIllustrationPageFileIds({
    mediaItems,
    sentMessages,
    writeFileIds,
    reportError,
    chatId,
    languageCode
}) {
    const groupedPages = collectRegularIllustrationPageFileIds(mediaItems, sentMessages)
    if (groupedPages.length === 0 || typeof writeFileIds !== 'function') {
        return { attempted: false, cached: false }
    }

    try {
        for (const { illustId, pages } of groupedPages) {
            await writeFileIds(illustId, pages)
        }
        return { attempted: true, cached: true }
    } catch (error) {
        const illustId = groupedPages[0]?.illustId
        try {
            await reportError?.(error, chatId, languageCode, {
                notifyUser: false,
                illustId,
                method: 'cacheRegularIllustrationPageFileIds',
                errorCode: REGULAR_ILLUSTRATION_FILE_ID_CACHE_FAILED
            })
        } catch {
            // A post-delivery cache failure must not affect the delivered media.
        }
        return { attempted: true, cached: false }
    }
}

export function runRegularIllustrationFileIdHook(runtime, mediaItems, sentMessages) {
    return cacheRegularIllustrationPageFileIds({
        mediaItems,
        sentMessages,
        writeFileIds: runtime.writeFileIds,
        reportError: runtime.reportError,
        chatId: runtime.chatId,
        languageCode: runtime.ctx.l
    })
}
