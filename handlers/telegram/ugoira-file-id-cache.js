export const UGOIRA_FILE_ID_CACHE_FAILED = 'UGOIRA_FILE_ID_CACHE_FAILED'

export async function cacheUgoiraFileId({
    store,
    illustration,
    sentMessage,
    reportError,
    chatId,
    languageCode
}) {
    const fileId = sentMessage?.animation?.file_id
    if (illustration?.tg_file_id || !fileId) {
        return { attempted: false, cached: false }
    }

    try {
        await store.collection.illust.updateOne({ id: illustration.id }, {
            $set: { type: 2, tg_file_id: fileId }
        })
        return { attempted: true, cached: true }
    } catch (error) {
        try {
            await reportError(error, chatId, languageCode, {
                notifyUser: false,
                illustId: illustration.id,
                page: 0,
                method: 'cacheUgoiraFileId',
                errorCode: UGOIRA_FILE_ID_CACHE_FAILED
            })
        } catch {
            // Cache/reporting failures cannot change an already delivered animation.
        }
        return { attempted: true, cached: false }
    }
}
