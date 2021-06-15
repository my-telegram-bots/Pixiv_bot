const config = require('./config.json')
const { MongoClient } = require("mongodb")
let db = null
let col = {
    illust: ()=>{},
    chat_setting: ()=>{},
    novel: ()=>{},
    ranking: ()=>{}
}
async function db_initial(){
    db = (await MongoClient.connect(config.mongodb.uri, { useUnifiedTopology: true })).db(config.mongodb.dbname)
    for (const key in col) {
        col[key] = db.collection(key)
    }
}
async function update_setting(value, chat_id, flag){
    try {
        let s = {
            format: {},
            default: {}
        }
        if (value.format) {
            for (const i in value.format) {
                if (['message', 'mediagroup_message', 'inline'].includes(i)) {
                    if (typeof value.format[i] == 'string') {
                        s.format[i] = value.format[i]
                    } else {
                        // throw 'e'
                    }
                }
            }
        }
        if (value.default) {
            for (const i in value.default) {
                if (['tags', 'open', 'share', 'remove_keyboard', 'remove_caption', 'single_caption', 'album', 'desc'].includes(i)) {
                    if (typeof value.default[i] == 'boolean') {
                        s.default[i] = value.default[i]
                    } else {
                        // throw 'e'
                    }
                }
            }
        }
        if (flag.setting.dbless) {
            await col.chat_setting.insertOne({
                id: chat_id,
                ...s
            })
        } else {
            await col.chat_setting.updateOne({
                id: chat_id,
            }, {
                $set: s
            })
        }
        return true
    } catch (error) {
        console.warn(error)
        return false
    }
}
async function delete_setting(chat_id){
    try {
        await col.chat_setting.deleteOne({
            id: chat_id
        })
        return true
    } catch (error) {
        console.warn(error)
        return false
    }
}
module.exports = {
    db_initial,
    db: db,
    collection: col,
    update_setting,
    delete_setting
}