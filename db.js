import config from './config.js'
import * as mongodb from 'mongodb'
const { MongoClient } = mongodb
export let db = {
    collection: fake_collection
}
export let collection = {
    illust: fake_collection(),
    chat_setting: fake_collection(),
    novel: fake_collection(),
    ranking: fake_collection(),
    author: fake_collection(),
    telegraph: fake_collection()
}
export async function db_initial() {
    if (!process.env.DBLESS) {
        try {
            db = (await MongoClient.connect(config.mongodb.uri, { useUnifiedTopology: true })).db(config.mongodb.dbname)
            for (const key in collection) {
                collection[key] = db.collection(key)
            }
        }
        catch (error) {
            console.error('Connect Database Error', error)
            process.exit()
        }
    }
}
export async function update_setting(value, chat_id, flag) {
    try {
        let s = {}
        let u = {}
        if (value.format) {
            s.format = {}
            for (const i in value.format) {
                if (['message', 'mediagroup_message', 'inline'].includes(i)) {
                    if (typeof value.format[i] == 'string') {
                        s.format[i] = value.format[i]
                    }
                    else {
                        // throw 'e'
                    }
                }
            }
            delete value.format
        }
        if (value.default) {
            s.default = {}
            for (const i in value.default) {
                if (['telegraph_title', 'telegraph_author_name', 'telegraph_author_url'].includes(i)) {
                    if (typeof value.default[i] == 'string') {
                        s.default[i] = value.default[i]
                    }
                    else {
                        // throw 'e'
                    }
                }
                if (['tags', 'open', 'share', 'remove_keyboard', 'remove_caption', 'single_caption', 'album', 'same_album', 'desc', 'overwrite', 'asfile'].includes(i)) {
                    if (typeof value.default[i] == 'boolean') {
                        s.default[i] = value.default[i]
                    }
                    else {
                        // throw 'e'
                    }
                }
            }
            delete value.default
        }
        for (let i in value) {
            // only match add_ and del_ prefix
            let action = i.substr(0, 3)
            let ii = i.substr(4)
            let v = null
            let index = null
            // time based value
            if (['subscribe_author', 'subscribe_author_bookmarks'].includes(ii)) {
                v = +new Date()
                index = value[i]
            }
            // value based value (
            if (['link_chat'].includes(ii)) {
                if (typeof value[i] === 'string') {
                    index = value[i]
                }
                else {
                    index = value[i].chat_id
                }
                v = {
                    sync: parseInt(value[i].sync),
                    administrator_only: parseInt(value[i].administrator_only),
                    repeat: parseInt(value[i].repeat),
                    type: value[i].type,
                    mediagroup_count: 1
                }
            }
            if (action === 'add') {
                s[`${ii}_list.${index}`] = v
            }
            else if (action === 'del') {
                u[`${ii}_list.${index}`] = { $exists: true }
            }
        }
        let update_data = {}
        if (JSON.stringify(s).length > 2) {
            update_data.$set = s
        }
        if (JSON.stringify(u).length > 2) {
            update_data.$unset = u
        }
        await collection.chat_setting.updateOne({
            id: chat_id,
        }, update_data, {
            upsert: true
        })
        return true
    }
    catch (error) {
        console.warn(error)
        return false
    }
}
export async function delete_setting(chat_id) {
    try {
        await collection.chat_setting.updateOne({
            id: chat_id
        }, {
            $unset: {
                default: { $exists: true },
                format: { $exists: true }
            }
        })
        return true
    }
    catch (error) {
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
        find: () => { return null; },
        findOne: () => { return null; },
        updateOne: () => {
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
        },
        replaceOne: () => {
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
        }
    }
}
export default {
    db_initial,
    db,
    collection,
    update_setting,
    delete_setting
}
