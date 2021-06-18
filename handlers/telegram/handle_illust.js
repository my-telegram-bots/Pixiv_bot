
const { k_os } = require('../telegram/keyboard')
const { asyncForEach, honsole } = require('../common')
const { get_illust } = require('../pixiv/illust')
const { format } = require('./format')
const { ugoira_to_mp4 } = require('../pixiv/tools')
async function handle_illusts(ids, flag) {
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
 */
async function handle_illust(id, flag) {
    let illust = id
    if (typeof illust !== 'object' && !isNaN(parseInt(id))) {
        illust = await get_illust(id)
    }
    honsole.dev('i', illust.id)
    if (typeof illust == 'number' || !illust) {
        return illust
    }
    illust = {
        ...illust,
        nsfw: illust.xRestrict > 0,
        inline: []
    }
    if (illust.type <= 1) {
        illust.imgs_.size.forEach((size, pid) => {
            illust.inline[pid] = {
                type: 'photo',
                id: 'p_' + illust.id + '-' + pid,
                photo_url: illust.imgs_.regular_urls[pid],
                thumb_url: illust.imgs_.thumb_urls[pid],
                caption: format(illust, flag, 'inline', pid),
                photo_width: size.width,
                photo_height: size.height,
                parse_mode: 'MarkdownV2',
                ...k_os(illust.id, flag)
            }
        })
    } else if (illust.type == 2) {
        // inline + ugoira 只有在现存动图的情况下有意义
        if (illust.tg_file_id) {
            illust.inline[0] = {
                type: 'mpeg4_gif',
                id: 'p' + illust.id,
                mpeg4_file_id: illust.tg_file_id,
                caption: format(illust, flag, 'inline', 1),
                parse_mode: 'MarkdownV2',
                ...k_os(illust.id, flag)
            }
        } else {
            ugoira_to_mp4(illust.id)
        }
    }
    return illust
}
module.exports = {
    handle_illusts,
    handle_illust
}