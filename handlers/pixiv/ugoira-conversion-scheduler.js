/**
 * Bounded, de-duplicated scheduler for local ugoira conversions.
 *
 * A key represents one concrete output. Callers requesting that same output
 * receive the in-flight promise instead of polling or starting another encoder.
 */
export function createUgoiraConversionScheduler({
    maxConcurrent = 5,
    maxRetries = 3,
    shouldRetry = () => true,
    retryDelay = async () => {}
} = {}) {
    const inFlight = new Map()
    const pending = []
    let running = 0

    function drain() {
        while (running < maxConcurrent && pending.length > 0) {
            const job = pending.shift()
            running++
            void run(job)
        }
    }

    async function run(job) {
        try {
            let lastError
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    job.resolve(await job.work(attempt))
                    return
                } catch (error) {
                    lastError = error
                    if (attempt === maxRetries || !shouldRetry(error)) throw error
                    await retryDelay(attempt, error)
                }
            }
            throw lastError
        } catch (error) {
            job.reject(error)
        } finally {
            running--
            inFlight.delete(job.key)
            drain()
        }
    }

    function schedule(key, work) {
        const existing = inFlight.get(key)
        if (existing) return existing

        let resolve
        let reject
        const promise = new Promise((resolvePromise, rejectPromise) => {
            resolve = resolvePromise
            reject = rejectPromise
        })
        inFlight.set(key, promise)
        pending.push({ key, work, resolve, reject })
        drain()
        return promise
    }

    return {
        schedule,
        get(key) { return inFlight.get(key) },
        get activeCount() {
            return running
        },
        get queuedCount() {
            return pending.length
        },
        get inFlightCount() {
            return inFlight.size
        }
    }
}
