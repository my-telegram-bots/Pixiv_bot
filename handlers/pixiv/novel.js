/**
 * get novel data
 * save novel data to MongoDB
 * fork from illust.js
 * @param {number} id novel_id
 * @param {object} flag configure
 */
const r_p = require('./r_p')
const db = require('../../db')

async function get_novel(id){
    if(id.toString().length < 6 || id.toString().length > 8)
        return false
    console.log('n',id)
    let col = await db.collection('novel')
    let novel = await col.findOne({
        id: id.toString()
    })
    if(novel) {
        delete novel._id
    }else{
        try {
            // data example https://paste.huggy.moe/mufupocomo.json
            novel = (await r_p.get('novel/' + id)).data.body
            // 应该是没有检索到 直接返回 false 得了
            if(novel.error)
                return 404
            novel = {
                id: novel.id,
                title: novel.title,
                description: novel.description,
                seriesType: novel.seriesType,
                userName: novel.userName,
                userId: novel.userId,
                restrict: novel.restrict,
                xRestrict: novel.xRestrict,
                tags: novel.tags,
                createDate: novel.createDate,
                coverUrl: novel.coverUrl,
                content: novel.content
            }
            col.insertOne(novel)
        } catch (error) {
            console.warn(error)
            return 404
        }
    }
    if(process.env.dev){
        console.log('novel',novel)
    }
    return novel
}
module.exports = get_novel