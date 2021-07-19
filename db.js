const config = require('./config.json')
const { MongoClient } = require("mongodb")
let db = null
let col = {
    illust: () => { },
    chat_setting: () => { },
    novel: () => { },
    ranking: () => { },
    author: () => { },
    telegraph: () => { }
}
async function db_initial() {
    db = (await MongoClient.connect(config.mongodb.uri, { useUnifiedTopology: true })).db(config.mongodb.dbname)
    for (const key in col) {
        col[key] = db.collection(key)
    }
}
async function update_setting(value, chat_id, flag) {
    try {
        let s = {
            format: {},
            default: {}
        }
        let u = {}
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
                if (['telegraph_title', 'telegraph_author_name', 'telegraph_author_url'].includes(i)) {
                    if (typeof value.default[i] == 'string') {
                        s.default[i] = value.default[i]
                    } else {
                        // throw 'e'
                    }
                }
                if (['tags', 'open', 'share', 'remove_keyboard', 'remove_caption', 'single_caption', 'album', 'desc', 'overwrite'].includes(i)) {
                    if (typeof value.default[i] == 'boolean') {
                        s.default[i] = value.default[i]
                    } else {
                        // throw 'e'
                    }
                }
            }
        }
        for (const i in value) {
            if (['add_subscribe_author'].includes(i)) {
                s[`${i.replace('add_', '')}_list.${value[i]}`] = +new Date()
            }
            if (['del_subscribe_author'].includes(i)) {
                u[`${i.replace('del_', '')}_list.${value[i]}`] = { $exists: true }
            }
        }
        let update_data = {
            $set: s,
        }
        if (JSON.stringify(u).length > 2) {
            update_data.$unset = u
        }
        console.log(update_data )
        await col.chat_setting.updateOne({
            id: chat_id,
        }, update_data, {
            upsert: true
        })
        return true
    } catch (error) {
        console.warn(error)
        return false
    }
}
async function delete_setting(chat_id) {
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