import axios from 'axios'
import config from '#config'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import { _l } from '#handlers/telegram/i18n'
import { createHash } from 'crypto'
import { promisify } from 'util'
import { exec as exec$0 } from 'child_process'
import { get_illust } from '#handlers/pixiv/illust'
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

// TTL Cache for failed URLs (prevents unbounded growth)
class FailedURLCache {
    constructor(maxSize = 500, ttl = 600000) { // 10 minutes TTL
        this.cache = new Map()
        this.maxSize = maxSize
        this.ttl = ttl
    }

    add(key) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value
            this.cache.delete(firstKey)
        }
        this.cache.set(key, Date.now())
    }

    has(key) {
        const timestamp = this.cache.get(key)
        if (!timestamp) return false

        // Check if expired
        if (Date.now() - timestamp > this.ttl) {
            this.cache.delete(key)
            return false
        }
        return true
    }

    clear() {
        this.cache.clear()
    }

    get size() {
        return this.cache.size
    }
}

const dw_queue = new DownloadQueue(9)
// Cache for failed download URLs to prevent infinite loops (with TTL)
const download_failed_cache = new FailedURLCache(500, 600000)
// Cache for fetch failed URLs to prevent infinite loops (with TTL)
const fetch_failed_cache = new FailedURLCache(500, 600000)

// Monitor memory and clean up periodically
setInterval(async () => {
    // Monitor memory and cache sizes every 5 minutes
    const status = await memoryMonitor.logStatus({
        download_queue: dw_queue,
        download_failed_cache,
        fetch_failed_cache
    })

    // Trigger GC if available and memory is high
    if (status.shouldGC) {
        honsole.warn(`[common.js] Memory usage high (${status.memory.heapUsed}MB), triggering GC...`)
        memoryMonitor.gc()
    }
}, 300000) // Check every 5 minutes

export async function download_file(url, id, force = false, try_time = 0, skip_refetch = false) {
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
    if (try_time > 5) {
        throw new Error(`Max retry attempts reached for download: ${url}`)
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
    while (dw_queue.has(url) || !dw_queue.add(url)) {
        await sleep(1000)
        honsole.dev('downloading queue wait', id, url)
        if (try_time > 3) { // Prevent infinite waiting
            throw new Error(`Queue timeout for download: ${url}`)
        }
        try_time++
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

        dw_queue.remove(url)
        return `./tmp/file/${filename}`
    } catch (error) {
        // Handle size limit errors
        if (error.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' || error.message?.includes('maxContentLength')) {
            honsole.error(`[download_file] File too large (>200MB): ${url}`)
            dw_queue.remove(url)
            throw new Error(`File exceeds size limit (200MB): ${filename}`)
        }
        // maybe loooooop again LOL
        if (error.response && error.response.status === 404) {
            if (url.includes('pximg.net')) {
                // Add to failed cache to prevent infinite loops
                download_failed_cache.add(url)
                
                if (!skip_refetch && !download_failed_cache.has(`refetch_${id}`)) {
                    // 404 = need refetch illust in database (but prevent loops)
                    download_failed_cache.add(`refetch_${id}`)
                    honsole.dev('[404] fetching raw data (once)', id, url)
                    try {
                        const updated_illust = await get_illust(id, true)
                        if (updated_illust === 404) {
                            // If illust itself is 404, propagate the error
                            throw new Error(`Illust not found: ${id}`)
                        }
                    } catch (refetch_error) {
                        honsole.warn('[404] refetch failed', id, refetch_error.message)
                        throw new Error(`File and illust not found: ${id}`)
                    }
                }
                return false
            }
        }
        console.warn(error)
        dw_queue.remove(url)
        await sleep(Math.min(1000 * Math.pow(2, try_time), 10000)) // Exponential backoff, max 10s
        throw error // Let caller handle retry if needed
    }
}

/**
 * Wrapper for download_file with non-recursive retry logic
 */
export async function download_file_with_retry(url, id, force = false, maxRetries = 3, skip_refetch = false) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await download_file(url, id, force, attempt, skip_refetch)
        } catch (error) {
            if (attempt === maxRetries - 1) {
                throw error // Last attempt, re-throw the error
            }
            honsole.warn(`Download attempt ${attempt + 1} failed for ${url}, retrying...`)
            await sleep(Math.min(1000 * Math.pow(2, attempt), 5000)) // Exponential backoff
        }
    }
}

