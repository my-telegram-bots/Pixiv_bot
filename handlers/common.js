import axios from 'axios'
import config from '#config'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import { _l } from '#handlers/telegram/i18n'
import { createHash } from 'crypto'
import { promisify } from 'util'
import { exec as exec$0 } from 'child_process'
/**
 * ForEach with async
 * @param {Array} array
 * @param {Function} callback
 */
export async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }
}
/**
 * honsole => huggy console
 * record error and report
 */
export const honsole = {
    dev: function (...args) {
        if (process.env.dev) {
            console.log(...args)
        }
    },
    log: function (...args) {
        console.log(...args)
    },
    error: function (...args) {
        console.error(...args)
    },
    warn: function (...args) {
        console.warn(...args)
    }
}

/**
 * Memory Monitor - Track memory usage and cache sizes
 */
class MemoryMonitor {
    constructor() {
        this.metrics = {
            peakMemory: 0,
            cacheChecks: 0,
            lastReport: Date.now(),
            lastWarningTime: 0,
            warningCount: 0
        }
        this.bot = null
        this.masterId = null
        this.thresholds = {
            warning: 1400,  // MB - send warning (70% of 2GB heap)
            critical: 1700, // MB - send critical alert (85% of 2GB heap)
            gc: 1200        // MB - trigger GC (60% of 2GB heap)
        }
    }

    /**
     * Initialize bot instance for sending alerts
     */
    init(bot, masterId) {
        this.bot = bot
        this.masterId = masterId
        honsole.log('[MemoryMonitor] Initialized with Telegram alerts')
    }

    /**
     * Get current memory usage
     */
    getMemoryUsage() {
        const usage = process.memoryUsage()
        return {
            heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2), // MB
            heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2), // MB
            rss: (usage.rss / 1024 / 1024).toFixed(2), // MB
            external: (usage.external / 1024 / 1024).toFixed(2) // MB
        }
    }

    /**
     * Report cache and queue sizes
     */
    reportCacheSizes(cacheRegistry) {
        const sizes = {}
        for (const [name, cache] of Object.entries(cacheRegistry)) {
            if (cache && typeof cache.size === 'function') {
                sizes[name] = cache.size()
            } else if (cache && typeof cache.size === 'number') {
                sizes[name] = cache.size
            } else if (cache instanceof Set || cache instanceof Map) {
                sizes[name] = cache.size
            }
        }
        return sizes
    }

    /**
     * Send alert to Telegram master
     */
    async sendAlert(level, message, mem, caches) {
        if (!this.bot || !this.masterId) {
            return
        }

        // Debounce: Don't send alerts more frequently than every 10 minutes
        const now = Date.now()
        const timeSinceLastWarning = now - this.metrics.lastWarningTime
        if (timeSinceLastWarning < 600000) { // 10 minutes
            return
        }

        this.metrics.lastWarningTime = now
        this.metrics.warningCount++

        const emoji = level === 'critical' ? '🚨' : '⚠️'
        const uptime = Math.floor(process.uptime() / 3600)

        let cacheInfo = ''
        if (caches && Object.keys(caches).length > 0) {
            cacheInfo = '\n\n📦 Caches:\n' + Object.entries(caches)
                .map(([name, size]) => `  • ${name}: ${size}`)
                .join('\n')
        }

        const alertMessage = `${emoji} *Memory Alert* \\- ${level.toUpperCase()}

📊 *Memory Status:*
  • Heap: \`${mem.heapUsed}MB\` / \`${mem.heapTotal}MB\`
  • RSS: \`${mem.rss}MB\`
  • Peak: \`${this.metrics.peakMemory.toFixed(2)}MB\`

⏱ *Uptime:* ${uptime}h
🔢 *Alert Count:* ${this.metrics.warningCount}
${cacheInfo}

💡 *Suggestion:* ${message}`

        try {
            await this.bot.api.sendMessage(this.masterId, alertMessage, {
                parse_mode: 'MarkdownV2'
            })
            honsole.log(`[MemoryMonitor] Alert sent to master (${level})`)
        } catch (error) {
            honsole.warn('[MemoryMonitor] Failed to send alert:', error.message)
        }
    }

    /**
     * Log memory status with cache sizes
     */
    async logStatus(cacheRegistry = {}) {
        const mem = this.getMemoryUsage()
        const caches = this.reportCacheSizes(cacheRegistry)

        // Update peak memory
        const heapUsedMB = parseFloat(mem.heapUsed)
        if (heapUsedMB > this.metrics.peakMemory) {
            this.metrics.peakMemory = heapUsedMB
        }

        this.metrics.cacheChecks++

        // Log every 10 checks or if memory is high
        const shouldLog = this.metrics.cacheChecks % 10 === 0 || heapUsedMB > 500
        if (shouldLog) {
            honsole.log(`[MemoryMonitor] Heap: ${mem.heapUsed}MB / ${mem.heapTotal}MB, RSS: ${mem.rss}MB, Peak: ${this.metrics.peakMemory.toFixed(2)}MB`)
            if (Object.keys(caches).length > 0) {
                honsole.log(`[MemoryMonitor] Caches:`, caches)
            }
        }

        // Send alerts based on memory level
        if (heapUsedMB > this.thresholds.critical) {
            honsole.warn(`[MemoryMonitor] 🚨 CRITICAL memory usage: ${mem.heapUsed}MB!`)
            await this.sendAlert(
                'critical',
                'Restart the bot immediately to prevent crash\\!',
                mem,
                caches
            )
        } else if (heapUsedMB > this.thresholds.warning) {
            honsole.warn(`[MemoryMonitor] ⚠️  High memory usage: ${mem.heapUsed}MB!`)
            await this.sendAlert(
                'warning',
                'Consider restarting the bot soon\\.',
                mem,
                caches
            )
        }

        return { memory: mem, caches, shouldGC: heapUsedMB > this.thresholds.gc }
    }

    /**
     * Trigger garbage collection if available (node --expose-gc)
     */
    gc() {
        if (global.gc) {
            const before = this.getMemoryUsage()
            global.gc()
            const after = this.getMemoryUsage()
            const freed = (parseFloat(before.heapUsed) - parseFloat(after.heapUsed)).toFixed(2)
            honsole.log(`[MemoryMonitor] GC triggered: ${before.heapUsed}MB -> ${after.heapUsed}MB (freed ${freed}MB)`)

            // If GC freed significant memory, notify
            if (parseFloat(freed) > 50 && this.bot && this.masterId) {
                this.bot.api.sendMessage(this.masterId, `♻️ GC freed ${freed}MB of memory`, {
                    parse_mode: 'Markdown'
                }).catch(() => {})
            }
        } else {
            honsole.dev('[MemoryMonitor] GC not available (run with --expose-gc to enable)')
        }
    }
}

