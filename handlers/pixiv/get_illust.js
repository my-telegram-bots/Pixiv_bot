const r_p = require('./r_p')
const db = require('../../db')
const { asyncForEach } = require('../common')
const { Markup } = require('telegraf')

/**
 * 获取 illust
 * 会进行缓存 数据存 MongoDB 里面（暂时不考虑更新这种东西）
 * @param {number} id illust_id
 * @param {boolean} show_tags 是否输出tag
 * @param {boolean} show_inline_keyboard 是否输出键盘
 * @param {number} mode 模式
 */
async function get_illust(id,show_tags = false,show_inline_keyboard = false,mode = 0) {
    if(id.toString().length < 6 || id.toString().length > 8)
        return false
    let col = await db.collection('illust')
    let illust = await col.findOne({
        illustId: id.toString()
    })
    console.log(id)
    // 如果数据库没有缓存结果，那么就向 pixiv api 查询
    if(!illust) {
        try {
            illust = (await r_p.get('illust/' + id)).data
            // 应该是没有检索到 直接返回 false 得了
            if(illust.error)
                return false
            illust = illust.body
        } catch (error) {
            // 一般是网路 还有登录问题
            console.error(error)
        }
        // 删除我觉得不需要的 data
        delete illust.zoneConfig,
        delete illust.extraData
        delete illust.userIllusts
        delete illust.noLoginData
        delete illust.fanboxPromotion
        illust.id = illust.illustId
        // 插裤
        col.insertOne(illust)
    }
    // 接下来是处理成 tg 要的格式（图片之类的）
    let td = {
        tags: []
    }
    asyncForEach(illust.tags.tags, tag => {
        td.tags.push(tag.tag)
    })
    if(illust.illustType <= 1){
        // for (let i = 0; i < illust.pageCount; i++) {
        //     // 通过观察url规律 图片链接只是 p0 -> p1 这样的
        //     // 不过没有 weight 和 height 放弃了
        //     td.thumb_urls.push(illust.urls.thumb.replace('p0', 'p' + i))
        //     td.regular_urls.push(illust.urls.regular.replace('p0', 'p' + i))
        //     td.original_urls.push(illust.urls.original.replace('p0', 'p' + i))
        // }
        if(illust.pageCount == 1) {
            td = {
                thumb_urls: [illust.urls.thumb],
                regular_urls: [illust.urls.regular],
                original_urls: [illust.urls.original],
                size: [{
                    width: illust.width,
                    height: illust.height
                }],
                tags: td.tags
            }
        } else if(illust.pageCount > 1) {
            // 多p处理
            try {
                td = {
                    thumb_urls: [],
                    regular_urls: [],
                    original_urls: [],
                    size: [],
                    tags: td.tags
                }
                let pages = (await r_p('illust/' + id + '/pages')).data.body
                // 应该不会有 error 就不 return 了
                pages.forEach(p => {
                    td.thumb_urls.push(p.urls.thumb_mini)
                    td.regular_urls.push(p.urls.regular)
                    td.original_urls.push(p.urls.original)
                    td.size.push({
                        width: p.width,
                        height: p.height
                    })
                })
            } catch (error) {
                console.error(error)
            }
        }
        td = td
        td.mediagroup_o = []
        td.mediagroup_r = []
        td.inline = []
        await asyncForEach(td.size, (size, pid) => {
            caption = illust.title + (td.original_urls.length > 1 ? (' #' + (pid + 1).toString()) : '')
            if(show_tags)
                caption += '\n' + td.tags.map(tag => {
                    return '#' + tag + ' '
                })
            // 10个一组 mediagroup
            let gid = Math.floor(pid / 10)
            if(!td.mediagroup_o[gid]) {
                td.mediagroup_o[gid] = []
                td.mediagroup_r[gid] = []
            }
            td.mediagroup_o[gid][pid % 10] = {
                type: 'photo',
                media: td.original_urls[pid].replace('https://i.pximg.net/', 'https://i-cf.pximg.net/'),
                caption: caption +  `\npixiv.net/i/${illust.id}`,
                type: 'photo'
            }
            td.mediagroup_r[gid][pid % 10] = td.mediagroup_o[gid][pid % 10]
            td.mediagroup_r[gid][pid % 10].media = td.regular_urls[pid].replace('https://i.pximg.net/', 'https://i-cf.pximg.net/')
            td.inline[pid] = {
                type: 'photo',
                id: 'p_' + illust.id + '-' + pid,
                // 图片 size 太大基本发不出去了 用小图凑合
                photo_url: (size.width > 2000 || size.height > 2000) ? td.regular_urls[pid] : td.original_urls[pid],
                thumb_url: td.thumb_urls[pid],
                caption: caption,
                photo_width: size.width,
                photo_height: size.height,
                ...Markup.inlineKeyboard([[
                    Markup.button.url('open', 'https://www.pixiv.net/artworks/' + illust.id),
                    Markup.button.switchToChat('share', 'https://pixiv.net/i/' + illust.id + (show_tags ? ' +tags' : ''))
                ]])
            }
        })
    }else if(illust.illustType == 2){
        // inline 只有在现存动图的情况下有意义
        if(illust.tg_file_id){
            td = {
                size: [{
                    width: illust.width,
                    height: illust.height
                }],
                inline: [],
                tags: td.tags
            }
            let caption = illust.title
            if (show_tags)
                caption += '\n' + td.tags.map(tag => {
                    return '#' + tag + ' '
                })
            td.tg_file_id = illust.tg_file_id
            td.inline[0] = {
                type: 'mpeg4_gif',
                id: 'p' + illust.id,
                mpeg4_file_id: illust.tg_file_id,
                caption: caption,
                ...Markup.inlineKeyboard([[
                    Markup.button.url('open', 'https://www.pixiv.net/artworks/' + illust.id),
                    Markup.button.switchToChat('share', 'https://pixiv.net/i/' + illust.id)
                ]])
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
module.exports = get_illust