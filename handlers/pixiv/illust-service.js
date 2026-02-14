/**
 * Illust Service - Orchestration Layer
 * Combines functions from all layers, handles queue, cache, and data flow
 */
import { getIllust, updateIllust } from '#db'
import { honsole, sleep } from '../common.js'
import { fetchIllustFromPixiv } from './api.js'
import { normalizeIllustData, extractDbFields } from './normalizer.js'
import { buildIllustURLsFast, buildIllustURLsWithProbe } from './url-builder.js'

// Cache with TTL management
class TTLCache {
    constructor(maxSize = 1000, ttl = 600000) {
        this.cache = new Map()
        this.timers = new Map()
        this.maxSize = maxSize
        this.ttl = ttl
    }

    set(key, value) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key))
        }

        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value
            this.delete(firstKey)
        }

        this.cache.set(key, value)
        const timer = setTimeout(() => {
            this.delete(key)
        }, this.ttl)
        this.timers.set(key, timer)
    }

    has(key) {
        return this.cache.has(key)
    }

    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key))
            this.timers.delete(key)
        }
        this.cache.delete(key)
    }
}

class IllustService {
    constructor() {
        // Queue management (prevent Pixiv 429 rate limiting)
        this.queue = new Map() // id -> { timestamp, retries }
        this.maxQueueSize = 200 // Prevent unbounded growth

        // 404 cache (10 minutes TTL)
        this.notFoundCache = new TTLCache(500, 600000)

        // Periodic queue cleanup (every 15 seconds instead of 30)
        setInterval(() => this._cleanupQueue(), 15000)
    }

    /**
     * Get illustration - Quick mode (for inline query)
     * Skip file probing, return immediately
     */
    async getQuick(id) {
        id = parseInt(id.toString())
        if (isNaN(id)) return false

        // Wait for queue
        await this._waitQueue(id)

        try {
            // 1. Try to get from database (must have complete imgs_ data)
            let illust = await getIllust(id)
            if (illust) {
                // Check if imgs_ data is complete
                const hasValidImgs = illust.imgs_ &&
                                    illust.imgs_.thumb_urls &&
                                    illust.imgs_.regular_urls &&
                                    illust.imgs_.thumb_urls.length > 0 &&
                                    illust.imgs_.thumb_urls[0]  // Ensure first URL exists

                if (hasValidImgs) {
                    delete illust._id
                    if (illust.deleted) {
                        this._releaseQueue(id)
                        return 404
                    }
                    this._releaseQueue(id)
                    return illust
                }
                // Database record incomplete, continue to fetch from Pixiv
            }

            // 2. Check 404 cache
            if (this.notFoundCache.has(id)) {
                this._releaseQueue(id)
                return 404
            }

            // 3. Fetch new data from Pixiv
            const rawData = await fetchIllustFromPixiv(id)

            // 4. Data processing pipeline (fast mode)
            illust = normalizeIllustData(rawData)
            illust.imgs_ = await buildIllustURLsFast(illust)  // No file probing

            if (!illust.imgs_) {
                honsole.error('[IllustService.getQuick] Failed to build URLs for illust', id)
                this._releaseQueue(id)
                return false
            }

            // 5. Save to database
            const dbData = extractDbFields(illust)
            await updateIllust(illust.id, dbData, null, { upsert: true })

            this._releaseQueue(id)
            return illust

        } catch (error) {
            this._releaseQueue(id)
            return this._handleError(id, error)
        }
    }

    /**
     * Get illustration - Full mode (for normal sending)
     * Include file probing to ensure URL correctness
     */
    async getFull(id) {
        id = parseInt(id.toString())
        if (isNaN(id)) return false

        await this._waitQueue(id)

        try {
            // 1. Try to get from database
            let illust = await getIllust(id)
            if (illust && illust.imgs_ && illust.imgs_.original_urls) {
                delete illust._id
                if (illust.deleted) {
                    this._releaseQueue(id)
                    return 404
                }
                this._releaseQueue(id)
                return illust
            }

            // 2. Check 404 cache
            if (this.notFoundCache.has(id)) {
                this._releaseQueue(id)
                return 404
            }

            // 3. Fetch new data from Pixiv
            const rawData = await fetchIllustFromPixiv(id)
            honsole.dev('[IllustService.getFull] Fetched from Pixiv:', id)

            // 4. Data processing pipeline (full mode)
            illust = normalizeIllustData(rawData)
            illust.imgs_ = await buildIllustURLsWithProbe(illust)  // Probe file format

            if (!illust.imgs_) {
                // File doesn't exist, mark as deleted
                await this._markAsDeleted(id)
                this._releaseQueue(id)
                return 404
            }

            // 5. Save to database
            const dbData = extractDbFields(illust)
            await updateIllust(illust.id, dbData, null, { upsert: true })

            this._releaseQueue(id)
            return illust

        } catch (error) {
            this._releaseQueue(id)
            return this._handleError(id, error)
        }
    }