export const memoryMonitor = new MemoryMonitor()
/**
 * download file from pixiv
 * @param {*} url
 * @param {*} id
 * @param {*} try_time
 * @returns
 */
// Download queue with size limit and cleanup
class DownloadQueue {
    constructor(maxSize = 10) {
        this.queue = new Set()
        this.maxSize = maxSize
    }
    
    add(url) {
        if (this.queue.size >= this.maxSize) {
            return false
        }
        this.queue.add(url)
        return true
    }
    
    remove(url) {
        this.queue.delete(url)
    }
    
    has(url) {
        return this.queue.has(url)
    }
    
    get size() {
        return this.queue.size
    }
}

const dw_queue = new DownloadQueue(9)

function mediaIdentity(url) {
    const match = typeof url === 'string' && url.match(/\/(\d+)_p(\d+)/)
    return {
        illustId: match ? Number.parseInt(match[1], 10) : null,
        page: match ? Number.parseInt(match[2], 10) : null
    }
}

export class MediaFetchError extends Error {
    constructor(url, options = {}) {
        const identity = mediaIdentity(url)
        super(`Pixiv media URL is stale: ${url}`)
        this.name = 'MediaFetchError'
        this.code = 'PIXIV_MEDIA_STALE'
        this.url = url
        this.illustId = options.illustId ?? identity.illustId
        this.page = options.page ?? identity.page
        this.cause = options.cause
    }
}

export function isStaleMediaError(error) {
    return error?.code === 'PIXIV_MEDIA_STALE'
}

