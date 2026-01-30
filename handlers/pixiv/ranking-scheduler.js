import { honsole } from '../common.js'
import { ranking } from './ranking.js'
import db from '../../db.js'

/**
 * Ranking scheduler for daily automatic updates
 * Checks and fetches ranking data at GMT+9 08:00 daily
 * Retries every 10 minutes until successful
 */
class RankingScheduler {
    constructor() {
        this.isRunning = false
        this.nextTimer = null
        this.retryTimer = null
        this.updateHour = 8 // GMT+9 08:00
        this.retryInterval = 10 * 60 * 1000 // 10 minutes
    }

    /**
     * Calculate next update time (GMT+9 08:00)
     * @returns {Date} Next update time
     */
    getNextUpdateTime() {
        const now = new Date()
        // Convert to GMT+9
        const jstOffset = 9 * 60 * 60 * 1000
        const nowJST = new Date(now.getTime() + jstOffset + now.getTimezoneOffset() * 60 * 1000)

        // Set to today 08:00 JST
        const nextUpdate = new Date(nowJST)
        nextUpdate.setHours(this.updateHour, 0, 0, 0)

        // If already passed today's update time, set to tomorrow
        if (nowJST >= nextUpdate) {
            nextUpdate.setDate(nextUpdate.getDate() + 1)
        }

        // Convert back to local time
        return new Date(nextUpdate.getTime() - jstOffset - now.getTimezoneOffset() * 60 * 1000)
    }

    /**
     * Get today's ranking cache ID
     * @returns {string} Cache ID for today's ranking
     */
    getTodayRankingId() {
        const now = new Date()
        const jstOffset = 9 * 60 * 60 * 1000
        const jstNow = new Date(now.getTime() + jstOffset + now.getTimezoneOffset() * 60 * 1000)

        // Ranking is always for previous day(s)
        const rankingDate = new Date(jstNow)
        if (jstNow.getHours() < this.updateHour) {
            // Before JST 08:00: latest available is day-2
            rankingDate.setDate(rankingDate.getDate() - 2)
        } else {
            // After JST 08:00: latest available is day-1
            rankingDate.setDate(rankingDate.getDate() - 1)
        }

        const dateStr = rankingDate.toISOString().split('T')[0].replace(/-/g, '')
        return `daily${dateStr}_1`
    }

    /**
     * Check if today's ranking cache exists
     * @returns {Promise<boolean>}
     */
    async hasTodayCache() {
        try {
            const col = db.collection.ranking
            const cacheId = this.getTodayRankingId()
            const data = await col.findOne({ id: cacheId })
            return !!data
        } catch (error) {
            honsole.error('[RankingScheduler] Error checking cache:', error)
            return false
        }
    }

    /**
     * Fetch today's ranking data (first 10 pages)
     * @returns {Promise<boolean>} Success status
     */
    async fetchRanking() {
        if (this.isRunning) {
            honsole.log('[RankingScheduler] Already running, skipping')
            return false
        }

        try {
            this.isRunning = true
            const totalPages = 10
            const expected_date = this.getTodayRankingId().replace('daily', '').replace('_1', '')
            honsole.log(`[RankingScheduler] Fetching daily ranking (${totalPages} pages)... Expected date: ${expected_date}`)

            let successCount = 0
            let totalItems = 0

            // Fetch pages 1-10
            for (let page = 1; page <= totalPages; page++) {
                try {
                    const result = await ranking(page, 'daily')

                    if (result && result.data && result.data.length > 0) {
                        // Check if returned date matches expected date
                        if (page === 1 && result.date !== expected_date) {
                            honsole.warn(`[RankingScheduler] Date mismatch! Expected: ${expected_date}, Got: ${result.date}`)
                            honsole.log('[RankingScheduler] Pixiv ranking not yet updated, will retry later')
                            this.isRunning = false
                            return false
                        }

                        successCount++
                        totalItems += result.data.length
                        honsole.log(`[RankingScheduler] Page ${page}/${totalPages}: ${result.data.length} items`)
                    } else {
                        honsole.warn(`[RankingScheduler] Page ${page}/${totalPages}: No data returned`)
                    }

                    // Wait 30s between requests to avoid rate limiting
                    if (page < totalPages) {
                        honsole.log(`[RankingScheduler] Waiting 30s before next page...`)
                        await new Promise(resolve => setTimeout(resolve, 30000))
                    }
                } catch (error) {
                    honsole.error(`[RankingScheduler] Error fetching page ${page}:`, error)
                }
            }

            this.isRunning = false

            if (successCount > 0) {
                honsole.log(`[RankingScheduler] Successfully fetched ${successCount}/${totalPages} pages (${totalItems} total items)`)
                return true
            } else {
                honsole.warn('[RankingScheduler] All pages failed to fetch')
                return false
            }
        } catch (error) {
            honsole.error('[RankingScheduler] Error fetching ranking:', error)
            this.isRunning = false
            return false
        }
    }

    /**
     * Execute ranking update task with retry logic
     */
    async executeTask() {
        honsole.log('[RankingScheduler] Executing ranking update task')

        // Check if cache already exists
        const hasCache = await this.hasTodayCache()
        if (hasCache) {
            honsole.log('[RankingScheduler] Today\'s ranking already cached, skipping')
            this.scheduleNext()
            return
        }

        // Try to fetch ranking
        const success = await this.fetchRanking()

        if (success) {
            honsole.log('[RankingScheduler] Ranking update completed successfully')
            this.scheduleNext()
        } else {
            // Retry after 10 minutes
            honsole.log(`[RankingScheduler] Ranking update failed, retrying in ${this.retryInterval / 60000} minutes`)
            this.retryTimer = setTimeout(() => {
                this.executeTask()
            }, this.retryInterval)
        }
    }

    /**
     * Schedule next daily update
     */
    scheduleNext() {
        // Clear any existing timers
        if (this.nextTimer) {
            clearTimeout(this.nextTimer)
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
        }

        const nextTime = this.getNextUpdateTime()
        const delay = nextTime - new Date()

        honsole.log(`[RankingScheduler] Next update scheduled at ${nextTime.toISOString()} (in ${Math.round(delay / 1000 / 60)} minutes)`)

        this.nextTimer = setTimeout(() => {
            this.executeTask()
        }, delay)
    }

    /**
     * Start the scheduler
     */
    async start() {
        honsole.log('[RankingScheduler] Starting ranking scheduler')

        // IMPORTANT: Never run ranking fetch immediately at startup
        // This prevents memory crashes during bot initialization
        // Schedule for next update time instead
        honsole.log('[RankingScheduler] Scheduling next update (skipping immediate execution to prevent memory issues)')
        this.scheduleNext()
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.nextTimer) {
            clearTimeout(this.nextTimer)
            this.nextTimer = null
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
            this.retryTimer = null
        }
        honsole.log('[RankingScheduler] Scheduler stopped')
    }
}

// Export singleton instance
export const rankingScheduler = new RankingScheduler()
