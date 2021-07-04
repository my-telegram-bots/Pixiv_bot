/**
 * get novel data
 * save novel data to MongoDB
 * fork from illust.js
 * @param {number} id novel_id
 * @param {object} flag configure
 */
const { r_p_ajax } = require('./request')
const db = require('../../db')
const { honsole } = require('../common')

async function get_novel(id) {
    if (id.toString().length < 6 || id.toString().length > 8)
        return false
    honsole.dev('n', id)
    let col = db.collection.novel
    let novel = await col.findOne({
        id: id.toString()
    })
    if (!novel) {
        try {
            novel = (await r_p_ajax.get('novel/' + id)).data.body
            if (novel.error) {
                return 404
            }
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
                content: novel.content.replaceAll('\r\n', '\n').replaceAll('[newpage]\n', '')
            }
            col.insertOne(novel)
        } catch (error) {
            console.warn(error)
            return 404
        }
    }
    honsole.dev('novel', novel)
    return novel
}
module.exports = get_novel