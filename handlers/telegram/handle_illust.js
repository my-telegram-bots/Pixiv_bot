
const { k_os } = require('../telegram/keyboard')
const { asyncForEach } = require('../common')
const get_illust = require('../pixiv/illust')
const r_p = require('../pixiv/r_p')
const { format } = require('./format')
/**
 * 处理成tg友好型数据
 * 作为 ../pixiv/illust 的tg封装
 * @param {*} id 
 * @param {*} flag 

 */
async function handle_illust(id,flag){
    let illust = await get_illust(id)
    if(!typeof illust == 'number' || !illust)
        return illust
    let td = {
        id: illust.id,
        title: illust.title,
        author_name: illust.userName,
        author_id: illust.userId,
        inline: [],
        tags: []
    }
    asyncForEach(illust.tags.tags, tag => {
        td.tags.push(tag.tag)
    })
    if(illust.illustType <= 1){
        td = {
            ...td,
            thumb_urls: [],
            regular_urls: [],
            original_urls: [],
            size: [],
            mediagroup_o: [],
            mediagroup_r: [],
        }
        // for (let i = 0; i < illust.pageCount; i++) {
        //     // 通过观察url规律 图片链接只是 p0 -> p1 这样的
        //     // 不过没有 weight 和 height 放弃了
        //     td.thumb_urls.push(illust.urls.thumb.replace('p0', 'p' + i))
        //     td.regular_urls.push(illust.urls.regular.replace('p0', 'p' + i))
        //     td.original_urls.push(illust.urls.original.replace('p0', 'p' + i))
        // }
        if(illust.pageCount == 1) {
            td = {
                ...td,
                thumb_urls: [illust.urls.thumb],
                regular_urls: [illust.urls.regular],
                original_urls: [illust.urls.original],
                size: [{
                    width: illust.width,
                    height: illust.height
                }]
            }
        } else if(illust.pageCount > 1) {
            // 多p处理
            try {
                let pages = (await r_p('illust/' + id + '/pages')).data.body
                // 应该不会有 error 就不做错误处理了
                pages.forEach(p =>{
                    td.thumb_urls.push(p.urls.thumb_mini.replace('i.pximg.net', 'i-cf.pximg.net'))
                    td.regular_urls.push(p.urls.regular.replace('i.pximg.net', 'i-cf.pximg.net'))
                    td.original_urls.push(p.urls.original.replace('i.pximg.net', 'i-cf.pximg.net'))
                    td.size.push({
                        width: p.width,
                        height: p.height
                    })
                })
            } catch (error) {
                console.warn(error)
            }
        }
        await asyncForEach(td.size, (size, pid) => {
            // 10个一组 mediagroup
            let gid = Math.floor(pid / 10)
            if(!td.mediagroup_o[gid]) {
                td.mediagroup_o[gid] = []
                td.mediagroup_r[gid] = []
            }
            td.mediagroup_o[gid][pid % 10] = {
                type: 'photo',
                media: td.original_urls[pid],
                caption: format(td,flag,'message',pid),
                parse_mode: 'Markdown',
                type: 'photo'
            }
            td.mediagroup_r[gid][pid % 10] = td.mediagroup_o[gid][pid % 10]
            td.mediagroup_r[gid][pid % 10].media = td.regular_urls[pid]
            td.inline[pid] = {
                type: 'photo',
                id: 'p_' + illust.id + '-' + pid,
                // 图片 size 太大基本发不出去了 用小图凑合
                photo_url: (size.width > 2000 || size.height > 2000) ? td.regular_urls[pid] : td.original_urls[pid],
                thumb_url: td.thumb_urls[pid],
                caption: format(td,flag,'inline',pid),
                parse_mode: 'Markdown',
                photo_width: size.width,
                photo_height: size.height,
                ...k_os(illust.id,flag)
            }
        })
    }else if(illust.illustType == 2){
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
                caption: format(td,flag,'message',1),
                parse_mode: 'Markdown',
                ...k_os(illust.id,flag)
            }
        }
    }
    return {
        id: id,
        title: illust.title,
        type: illust.illustType,
        td: td
    }
}
module.exports = handle_illust