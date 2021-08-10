const config = require('./config.json')
const { MongoClient } = require("mongodb")
let db = {
    collection: fake_collection
}
let col = {
    illust: fake_collection(),
    chat_setting: fake_collection(),
    novel: fake_collection(),
    ranking: fake_collection(),
    author: fake_collection(),
    telegraph: fake_collection()
}
async function db_initial() {
    if (!process.env.DBLESS) {
        try {
            db = (await MongoClient.connect(config.mongodb.uri, { useUnifiedTopology: true })).db(config.mongodb.dbname)
            for (const key in col) {
                col[key] = db.collection(key)
            }
        } catch (error) {
            console.error('Connect Database Error', error)
            process.exit()
        }
    }
}
async function update_setting(value, chat_id, flag) {
    try {
        let s = {}
        let u = {}
        if (value.format) {
            s.format = {}
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
            s.default = {}
            for (const i in value.default) {
                if (['telegraph_title', 'telegraph_author_name', 'telegraph_author_url'].includes(i)) {
                    if (typeof value.default[i] == 'string') {
                        s.default[i] = value.default[i]
                    } else {
                        // throw 'e'
                    }
                }
                if (['tags', 'open', 'share', 'remove_keyboard', 'remove_caption', 'single_caption', 'album', 'desc', 'overwrite', 'asfile'].includes(i)) {
                    if (typeof value.default[i] == 'boolean') {
                        s.default[i] = value.default[i]
                    } else {
                        // throw 'e'
                    }
                }
            }
        }
        for (const i in value) {
            // only match add_ and del_ prefix
            if (['subscribe_author', 'subscribe_author_bookmarks'].includes(i.replace('add_', '').replace('del_', ''))) {
                if (i.substr(0, 4) == 'add_') {
                    s[`${i.replace('add_', '')}_list.${value[i]}`] = +new Date()
                } else if (i.substr(0, 4) == 'del_') {
                    u[`${i.replace('del_', '')}_list.${value[i]}`] = { $exists: true }
                }
            }
        }
        let update_data = {
            $set: s,
        }
        if (JSON.stringify(u).length > 2) {
            update_data.$unset = u
        }
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
        await col.chat_setting.updateOne({
            id: chat_id
        }, {
            $unset: {
                default: { $exists: true },
                format: { $exists: true }
            }
        })
        return true
    } catch (error) {
        console.warn(error)
        return false
    }
}
/**
 * give null & modified data for dbless mode
 * @returns {}
 */
function fake_collection() {
    return {
        find: () => { return null },
        findOne: () => { return null },
        updateOne: () => {
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
        },
        replaceOne: () => {
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
        }
    }
}
module.exports = {
    db_initial,
    db: db,
    collection: col,
    update_setting,
    delete_setting
}