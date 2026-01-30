import { asyncForEach, honsole } from '../common.js'
import { get_illust } from '../pixiv/illust.js'
import { mg_create } from './mediagroup.js'
export async function handle_illusts(ids, flag) {
    if (!ids instanceof Array) {
        ids = [ids]
    }
    await asyncForEach(ids, async (d, id) => {
        ids[id] = await handle_illust(d, flag)
    })
    return ids
}
/**
 * 处理成 tg 友好型数据
 * 作为 ../pixiv/illust 的 tg 封装
 * @param {*} id
 * @param {*} flag
 * @param {boolean} lightweight Lightweight mode for inline query (skip head_url check)
 */
export async function handle_illust(id, flag, lightweight = false) {
    let illust = id
    if (typeof illust !== 'object' && !isNaN(parseInt(id))) {
        try {
            illust = await get_illust(id, false, false, 0, lightweight)
        } catch (error) {
            // Handle queue timeout and other errors gracefully
            honsole.error(`Error fetching illust ${id}:`, error.message)
            // Return false to indicate failure (handled in app.js)
            return false
        }
    }
    honsole.dev('i', illust.id)

    //  返回错误代码，follow get_illust 虽然只有 404 就是
    if (typeof illust === 'number' || !illust) {
        return illust
    }
    illust = {
        ...illust,
        //                                               || illust.tags.includes('R18-G')
        nsfw: illust.xRestrict > 0 || (illust.tags && illust.tags.includes('R-18')),
        ai: !illust.ai_type === undefined || illust.ai_type === 2
    }
    if (illust.nsfw && flag.auto_spoiler) {
        flag.spoiler = true
    }

    // Note: .inline field removed - it was redundant dead code
    // Inline query handler (app.js) uses illustService.getQuick() and builds inline results directly
    // This function is only called for regular messages, which only need .mediagroup
    illust.mediagroup = await mg_create(illust, flag)
    return illust
}