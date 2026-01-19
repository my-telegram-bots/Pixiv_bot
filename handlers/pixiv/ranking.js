import db from '../../db.js'
import { honsole, asyncForEach } from '../common.js'
import { r_p_ajax } from './request.js'
import { thumb_to_all } from './tools.js'
import { update_illust } from './illust.js'
/**
 * 获取每日/每周/每月排行榜 当然 会缓存啦
 * @param {int} 页数
 * @param {*} mode daily/weekly/monthly/
 * @param {*} filter_type 过滤类型 默认是 0 2
 * @param {*} date YYYY/MM/DD 默认为GMT+9的今天
 *
 */
// 本来 date 写了一大坨 后面发现不带参数就是当天的
// 这里默认会过滤 illust_type == 1 （manga） 的结果，
export async function ranking(page = 1, mode = 'daily', date = false, filter_type = [0, 2]) {
    if (page <= 0)
        page = 1
    if (!['daily', 'weekly', 'monthly'].includes(mode))
        return false
    let params = {
        mode: mode,
        format: 'json',
        p: page
    }
    if (date) {
        params.date = date
    }
    // Calculate correct ranking date based on JST time
    // Pixiv ranking updates at GMT+9 08:00, so we need to use JST timezone
    if (!date) {
        const now = new Date()
        const jstOffset = 9 * 60 * 60 * 1000
        const jstNow = new Date(now.getTime() + jstOffset + now.getTimezoneOffset() * 60 * 1000)

        // Before JST 08:00, use previous day's ranking
        const rankingDate = new Date(jstNow)
        if (jstNow.getHours() < 8) {
            rankingDate.setDate(rankingDate.getDate() - 1)
        }

        date = rankingDate.toISOString().split("T")[0].replace(/-/g, "")
    }
    let col = db.collection.ranking
    let data = await col.findOne({
        id: mode + date + '_' + page
    })
    let isNewData = false
    if (!data) {
        isNewData = true
        data = (await r_p_ajax({
            baseURL: "https://www.pixiv.net/ranking.php",
            params: params
        })).data
        try {
            await col.insertOne({
                id: data.mode + data.date + '_' + page,
                ...data,
            })
            honsole.dev(`[ranking] Inserted new ranking data: ${mode}${date}_${page}`)
        }
        catch (error) {
            honsole.dev('[ranking] Insert error', error)
        }
    }
    const filteredData = data.contents.filter((p) => {
        return filter_type.indexOf(parseInt(p.illust_type)) > -1
    }).map((p) => {
        // Calculate regular URL from thumb URL (reliable transformation)
        // Remove size constraints like /c/240x480/, /c/480x960/, etc.
        const regularUrl = p.url.replace(/\/c\/\d+0x\d+0\//, '/')

        return {
            id: p.illust_id,
            title: p.title,
            tags: p.tags,
            author_name: p.user_name,
            author_id: p.user_id,
            type: parseInt(p.illust_type),
            rank: p.rank,
            // Use standard imgs_ structure (same as handle_illust)
            imgs_: {
                size: [{
                    width: p.width,
                    height: p.height
                }],
                thumb_urls: [p.url],
                regular_urls: [regularUrl]
            }
        }
    })

    // Only process new data in background (not cached data, not dbless mode)
    if (isNewData && !process.env.DBLESS) {
        processRankingIllusts(filteredData, mode + date + '_' + page).catch(error => {
            honsole.error('Error processing ranking illusts:', error)
        })
    } else if (isNewData && process.env.DBLESS) {
        honsole.dev(`[ranking] DBLESS mode, skipping background processing`)
    } else {
        honsole.dev(`[ranking] Using cached data for ${mode}${date}_${page}, skipping background processing`)
    }

    return {
        data: filteredData,
        date: data.date,
        next_page: data.next
    }
}

/**
 * Asynchronously process ranking illusts and store them in database
 * Uses thumb_to_all to get complete image URLs
 * MEMORY OPTIMIZED: Processes in small batches with delays
 * @param {Array} illusts Array of illust objects from ranking
 */
async function processRankingIllusts(illusts) {
    honsole.dev(`[processRankingIllusts] Starting to process ${illusts.length} illusts`)

    const BATCH_SIZE = 20 // Process 20 illusts at a time to prevent memory exhaustion
    const BATCH_DELAY = 3000 // 3 second delay between batches for GC
    const MEMORY_THRESHOLD_MB = 1500 // Stop if memory exceeds 1.5GB

    let processedCount = 0
    let skippedCount = 0

    // Process in batches to prevent memory exhaustion
    for (let i = 0; i < illusts.length; i += BATCH_SIZE) {
        const batch = illusts.slice(i, i + BATCH_SIZE)

        // Check memory before processing batch
        const memUsage = process.memoryUsage()
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024

        if (heapUsedMB > MEMORY_THRESHOLD_MB) {
            honsole.warn(`[processRankingIllusts] Memory threshold exceeded (${heapUsedMB.toFixed(2)}MB), stopping processing`)
            break
        }

        honsole.log(`[processRankingIllusts] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(illusts.length / BATCH_SIZE)} (${batch.length} illusts, memory: ${heapUsedMB.toFixed(2)}MB)`)

        await asyncForEach(batch, async (illust) => {
            try {
                // Check if illust already exists in DB with complete data
                const existingIllust = await db.collection.illust.findOne({ id: illust.id })

                // Only process if not exists or missing imgs_ data
                if (!existingIllust || !existingIllust.imgs_ || !existingIllust.imgs_.size || !existingIllust.imgs_.size[0]) {
                    honsole.dev(`[processRankingIllusts] Processing illust ${illust.id}`)

                    // Use thumb_to_all to get complete image URLs (lightweight mode for performance)
                    const imgs_ = await thumb_to_all(illust, 0, true)

                    if (imgs_) {
                        illust.imgs_ = imgs_
                        illust.type = 0 // illust type (0: illust, 1: manga, 2: ugoira)

                        // Store in database
                        await update_illust(illust, false, true, true)
                        honsole.dev(`[processRankingIllusts] Stored illust ${illust.id}`)
                        processedCount++
                    } else {
                        honsole.warn(`[processRankingIllusts] Failed to get imgs_ for illust ${illust.id}`)
                    }
                } else {
                    honsole.dev(`[processRankingIllusts] Illust ${illust.id} already exists with complete data`)
                    skippedCount++
                }
            } catch (error) {
                honsole.error(`[processRankingIllusts] Error processing illust ${illust.id}:`, error)
            }
        })

        // Delay between batches to allow garbage collection
        if (i + BATCH_SIZE < illusts.length) {
            honsole.dev(`[processRankingIllusts] Waiting ${BATCH_DELAY}ms before next batch...`)
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))

            // Suggest garbage collection (if --expose-gc flag is set)
            if (global.gc) {
                global.gc()
            }
        }
    }

    honsole.log(`[processRankingIllusts] Finished processing ${illusts.length} illusts (processed: ${processedCount}, skipped: ${skippedCount})`)
}
export default ranking