/**
 * fetch file in memory
 * @param {*} url
 * @returns arraybuffer
 */
export async function fetch_tmp_file(url, retry_time = 0, skip_refetch = false) {
    if (retry_time > 3) {
        throw new Error(`Failed to fetch ${url} after 3 retries: 404 Not Found`)
    }
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
        if (error.response && error.response.status === 404) {
            if (url.startsWith('https://i.pximg.net/')) {
                // Add to failed cache to prevent infinite loops
                fetch_failed_cache.add(url)
                
                const filename = url.substring(url.lastIndexOf('/') + 1)
                const id = filename.split('_')[0]
                
                if (!skip_refetch && !fetch_failed_cache.has(`refetch_${id}`)) {
                    // Only try to refetch once per ID
                    fetch_failed_cache.add(`refetch_${id}`)
                    
                    try {
                        const illust_raw = await get_illust(id, true)
                        if (illust_raw === 404) {
                            throw new Error(`Illust not found: ${id}`)
                        }
                        
                        if (illust_raw && illust_raw.imgs_) {
                            if (illust_raw.imgs_.cover_img_url) {
                                honsole.dev('[fetch_tmp_file] trying cover_img_url:', illust_raw.imgs_.cover_img_url)
                                return await fetch_tmp_file(illust_raw.imgs_.cover_img_url, retry_time, true)
                            } else if (illust_raw.imgs_.original_urls) {
                                const all_urls = [
                                    ...(illust_raw.imgs_.original_urls || []),
                                    ...(illust_raw.imgs_.regular_urls || []),
                                    ...(illust_raw.imgs_.thumb_urls || [])
                                ]
                                
                                let new_url = all_urls.find(url => url && url.endsWith(filename))
                                honsole.dev('[fetch new url]', new_url)
                                
                                if (new_url) {
                                    return await fetch_tmp_file(new_url, retry_time, true)
                                } else {
                                    const fallback_url = all_urls.find(url => url && url.includes(id))
                                    if (fallback_url) {
                                        honsole.dev('[fetch_tmp_file] trying fallback URL:', fallback_url)
                                        return await fetch_tmp_file(fallback_url, retry_time, true)
                                    }
                                    throw new Error(`File not found in illust data: ${filename}`)
                                }
                            } else {
                                throw new Error(`No image URLs found in illust data for ID: ${id}`)
                            }
                        } else {
                            throw new Error(`Failed to fetch illust data for ID: ${id}`)
                        }
                    } catch (refetch_error) {
                        honsole.warn('[fetch_tmp_file] refetch failed', id, refetch_error.message)
                        throw new Error(`File and illust not found: ${id} - ${refetch_error.message}`)
                    }
                }
            }
            throw new Error(`File not found: ${url}`)
        }
        await sleep(Math.min(1000 * Math.pow(2, retry_time), 10000))
        throw error // Let caller handle retry
    }
}

/**
 * Wrapper for fetch_tmp_file with non-recursive retry logic
 */
export async function fetch_tmp_file_with_retry(url, maxRetries = 3, skip_refetch = false) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fetch_tmp_file(url, attempt, skip_refetch)
        } catch (error) {
            if (attempt === maxRetries - 1) {
                throw error // Last attempt
            }
            honsole.warn(`Fetch attempt ${attempt + 1} failed for ${url}, retrying...`)
            await sleep(Math.min(1000 * Math.pow(2, attempt), 5000))
        }
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