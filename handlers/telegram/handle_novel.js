const db = require("../../db")
const get_novel = require("../pixiv/novel")
const { novel2telegraph } = require('./telegraph')

/**
 * handle novel data to Telegram
 * @param {*} id 
 */
async function handle_novel(id) {
    let novel = await get_novel(id)
    if (novel) {
        if (!novel.telegraph_url) {
            let data = await novel2telegraph(novel)
            if (data.ok) {
                novel.telegraph_url = data.result.telegraph_url
                let col = db.collection.novel
                col.updateOne({
                    _id: novel._id
                }, {
                    $set: {
                        telegraph_url: novel.telegraph_url
                    }
                })
            }
        }
        delete novel._id
    }
    return novel
}
module.exports = {
    handle_novel
}