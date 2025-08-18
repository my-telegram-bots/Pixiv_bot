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
// Cache for failed download URLs to prevent infinite loops
const download_failed_cache = new Set()
// Cache for fetch failed URLs to prevent infinite loops  
const fetch_failed_cache = new Set()

// Clear failed caches periodically to prevent memory leaks
setInterval(() => {
    if (download_failed_cache.size > 1000) {
        honsole.warn(`Download failed cache size is large: ${download_failed_cache.size}, clearing...`)
        download_failed_cache.clear()
    }
    if (fetch_failed_cache.size > 1000) {
        honsole.warn(`Fetch failed cache size is large: ${fetch_failed_cache.size}, clearing...`)
        fetch_failed_cache.clear()
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
            }
        })
        
        // Ensure directory exists
        await fsPromises.mkdir('./tmp/file', { recursive: true })
        // Write file asynchronously
        await fsPromises.writeFile(`./tmp/file/${filename}`, response.data)
        
        dw_queue.remove(url)
        return `./tmp/file/${filename}`
    } catch (error) {
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
        return (await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': config.pixiv.ua,
                // Referer policy only include domain/
                'Referer': 'https://www.pixiv.net/'
            }
        })).data
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
                                return await fetch_tmp_file(illust_raw.imgs_.cover_img_url, retry_time, true)
                            } else if (illust_raw.imgs_.original_urls) {
                                let new_url = [...illust_raw.imgs_.original_urls, ...illust_raw.imgs_.regular_urls, ...illust_raw.imgs_.thumb_urls].find(url => {
                                    return url.endsWith(filename)
                                })
                                honsole.dev('[fetch new url]', new_url)
                                if (new_url) {
                                    return await fetch_tmp_file(new_url, retry_time, true)
                                } else {
                                    throw new Error(`File not found in illust data: ${filename}`)
                                }
                            }
                        } else {
                            throw new Error(`Failed to fetch illust data for ID: ${id}`)
                        }
                    } catch (refetch_error) {
                        honsole.warn('[fetch_tmp_file] refetch failed', id, refetch_error.message)
                        throw new Error(`File and illust not found: ${id}`)
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