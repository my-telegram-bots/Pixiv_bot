export const MEDIA_BUFFER_POLICY = Object.freeze({
    fileBytes: 50 * 1024 * 1024,
    bufferedFiles: 10,
    downloads: 4,
    maxQueued: 500,
    waitMs: 60_000
})

export function createWeightedGate({ capacity, maxQueued = 500, waitMs = 60_000 }) {
    let used = 0
    const queue = []
    function drain() {
        while (queue.length && used + queue[0].weight <= capacity) {
            const entry = queue.shift()
            clearTimeout(entry.timer)
            used += entry.weight
            entry.resolve(() => { used -= entry.weight; drain() })
        }
    }
    function acquire(weight) {
        if (!Number.isInteger(weight) || weight < 1 || weight > capacity) {
            return Promise.reject(new RangeError('Invalid media reservation weight'))
        }
        if (queue.length >= maxQueued) {
            return Promise.reject(Object.assign(new Error('Media queue is full'), { code: 'MEDIA_QUEUE_FULL' }))
        }
        return new Promise((resolve, reject) => {
            const entry = { weight, resolve }
            entry.timer = setTimeout(() => {
                const index = queue.indexOf(entry)
                if (index < 0) return
                queue.splice(index, 1)
                reject(Object.assign(new Error('Media queue wait timed out'), { code: 'MEDIA_QUEUE_TIMEOUT' }))
                drain()
            }, waitMs)
            queue.push(entry)
            drain()
        })
    }
    return async function run(weight, task) {
        if (weight === 0) return task()
        const release = await acquire(weight)
        try { return await task() } finally { release() }
    }
}

export const withMediaBufferBudget = createWeightedGate({
    capacity: MEDIA_BUFFER_POLICY.bufferedFiles,
    maxQueued: MEDIA_BUFFER_POLICY.maxQueued,
    waitMs: MEDIA_BUFFER_POLICY.waitMs
})
export const withMediaDownloadSlot = createWeightedGate({
    capacity: MEDIA_BUFFER_POLICY.downloads,
    maxQueued: MEDIA_BUFFER_POLICY.maxQueued,
    waitMs: MEDIA_BUFFER_POLICY.waitMs
})
