const r_p = require('./r_p')
const db = require('../../db')
/**
 * 获取 illust
 * 会进行缓存 数据存 MongoDB 里面（暂时不考虑更新这种东西）
 * @param {number} id illust_id
 * @param {object} flag 键盘的样式
 */
async function get_illust(id){
    if(id.toString().length < 6 || id.toString().length > 8)
        return false
    let col = await db.collection('illust')
    let illust = await col.findOne({
        illustId: id.toString()
    })
    let update_p_flag = true
    console.log(id)
    // 如果数据库没有缓存结果，那么就向 pixiv api 查询
    if(!illust) {
        try {
            illust = (await r_p.get('illust/' + id)).data
            // 应该是没有检索到 直接返回 false 得了
            if(illust.error)
                return 404
            illust = illust.body
        } catch (error) {
            // 一般是网路 还有登录问题
            console.warn(error)
            return 404
        }
        // 删除我觉得不需要的 data
        delete illust.zoneConfig,
        delete illust.extraData
        delete illust.userIllusts
        delete illust.noLoginData
        delete illust.fanboxPromotion
        illust.id = illust.illustId
        update_p_flag = false
    }
    if(!illust.imgs_){
        let urls = {
            thumb_urls: [],
            regular_urls: [],
            original_urls: [],
            size: []
        }
        if(illust.pageCount == 1) {
            urls = {
                thumb_urls: [illust.urls.thumb.replace('i.pximg.net', 'i-cf.pximg.net')],
                regular_urls: [illust.urls.regular.replace('i.pximg.net', 'i-cf.pximg.net')],
                original_urls: [illust.urls.original.replace('i.pximg.net', 'i-cf.pximg.net')],
                size: [{
                    width: illust.width,
                    height: illust.height
                }]
            }
        } else if(illust.pageCount > 1) {
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
                pages.forEach(p =>{
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
    if(update_p_flag){
        col.updateOne({
            id: illust.id.toString(),
        }, {
            $set: {
                imgs_: illust.imgs_
            }
        })
    }else{
        col.insertOne(illust)
    }
    return illust
}
module.exports = get_illust