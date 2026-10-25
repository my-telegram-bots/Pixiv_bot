// Process-local replay protection. Never infer identity from message content.
export function createUpdateDeduplicator({
    retentionMs = 15 * 60_000,
    maxCompleted = 10_000,
    clock = Date.now
} = {}) {
    if (!Number.isFinite(retentionMs) || retentionMs <= 0 ||
        !Number.isSafeInteger(maxCompleted) || maxCompleted < 1) {
        throw new RangeError('Invalid update retention limits')
    }
    const active = new Map()
    const completed = new Map()

    function prune(now) {
        for (const [id, expiresAt] of completed) {
            if (expiresAt <= now) completed.delete(id)
        }
    }

    return function deduplicateUpdate(ctx, next) {
        const id = ctx.update?.update_id
        if (!Number.isSafeInteger(id) || id < 0) return next()
        prune(clock())
        // Duplicates await ownership without reporting the original error twice.
        if (active.has(id)) return active.get(id).then(() => undefined, () => undefined)
        if (completed.has(id)) return Promise.resolve()

        const attempt = Promise.resolve().then(next).finally(() => {
            active.delete(id)
            const now = clock()
            prune(now)
            completed.set(id, now + retentionMs)
            while (completed.size > maxCompleted) {
                completed.delete(completed.keys().next().value)
            }
        })
        active.set(id, attempt)
        return attempt
    }
}
