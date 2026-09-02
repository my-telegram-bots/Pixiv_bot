export const GUEST_PREWARM_MAX_PAGES = 50
export const GUEST_PREWARM_MAX_WORKS = 500
export const GUEST_PREWARM_BATCH_SIZE = 10

function normalizeIllustrationId(value) {
    if (typeof value === 'string' && !/^[1-9]\d*$/.test(value)) return null
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function buildGuestPrewarmBatches(illust, maxPages = GUEST_PREWARM_MAX_PAGES) {
    const urls = illust?.imgs_?.regular_urls || []
    const fileIds = illust?.imgs_?.tg_file_ids || []
    const pages = []
    for (let pageIndex = 0; pageIndex < Math.min(urls.length, maxPages); pageIndex++) {
        if (typeof fileIds[pageIndex] === 'string' && fileIds[pageIndex]) continue
        if (typeof urls[pageIndex] !== 'string' || !/^https?:\/\//.test(urls[pageIndex])) continue
        pages.push({ pageIndex, url: urls[pageIndex] })
    }
    const batches = []
    for (let index = 0; index < pages.length; index += GUEST_PREWARM_BATCH_SIZE) {
        batches.push(pages.slice(index, index + GUEST_PREWARM_BATCH_SIZE))
    }
    return batches
}

export function mapPrewarmResponse(batch, messages) {
    if (!Array.isArray(messages) || messages.length !== batch.length) {
        throw new Error('Telegram cache response count does not match the requested pages')
    }
    return messages.map((message, index) => {
        const photos = message?.photo
        const largest = Array.isArray(photos) ? photos.reduce((selected, photo) => {
            if (!selected) return photo
            return Number(photo?.width || 0) * Number(photo?.height || 0) >=
                Number(selected?.width || 0) * Number(selected?.height || 0)
                ? photo
                : selected
        }, null) : null
        const fileId = largest?.file_id
        if (typeof fileId !== 'string' || !fileId) {
            throw new Error('Telegram cache response is missing a photo file_id')
        }
        return { pageIndex: batch[index].pageIndex, fileId }
    })
}

function floodDetails(error) {
    const response = error?.response || error?.error || error
    const code = Number(response?.error_code ?? error?.error_code)
    const parameters = response?.parameters || error?.parameters || {}
    const floodGate = parameters.flood_gate === true ||
        error?.code === 'TELEGRAM_FLOOD_GATE_ACTIVE'
    const channelScoped = parameters.scope === 'chat' ||
        Number.isSafeInteger(Number(parameters.chat_id))
    if (!floodGate && !(code === 429 && channelScoped)) return null
    const retryAfter = Number(parameters.retry_after)
    return { retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1 }
}

export function guestMediaCacheStartupMessage(cacheChatIds) {
    return Array.isArray(cacheChatIds) && cacheChatIds.length > 0
        ? {
            enabled: true,
            message: `✓ Guest media prewarming enabled for ${cacheChatIds.length} cache channel(s)`
        }
        : {
            enabled: false,
            message: '⚠ Guest media prewarming disabled; configure tg.media_cache_chat_ids to enable multi-page Rich Messages'
        }
}

export function createGuestMediaPrewarmer(options) {
    const {
        bot,
        writeFileIds,
        logger = console,
        now = Date.now,
        maxWorks = GUEST_PREWARM_MAX_WORKS,
        maxPages = GUEST_PREWARM_MAX_PAGES
    } = options
    const cacheChatIds = [...new Set(options.cacheChatIds || [])]
    const channels = cacheChatIds.map(chatId => ({
        chatId,
        queue: [],
        running: false,
        unhealthyUntil: 0
    }))
    const activeWorks = new Map()
    const idleWaiters = new Set()
    let accepting = true
    let nextChannel = 0

    function resolveIdle() {
        if (activeWorks.size !== 0) return
        for (const resolve of idleWaiters) resolve()
        idleWaiters.clear()
    }

    function finishBatch(job) {
        const state = activeWorks.get(job.illustId)
        if (!state) return
        state.remaining--
        if (state.remaining <= 0) {
            activeWorks.delete(job.illustId)
            resolveIdle()
        }
    }

    function selectChannel(excluded = new Set()) {
        if (channels.length === 0) return -1
        let fallback = -1
        for (let offset = 0; offset < channels.length; offset++) {
            const index = (nextChannel + offset) % channels.length
            if (excluded.has(index)) continue
            if (fallback === -1) fallback = index
            if (channels[index].unhealthyUntil <= now()) {
                nextChannel = (index + 1) % channels.length
                return index
            }
        }
        if (fallback !== -1) nextChannel = (fallback + 1) % channels.length
        return fallback
    }

    function queueBatch(job, channelIndex) {
        channels[channelIndex].queue.push(job)
        void drainChannel(channelIndex)
    }

    async function uploadBatch(channel, batch) {
        if (batch.length === 1) {
            return [await bot.api.sendPhoto(channel.chatId, batch[0].url)]
        }
        return bot.api.sendMediaGroup(
            channel.chatId,
            batch.map(page => ({ type: 'photo', media: page.url }))
        )
    }

    async function drainChannel(channelIndex) {
        const channel = channels[channelIndex]
        if (channel.running) return
        channel.running = true
        try {
            while (channel.queue.length > 0) {
                const job = channel.queue.shift()
                try {
                    const messages = await uploadBatch(channel, job.batch)
                    const pages = mapPrewarmResponse(job.batch, messages)
                    await writeFileIds(job.illustId, pages)
                    finishBatch(job)
                } catch (error) {
                    const flood = floodDetails(error)
                    if (flood) {
                        channel.unhealthyUntil = Math.max(
                            channel.unhealthyUntil,
                            now() + flood.retryAfter * 1000
                        )
                        job.attemptedChannels.add(channelIndex)
                        const alternate = selectChannel(job.attemptedChannels)
                        if (alternate !== -1) {
                            queueBatch(job, alternate)
                            continue
                        }
                    }
                    logger.warn?.(
                        `[guest_prewarm] illust=${job.illustId} ` +
                        `pages=${job.batch.map(page => page.pageIndex).join(',')} ` +
                        `code=${flood ? 'CACHE_CHANNEL_FLOODED' : 'CACHE_BATCH_FAILED'}`
                    )
                    finishBatch(job)
                }
            }
        } finally {
            channel.running = false
            if (channel.queue.length > 0) void drainChannel(channelIndex)
        }
    }

    function enqueue(illust) {
        if (!accepting || channels.length === 0 || illust?.type > 1) return false
        const illustId = normalizeIllustrationId(illust?.id)
        if (illustId === null || activeWorks.has(illustId)) return false
        if (activeWorks.size >= maxWorks) {
            logger.warn?.(`[guest_prewarm] illust=${illustId} code=CACHE_QUEUE_FULL`)
            return false
        }
        const batches = buildGuestPrewarmBatches(illust, maxPages)
        if (batches.length === 0) return false
        activeWorks.set(illustId, { remaining: batches.length })
        for (const batch of batches) {
            const channelIndex = selectChannel()
            queueBatch({
                illustId,
                batch,
                attemptedChannels: new Set()
            }, channelIndex)
        }
        return true
    }

    function waitForIdle() {
        if (activeWorks.size === 0) return Promise.resolve()
        return new Promise(resolve => idleWaiters.add(resolve))
    }

    async function stop() {
        accepting = false
        await waitForIdle()
    }

    return {
        enqueue,
        stop,
        waitForIdle,
        get activeWorkCount() { return activeWorks.size },
        get accepting() { return accepting }
    }
}