    /**
     * Force refresh (fresh=true)
     */
    async refresh(id) {
        id = parseInt(id.toString())
        if (isNaN(id)) return false

        await this._waitQueue(id)

        try {
            if (this.notFoundCache.has(id)) {
                this._releaseQueue(id)
                return 404
            }

            const rawData = await fetchIllustFromPixiv(id)
            const illust = normalizeIllustData(rawData)
            illust.imgs_ = await buildIllustURLsWithProbe(illust)

            if (!illust.imgs_) {
                await this._markAsDeleted(id)
                this._releaseQueue(id)
                return 404
            }

            const dbData = extractDbFields(illust)
            await updateIllust(illust.id, dbData, null, { upsert: true })

            this._releaseQueue(id)
            return illust

        } catch (error) {
            this._releaseQueue(id)
            return this._handleError(id, error)
        }
    }

    // ========== Queue Management ==========

    async _waitQueue(id) {
        let waitCount = 0
        const maxWaitCount = 20

        // Check queue size limit before adding (prevent memory overflow)
        if (this.queue.size >= this.maxQueueSize && !this.queue.has(id)) {
            honsole.warn(`[IllustService] Queue full (${this.queue.size}), rejecting request for illust:`, id)
            throw new Error(`Queue is full (${this.queue.size} requests). Please try again later.`)
        }

        while (this.queue.has(id) && waitCount < maxWaitCount) {
            await sleep(300)
            waitCount++

            if (waitCount > 10) {
                const entry = this.queue.get(id)
                if (entry && Date.now() - entry.timestamp > 30000) {
                    honsole.warn('[IllustService] Force removing stale queue entry:', id)
                    this.queue.delete(id)
                    break
                }
            }
        }

        if (waitCount >= maxWaitCount) {
            throw new Error(`Queue timeout for illust: ${id}`)
        }

        this.queue.set(id, { timestamp: Date.now(), retries: 0 })
    }

    _releaseQueue(id) {
        this.queue.delete(id)
        honsole.dev('[IllustService] Released queue:', id)
    }

    _cleanupQueue() {
        const now = Date.now()
        const staleEntries = []

        for (const [id, entry] of this.queue) {
            if (now - entry.timestamp > 60000) {
                staleEntries.push(id)
            }
        }

        if (staleEntries.length > 0) {
            honsole.warn(`[IllustService] Removing ${staleEntries.length} stale queue entries`)
            staleEntries.forEach(id => this.queue.delete(id))
        }

        // Warn if queue is getting large (earlier threshold)
        if (this.queue.size > 50) {
            honsole.warn(`[IllustService] Queue size is large: ${this.queue.size}`)
        }

        // Emergency cleanup: if queue exceeds 80% of max, clear oldest entries
        if (this.queue.size > this.maxQueueSize * 0.8) {
            const sortedEntries = Array.from(this.queue.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)
            const toRemove = sortedEntries.slice(0, Math.floor(this.queue.size * 0.3))
            toRemove.forEach(([id]) => this.queue.delete(id))
            honsole.warn(`[IllustService] Emergency queue cleanup: removed ${toRemove.length} oldest entries`)
        }
    }

    // ========== Error Handling ==========

    _handleError(id, error) {
        if (error.response && error.response.status === 404) {
            honsole.warn('[IllustService] 404 illust:', id)
            this.notFoundCache.set(id, true)
            this._markAsDeleted(id).catch(e => {
                honsole.warn('[IllustService] Failed to mark as deleted:', id, e)
            })
            return 404
        }

        if (error.message && error.message.includes('timeout')) {
            honsole.warn('[IllustService] Timeout for illust:', id)
            return false
        }

        honsole.error('[IllustService] Error fetching illust:', id, error)
        throw error
    }

    async _markAsDeleted(id) {
        // Only mark as deleted if record already exists
        // Don't create empty records for 404/deleted illusts
        try {
            await updateIllust(id, {
                deleted: true,
                deleted_at: new Date()
            }, null, { upsert: false })
            honsole.dev('[IllustService] Marked as deleted:', id)
        } catch (error) {
            // Skip if record doesn't exist, warn for other errors
            if (error.message && error.message.includes('Record not exist')) {
                honsole.dev('[IllustService] Skip marking deleted (not exist):', id)
            } else {
                honsole.warn('[IllustService] Failed to mark as deleted:', id, error.message)
            }
        }
    }
}

// Export singleton
const illustService = new IllustService()
export default illustService
