const r_p = require('./r_p')
const db = require('../../db')
const { honsole } = require('../common')
/**
 * get illust data
 * save illust data to MongoDB
 * @param {number} id illust_id
 * @param {object} flag configure
 */
async function get_illust(id, mode = 'p') {
    if (typeof id == 'object') {
        return id
    }
    id = typeof id == 'number' ? id.toString() : id
    if (id.length < 6 || id.length > 8)
        return false
    honsole.log('i', id)
    let col = db.collection.illust
    let illust = await col.findOne({
        id: id.toString()
    })
    let update_p_flag = true
    if (mode == 'local') {
        return illust
    }
    if (!illust) {
        try {
            // data example https://paste.huggy.moe/mufupocomo.json
            illust = (await r_p.get('illust/' + id)).data
            // 应该是没有检索到 直接返回 false 得了
            if (illust.error) {
                return 404
            }
            illust = illust.body
        } catch (error) {
            // network or session
            // to prevent cache attack the 404 illust will not in database.
            console.warn(error)
            return 404
        }
        update_p_flag = false
    }
    if (illust.type == undefined) {
        illust.type = illust.illustType
    }
    if (!illust.imgs_) {
        let urls = {
            thumb_urls: [],
            regular_urls: [],
            original_urls: [],
            size: []
        }
        if (illust.pageCount == 1) {
            urls = {
                thumb_urls: [illust.urls.thumb.replace('i.pximg.net', 'i-cf.pximg.net')],
                regular_urls: [illust.urls.regular.replace('i.pximg.net', 'i-cf.pximg.net')],
                original_urls: [illust.urls.original.replace('i.pximg.net', 'i-cf.pximg.net')],
                size: [{
                    width: illust.width,
                    height: illust.height
                }]
            }
        } else if (illust.pageCount > 1) {
            // 多p处理
            //     for (let i = 0; i < illust.pageCount; i++) {
            //     // 通过观察url规律 图片链接只是 p0 -> p1 这样的
            //     // 不过没有 weight 和 height 放弃了
            //     illust.imgs_.thumb_urls.push(illust.urls.thumb.replace('p0', 'p' + i))
            //     illust.imgs_.regular_urls.push(illust.urls.regular.replace('p0', 'p' + i))
            //     illust.imgs_.original_urls.push(illust.urls.original.replace('p0', 'p' + i))
            // }
            try {
                let pages = (await r_p('illust/' + id + '/pages')).data.body
                // 应该不会有 error 就不做错误处理了
                pages.forEach(p => {
                    urls.thumb_urls.push(p.urls.thumb_mini.replace('i.pximg.net', 'i-cf.pximg.net'))
                    urls.regular_urls.push(p.urls.regular.replace('i.pximg.net', 'i-cf.pximg.net'))
                    urls.original_urls.push(p.urls.original.replace('i.pximg.net', 'i-cf.pximg.net'))
                    urls.size.push({
                        width: p.width,
                        height: p.height
                    })
                })
            } catch (error) {
                console.warn(error)
            }
        }
        illust.imgs_ = urls
    }
    if (update_p_flag) {
        col.updateOne({
            id: illust.id.toString()
        }, {
            $set: {
                imgs_: illust.imgs_
            }
        })
    } else {
        col.insertOne({
            id: illust.id,
            title: illust.title,
            description: illust.description,
            type: illust.illustType,
            userName: illust.userName,
            userId: illust.userId,
            restrict: illust.restrict,
            xRestrict: illust.xRestrict,
            tags: illust.tags,
            storableTags: illust.storableTags,
            createDate: illust.createDate,
            imgs_: illust.imgs_
        })
    }
    honsole.log('illust', illust)
    return illust
}
module.exports = get_illust