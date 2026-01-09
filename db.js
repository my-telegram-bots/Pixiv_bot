import config from '#config'
import * as mongodb from 'mongodb'
const { MongoClient } = mongodb
export let db = {
    collection: dummy_collection
}
export let collection = {
    illust: dummy_collection(),
    chat_setting: dummy_collection(),
    novel: dummy_collection(),
    ranking: dummy_collection(),
    author: dummy_collection(),
    telegraph: dummy_collection()
}
export async function db_initial() {
    if (process.env.DBLESS) {
        console.warn('WARNING', 'No Database Mode(DBLESS) is not recommend for production environment.')
    } else {
        try {
            db = (await MongoClient.connect(config.mongodb.uri)).db(config.mongodb.dbname)
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
                if (['message', 'mediagroup_message', 'inline', 'version'].includes(i)) {
                    if (typeof value.format[i] == 'string') {
                        if (i === 'version') {
                            if (value.format[i] === 'v1') {
                                s.format[i] = 'v1'
                            }
                        } else {
                            s.format[i] = value.format[i]
                        }
                    } else {
                        // throw 'e'
                    }
                }
            }
            if (!s.format.version) {
                s.format.version = 'v2'
            }
            delete value.format
        }
        if (value.default) {
            s.default = {}
            for (const i in value.default) {
                if (['telegraph_title', 'telegraph_author_name', 'telegraph_author_url'].includes(i)) {
                    if (typeof value.default[i] === 'string') {
                        s.default[i] = value.default[i]
                    }
                    else {
                        // throw 'e'
                    }
                }
                if (['tags', 'description', 'open', 'share', 'remove_keyboard', 'remove_caption', 'single_caption',
                    'album', 'album_one', 'album_equal', 'reverse', 'overwrite', 'asfile', 'append_file', 'append_file_immediate',
                    'caption_extraction', 'caption_above', 'show_id', 'auto_spoiler'].includes(i)) {
                    if (typeof value.default[i] === 'boolean') {
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
            // Only process own properties to prevent prototype pollution
            if (!Object.prototype.hasOwnProperty.call(value, i)) {
                continue
            }
            // Block dangerous property names
            if (['__proto__', 'constructor', 'prototype'].includes(i)) {
                console.warn(`Blocked dangerous property in update_setting: ${i}`)
                continue
            }
            // only match add_ and del_ prefix
            let action = i.substring(0, 3)
            let ii = i.substring(4)
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
function dummy_collection() {
    return {
        find: () => { return null; },
        findOne: () => { return null; },
        insertOne: () => {
            return { acknowledged: true, insertedId: null }
        },
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
