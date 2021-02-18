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
        // 插裤
        col.insertOne(illust)
    }
    return illust
}
module.exports = get_illust