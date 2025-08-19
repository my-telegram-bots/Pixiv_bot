import { r_p_ajax } from '#handlers/pixiv/request'
import db from '#db'
import { honsole, sleep } from '#handlers/common'
import { thumb_to_all } from '#handlers/pixiv/tools'


// Cache with TTL management
class TTLCache {
    constructor(maxSize = 1000, ttl = 600000) { // 10 minutes default TTL
        this.cache = new Map()
        this.timers = new Map()
        this.maxSize = maxSize
        this.ttl = ttl
    }
    
    set(key, value) {
        // Clean old entry if exists
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key))
        }
        
        // If cache is full, remove oldest entry
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value
            this.delete(firstKey)
        }
        
        // Set new entry with TTL
        this.cache.set(key, value)
        const timer = setTimeout(() => {
            this.delete(key)
        }, this.ttl)
        this.timers.set(key, timer)
    }
    
    has(key) {
        return this.cache.has(key)
    }
    
    get(key) {
        return this.cache.get(key)
    }
    
    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key))
            this.timers.delete(key)
        }
        this.cache.delete(key)
    }
    
    clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer)
        }
        this.timers.clear()
        this.cache.clear()
    }
    
    size() {
        return this.cache.size
    }
}

// Replace static caches with TTL caches
const illust_notfound_cache = new TTLCache(500, 600000) // 10 minutes TTL for 404s

// Queue with timestamps for timeout detection
const illust_queue = new Map() // id -> { timestamp, retries }

// Cleanup queue periodically
setInterval(() => {
    const now = Date.now()
    const staleEntries = []
    
    for (const [id, entry] of illust_queue) {
        // Remove entries older than 60 seconds
        if (now - entry.timestamp > 60000) {
            staleEntries.push(id)
        }
    }
    
    if (staleEntries.length > 0) {
        honsole.warn(`Removing ${staleEntries.length} stale queue entries:`, staleEntries)
        staleEntries.forEach(id => illust_queue.delete(id))
    }
    
    if (illust_queue.size > 100) {
        honsole.warn(`Illust queue size is large: ${illust_queue.size}`)
        // Log queue contents for debugging
        const queueIds = Array.from(illust_queue.keys())
        honsole.dev('Current queue contents:', queueIds.slice(0, 20))
    }
}, 30000) // Check every 30 seconds for more frequent cleanup

/**
 * get illust data
 * save illust data to MongoDB
 * @param {number} id illust_id
 * @param {boolean} fresh true => return newest data from pixiv
 * @param {object} flag configure
 */
export async function get_illust(id, fresh = false, raw = false, try_time = 0) {
    if (try_time > 4) {
        throw new Error(`Max retry attempts reached for illust: ${id}`)
    }
    if (typeof id == 'object') {
        return id
    }
    id = parseInt(id.toString())
    if (isNaN(id) || id.length > 9) {
        return false
    }

    // Wait for queue with timeout and better error handling
    let waitCount = 0
    const maxWaitCount = 20 // Increased from 10 to 20 (6 seconds total)
    
    while (illust_queue.has(id) && waitCount < maxWaitCount) {
        await sleep(300)
        waitCount++
        
        // Check if queue entry is stale and force cleanup if needed
        if (waitCount > 10) {
            const entry = illust_queue.get(id)
            if (entry && Date.now() - entry.timestamp > 30000) { // 30 seconds
                honsole.warn(`Force removing stale queue entry for illust ${id}`)
                illust_queue.delete(id)
                break
            }
        }
    }
    
    if (waitCount >= maxWaitCount) {
        const entry = illust_queue.get(id)
        const queueAge = entry ? Date.now() - entry.timestamp : 'unknown'
        throw new Error(`Queue timeout for illust: ${id} (waited ${waitCount * 300}ms, queue age: ${queueAge}ms)`)
    }

    // Add to queue with timestamp
    illust_queue.set(id, { timestamp: Date.now(), retries: try_time })
    try {
        let illust = null
        if (!fresh && !raw) {
            illust = await db.collection.illust.findOne({ id })
            if (illust) {
                delete illust._id
                // Check if illust is marked as deleted
                if (illust.deleted) {
                    honsole.dev('illust marked as deleted in DB', id)
                    return 404
                }
                if (illust.type === 2 && !illust.imgs_.cover_img_url) {
                    fresh = true
                }
            } else {
                fresh = true
            }
        }

        if (fresh) {
            // Check 404 cache with TTL
            if (illust_notfound_cache.has(id)) {
                return 404
            }

            try {
                let illust_data = (await r_p_ajax.get('illust/' + id)).data
                honsole.dev('fetch-fresh-illust', illust_data)
                illust = await update_illust(illust_data.body)
                return illust
            } catch (error) {
                // network, session or Work has been deleted or the ID does not exist.
                if (error.response && error.response.status === 404) {
                    honsole.warn('404 illust', id)
                    illust_notfound_cache.set(id, true)
                    
                    // Mark illust as deleted in database for future reference
                    try {
                        await db.collection.illust.updateOne(
                            { id: id },
                            { 
                                $set: { 
                                    deleted: true,
                                    deleted_at: new Date()
                                }
                            },
                            { upsert: true }
                        )
                        honsole.dev('marked illust as deleted in DB', id)
                    } catch (dbError) {
                        honsole.warn('Failed to mark illust as deleted', id, dbError)
                    }
                    
                    return 404
                } else if (error.message && error.message.includes('Request timeout')) {
                    // Handle timeout errors specially
                    honsole.warn('Request timeout for illust', id, `(attempt ${try_time + 1})`)
                    if (try_time < 2) { // Retry up to 3 times for timeouts
                        await sleep(Math.min(1000 * Math.pow(2, try_time), 5000))
                        return await get_illust(id, fresh, raw, try_time + 1)
                    } else {
                        honsole.error('Max timeout retries reached for illust', id)
                        return false // Return false instead of throwing
                    }
                } else {
                    honsole.warn(error)
                    await sleep(Math.min(500 * Math.pow(2, try_time), 5000))
                    throw error // Let caller handle retry
                }
            }
        }

        honsole.dev('illust', illust)
        return illust
    } catch (error) {
        // Enhanced error logging for queue management
        honsole.error(`Error processing illust ${id}:`, error.message)
        throw error
    } finally {
        // Always clean up queue entry
        if (illust_queue.has(id)) {
            illust_queue.delete(id)
            honsole.dev(`Removed illust ${id} from queue`)
        }
    }
}

