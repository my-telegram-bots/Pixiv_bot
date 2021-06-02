
const { k_os } = require('../telegram/keyboard')
const { asyncForEach } = require('../common')
const get_illust = require('../pixiv/illust')
const r_p = require('../pixiv/r_p')
const { format } = require('./format')
/**
 * 处理成 tg 友好型数据
 * 作为 ../pixiv/illust 的 tg 封装
 * @param {*} id 
 * @param {*} flag 
 */
async function handle_illust(id,flag){
    let illust = await get_illust(id)
    if(typeof illust == 'number' || !illust)
        return illust
    let td = {
        ...illust.imgs_,
        id: illust.id,
        title: illust.title,
        type: illust.type,
        author_name: illust.userName,
        author_id: illust.userId,
        inline: [],
        tags: [],
        nsfw: illust.xRestrict > 0
    }
    illust.tags.tags.forEach(tag => {
        td.tags.push(tag.tag)  
    })
    if(illust.type <= 1){
        td.size.forEach((size, pid) => {
            td.inline[pid] = {
                type: 'photo',
                id: 'p_' + illust.id + '-' + pid,
                // 图片 size 太大基本发不出去了 用小图凑合
                photo_url: (size.width > 2000 || size.height > 2000) ? td.regular_urls[pid] : td.original_urls[pid],
                thumb_url: td.thumb_urls[pid],
                caption: format(td,flag,'inline',pid,flag.setting.format.inline),
                parse_mode: 'MarkdownV2',
                photo_width: size.width,
                photo_height: size.height,
                ...k_os(illust.id,flag)
            }
        })
    }else if(illust.type == 2){
        // inline + ugoira 只有在现存动图的情况下有意义
        if(illust.tg_file_id){
            td = {
                ...td,
                size: [{
                    width: illust.width,
                    height: illust.height
                }]
            }
            td.tg_file_id = illust.tg_file_id
            td.inline[0] = {
                type: 'mpeg4_gif',
                id: 'p' + illust.id,
                mpeg4_file_id: illust.tg_file_id,
                caption: format(td,flag,'inline',1,flag.setting.format.inline),
                parse_mode: 'MarkdownV2',
                ...k_os(illust.id,flag)
            }
        }
    }
    return {
        id: id,
        title: illust.title,
        type: illust.type,
        td: td
    }
}
module.exports = handle_illust