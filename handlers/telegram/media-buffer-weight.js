import { selectMediaRetryType } from '#handlers/telegram/media-send-result'

export function mediaGroupBufferWeight(items, type) {
    return items.filter(item => {
        if (item.type === 'video') {
            const source = item.media || item.media_o
            return !item.tg_file_id && !(source && source.includes('tmp/'))
        }
        const local = selectMediaRetryType(item, type).includes('dl')
        return local && (item.type === 'document' || !item.media_t)
    }).length
}

export async function prepareMediaBatch(items, prepare) {
    const results = await Promise.allSettled(items.map(prepare))
    const failure = results.find(result => result.status === 'rejected')
    if (failure) throw failure.reason
    return results.map(result => result.value)
}