/**
 * Wrapper for get_illust with non-recursive retry logic
 */
export async function get_illust_with_retry(id, fresh = false, raw = false, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await get_illust(id, fresh, raw, attempt)
        } catch (error) {
            if (attempt === maxRetries - 1) {
                throw error // Last attempt
            }
            honsole.warn(`Get illust attempt ${attempt + 1} failed for ${id}, retrying...`)
            await sleep(Math.min(1000 * Math.pow(2, attempt), 5000))
        }
    }
}

/**
 * fetch image url and size and update in database
 * @param {*} illust
 * @param {object} extra_data extra data stored in database
 * @param {boolean} id_update_flag true => will delete 'id' (string) and create id (number)
 * @returns object
 */
export async function update_illust(illust, extra_data = false, id_update_flag = true) {
    if (typeof illust != 'object') {
        return false
    }
    let real_illust = {}
    for (let key in illust) {
        // string -> number
        if (['id', 'illustId', 'userId', 'sl', 'illustType', 'illust_page_count', 'illust_id', 'illust_type', 'user_id'].includes(key) && typeof illust[key] == 'string') {
            illust[key] = parseInt(illust[key])
        }
        // _ syntax
        ['Id', 'Title', 'Type', 'Date', 'Restrict', 'Comment', 'Promotion', 'Data', 'Count', 'Original', 'Illust', 'Url', 'Name', 'userAccount', 'Name', 'ImageUrl'].forEach(k1 => {
            if (key.includes(k1)) {
                let k2 = key.replace(k1, `_${k1.toLowerCase()}`)
                illust[k2] = illust[key]
                delete illust[key]
                key = k2
            }
        })
        if (key.includes('illust_')) {
            if (!illust[key.replace('illust_', '')]) {
                illust[key.replace('illust_', '')] = illust[key]
            }
        }
        if (key.includes('user_')) {
            if (!illust[key.replace('user_', 'author_')]) {
                illust[key.replace('user_', 'author_')] = illust[key]
            }
        }
    }
    if (illust.tags) {
        if (illust.tags.tags) {
            let tags = []
            illust.tags.tags.forEach(tag => {
                tags.push(tag.tag)
            })
            illust.tags = tags
        }
    }
    // if (new Date(illust.create_date)) {
    //     illust.create_date = +new Date(illust.create_date) / 1000
    // }
    if (illust.type == 2) {
        if (!illust.urls.original) {
            // get_illust will redo this action.
            // only have this condition when subscribe or fetch author's all illusts.
            // dirty
            return await get_illust(illust.id, true)
        }
        illust.imgs_ = {
            size: [{
                width: illust.width ? illust.width : illust.imgs_.size[0].width,
                height: illust.height ? illust.height : illust.imgs_.size[0].height
            }],
            cover_img_url: illust.urls.original
        }
    } else if (!illust.imgs_ || !illust.imgs_.fsize || !illust.imgs_.fsize[0]) {
        illust.imgs_ = await thumb_to_all(illust)
        if (!illust.imgs_) {
            console.warn(illust.id, 'deleted')
            // Mark as deleted in database
            try {
                await db.collection.illust.updateOne(
                    { id: illust.id },
                    { 
                        $set: { 
                            deleted: true,
                            deleted_at: new Date()
                        }
                    },
                    { upsert: true }
                )
                honsole.dev('marked illust as deleted in update_illust', illust.id)
            } catch (dbError) {
                honsole.warn('Failed to mark illust as deleted in update_illust', illust.id, dbError)
            }
            return
        }
    }
    ['id', 'title', 'type', 'comment', 'description', 'author_id', 'author_name', 'imgs_', 'tags', 'sl', 'restrict', 'x_restrict', /* 'create_date',*/ 'ai_type', 'tg_file_id', 'storage_endpoint'].forEach(x => {
        // I think pixiv isn't pass me a object?
        if (illust[x] !== undefined) {
            real_illust[x] = illust[x]
        }
    })
    if (extra_data) {
        real_illust = {
            ...real_illust,
            ...extra_data
        }
    }
    if (!id_update_flag) {
        try {
            await db.collection.illust.deleteOne({
                id: illust.id
            })
            await db.collection.illust.deleteOne({
                id: illust.id.toString()
            })
        }
        catch (error) {
            console.warn(error)
        }
    }
    await db.collection.illust.updateOne({
        id: illust.id,
    }, {
        $set: real_illust
    }, {
        upsert: true
    })
    honsole.dev('real_illust', real_illust)
    return real_illust
}