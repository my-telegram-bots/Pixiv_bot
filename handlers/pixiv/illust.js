import { r_p_ajax } from './request.js'
import db from '../../db.js'
import { honsole, sleep } from '../common.js'
import { thumb_to_all } from './tools.js'


let illust_notfound_id_set = new Set();
let illust_notfound_time_map = new Map();
let illust_queue = new Set();

/**
 * get illust data
 * save illust data to MongoDB
 * @param {number} id illust_id
 * @param {boolean} fresh true => return newest data from pixiv
 * @param {object} flag configure
 */
export async function get_illust(id, fresh = false, raw = false, try_time = 0) {
    if (try_time > 4) {
        return false
    }
    if (typeof id == 'object') {
        return id
    }
    id = parseInt(id.toString())
    if (isNaN(id) || id.length > 9) {
        return false
    }

    if (illust_queue.has(id)) {
        await sleep(300)
        return await get_illust(id, fresh, raw, try_time + 1)
    }

    illust_queue.add(id)
    try {
        let illust = null
        if (!fresh && !raw) {
            illust = await db.collection.illust.findOne({ id })
            if (illust) {
                delete illust._id
                if (illust.type === 2 && !illust.imgs_.cover_img_url) {
                    fresh = true
                }
            } else {
                fresh = true
            }
        }

        if (fresh) {
            // 404 cache in memory (10 min)
            // to prevent cache attack the 404 result will be not in database.
            if (illust_notfound_id_set.has(id)) {
                let notFoundTime = illust_notfound_time_map.get(id)
                if (Date.now() - notFoundTime < 600000) { // 10 min
                    return 404
                } else {
                    illust_notfound_id_set.delete(id)
                    illust_notfound_time_map.delete(id)
                }
            }

            try {
                let illust_data = (await r_p_ajax.get('illust/' + id)).data
                honsole.dev('fetch-fresh-illust', illust_data)
                illust = await update_illust(illust_data.body)
                return illust
            } catch (error) {
                            // network, session or Work has been deleted or the ID does not exist.
                            if (error.response && error.response.status === 404) {
                    honsole.warn('404 illust', id)
                    illust_notfound_id_set.add(id)
                    illust_notfound_time_map.set(id, Date.now())
                    return 404
                } else {
                    honsole.warn(error)
                    await sleep(500)
                    return await get_illust(id, fresh, raw, try_time + 1)
                }
            }
        }

        honsole.dev('illust', illust)
        return illust
    } finally {
        illust_queue.delete(id)
    }
}

/**
 * fetch image url and size and update in database
 * @param {*} illust
 * @param {object} extra_data extra data stored in database
 * @param {boolean} id_update_flag true => will delete 'id' (string) and create id (number)
 * @returns object
 */
export async function update_illust(illust, extra_data = false, id_update_flag = true) {
    if (typeof illust != 'object') {
        return false
    }
    let real_illust = {}
    for (let key in illust) {
        // string -> number
        if (['id', 'illustId', 'userId', 'sl', 'illustType', 'illust_page_count', 'illust_id', 'illust_type', 'user_id'].includes(key) && typeof illust[key] == 'string') {
            illust[key] = parseInt(illust[key])
        }
        // _ syntax
        ['Id', 'Title', 'Type', 'Date', 'Restrict', 'Comment', 'Promotion', 'Data', 'Count', 'Original', 'Illust', 'Url', 'Name', 'userAccount', 'Name', 'ImageUrl'].forEach(k1 => {
            if (key.includes(k1)) {
                let k2 = key.replace(k1, `_${k1.toLowerCase()}`)
                illust[k2] = illust[key]
                delete illust[key]
                key = k2
            }
        })
        if (key.includes('illust_')) {
            if (!illust[key.replace('illust_', '')]) {
                illust[key.replace('illust_', '')] = illust[key]
            }
        }
        if (key.includes('user_')) {
            if (!illust[key.replace('user_', 'author_')]) {
                illust[key.replace('user_', 'author_')] = illust[key]
            }
        }
    }
    if (illust.tags) {
        if (illust.tags.tags) {
            let tags = []
            illust.tags.tags.forEach(tag => {
                tags.push(tag.tag)
            })
            illust.tags = tags
        }
    }
    // if (new Date(illust.create_date)) {
    //     illust.create_date = +new Date(illust.create_date) / 1000
    // }
    if (illust.type == 2) {
        if (!illust.urls.original) {
            // get_illust will redo this action.
            // only have this condition when subscribe or fetch author's all illusts.
            // dirty
            return await get_illust(illust.id, true)
        }
        illust.imgs_ = {
            size: [{
                width: illust.width ? illust.width : illust.imgs_.size[0].width,
                height: illust.height ? illust.height : illust.imgs_.size[0].height
            }],
            cover_img_url: illust.urls.original
        }
    } else if (!illust.imgs_ || !illust.imgs_.fsize || !illust.imgs_.fsize[0]) {
        illust.imgs_ = await thumb_to_all(illust)
        if (!illust.imgs_) {
            console.warn(illust.id, 'deleted')
            return
        }
    }
    ['id', 'title', 'type', 'comment', 'description', 'author_id', 'author_name', 'imgs_', 'tags', 'sl', 'restrict', 'x_restrict', /* 'create_date',*/ 'ai_type', 'tg_file_id', 'storage_endpoint'].forEach(x => {
        // I think pixiv isn't pass me a object?
        if (illust[x] !== undefined) {
            real_illust[x] = illust[x]
        }
    })
    if (extra_data) {
        real_illust = {
            ...real_illust,
            ...extra_data
        }
    }
    if (!id_update_flag) {
        try {
            await db.collection.illust.deleteOne({
                id: illust.id
            })
            await db.collection.illust.deleteOne({
                id: illust.id.toString()
            })
        }
        catch (error) {
            console.warn(error)
        }
    }
    await db.collection.illust.updateOne({
        id: illust.id,
    }, {
        $set: real_illust
    }, {
        upsert: true
    })
    honsole.dev(real_illust)
    return real_illust
}