// Monitor memory and clean up periodically
setInterval(async () => {
    // Monitor memory and cache sizes every 5 minutes
    const status = await memoryMonitor.logStatus({
        download_queue: dw_queue
    })

    // Trigger GC if available and memory is high
    if (status.shouldGC) {
        honsole.warn(`[common.js] Memory usage high (${status.memory.heapUsed}MB), triggering GC...`)
        memoryMonitor.gc()
    }
}, 300000) // Check every 5 minutes

export async function download_file(url, id, force = false) {
    // bypass cache, maybe not work
    if (url.includes(config.pixiv.ugoiraurl)) {
        return url + '?' + (+new Date())
    }
    if (!id) {
        if (url.includes('.pximg.net')) {
            let t = url.substring(url.lastIndexOf('/') + 1)
            id = t.substring(0, t.lastIndexOf('_'))
        }
    }
    url = url.replace('https://i-cf.pximg.net/', 'https://i.pximg.net/')
    let filename = url.split('/').slice(-1)[0]
    if (url.includes('.zip')) {
        filename = id + '.zip'
    }
    try {
        // Check if file exists asynchronously
        await fsPromises.access(`./tmp/file/${filename}`)
        if (!force) {
            return `./tmp/file/${filename}`
        }
    } catch {
        // File doesn't exist, continue to download
    }
    
    // Use loop instead of recursion for queue waiting
    let waitCount = 0
    while (dw_queue.has(url) || !dw_queue.add(url)) {
        await sleep(1000)
        honsole.dev('downloading queue wait', id, url)
        waitCount++
        if (waitCount > 3) {
            throw new Error(`Queue timeout for download: ${url}`)
        }
    }
    try {
        const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 30000, // 30 second timeout
            headers: {
                'User-Agent': config.pixiv.ua,
                // Referer policy only include domain/
                'Referer': 'https://www.pixiv.net/'
            },
            maxContentLength: 200 * 1024 * 1024, // 200MB limit for downloads
            maxBodyLength: 200 * 1024 * 1024
        })

        // Log warning if file is very large
        const size = response.data.byteLength
        if (size > 100 * 1024 * 1024) {
            honsole.warn(`[download_file] Large file downloaded: ${(size / 1024 / 1024).toFixed(2)}MB for ${filename}`)
        }

        // Ensure directory exists
        await fsPromises.mkdir('./tmp/file', { recursive: true })
        // Write file asynchronously
        await fsPromises.writeFile(`./tmp/file/${filename}`, response.data)

        return `./tmp/file/${filename}`
    } catch (error) {
        // Handle size limit errors
        if (error.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' || error.message?.includes('maxContentLength')) {
            honsole.error(`[download_file] File too large (>200MB): ${url}`)
            throw new Error(`File exceeds size limit (200MB): ${filename}`)
        }
        if (error.response?.status === 404 && url.includes('pximg.net')) {
            throw new MediaFetchError(url, { illustId: id, cause: error })
        }
        throw error
    } finally {
        dw_queue.remove(url)
    }
}

/**
 * fetch file in memory
 * @param {*} url
 * @returns arraybuffer
 */
export async function fetch_tmp_file(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': config.pixiv.ua,
                // Referer policy only include domain/
                'Referer': 'https://www.pixiv.net/'
            },
            timeout: 30000, // 30 second timeout
            maxContentLength: 50 * 1024 * 1024, // 50MB limit for in-memory fetch
            maxBodyLength: 50 * 1024 * 1024
        })

        // Log warning if file is large (>20MB in memory)
        const size = response.data.byteLength
        if (size > 20 * 1024 * 1024) {
            honsole.warn(`[fetch_tmp_file] Large file loaded in memory: ${(size / 1024 / 1024).toFixed(2)}MB from ${url}`)
        }

        return response.data
    } catch (error) {
        if (error.response?.status === 404 && url.includes('pximg.net')) {
            throw new MediaFetchError(url, { cause: error })
        }
        throw error
    }
}

export function sleep(ms) {
    // console.log('hit sleep', ms)
    return new Promise(resolve => setTimeout(resolve, ms))
}
export function generate_token(user_id, time = +new Date()) {
    return createHash('sha1').update(`${config.tg.salt}${user_id}${time}`).digest('hex').toString()
}
export const exec = promisify(exec$0)

String.prototype.escapeHTML = function () {
    return (this.replaceAll('&', '&amp;').replaceAll('>', '&gt;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'))
}
