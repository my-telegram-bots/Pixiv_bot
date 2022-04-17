import { r_p_ajax } from './request.js'
import db from '../../db.js'
import { honsole, sleep } from '../common.js'
import { thumb_to_all } from './tools.js'
let illust_notfound_id_list = []
let illust_notfound_time_list = []
let illust_queue = []

/**
 * get illust data
 * save illust data to MongoDB
 * @param {number} id illust_id
 * @param {boolean} raw true => return newest data from pixiv
 * @param {object} flag configure
 */
export async function get_illust(id, raw = false, try_time = 0) {
    if (try_time > 4) {
        return false
    }
    if (typeof id == 'object') {
        return id
    }
    id = typeof id == 'string' ? id : id.toString()
    if (id.length < 6 || id.length > 8 || id === 'NaN') {
        return false
    }
    id = parseInt(id)
    if (illust_queue.includes(id)) {
        await sleep(300)
        return await get_illust(id, raw, try_time)
    }
    if (try_time > 5) {
        console.warn('pixiv maybe banned your server\'s ip\nor network error (DNS / firewall)')
        return false
    }
    let illust = await db.collection.illust.findOne({
        id: id
    })
    if (illust) {
        delete illust._id
        if (illust.type == 2 && !illust.imgs_.cover_img_url) {
            // missing `illust.imgs_.cover_img_url`
            raw = true
        }
    } else {
        raw = true
    }
    if (raw) {
        try {
            // 404 cache in memory (10 min)
            // to prevent cache attack the 404 result will be not in database.
            if (illust_notfound_id_list.includes(id)) {
                let i = illust_notfound_id_list.indexOf(id)
                if (+new Date() - illust_notfound_time_list[i] > 600000) { // 10 min
                    illust_notfound_id_list.splice(i, 1)
                    illust_notfound_time_list.splice(i, 1)
                }
                else {
                    return 404
                }
            }
            // data example https://paste.huggy.moe/mufupocomo.json
            let illust_data = (await r_p_ajax.get('illust/' + id)).data
            honsole.dev('fetch-raw-illust', illust_data)
            illust = await update_illust(illust_data.body)
            return illust
        }
        catch (error) {
            // network, session or Work has been deleted or the ID does not exist.
            if (error.response && error.response.status == 404) {
                if (illust) {
                    console.log('origin 404, fallback old data', id)
                    return illust
                }
                else {
                    honsole.warn(new Date(), '404 illust', id)
                    illust_notfound_id_list.push(id)
                    illust_notfound_time_list.push(+new Date())
                    return 404
                }
            }
            else {
                honsole.warn(error)
                await sleep(500)
                return await get_illust(id, raw, try_time + 1)
            }
        }
    }
    honsole.dev('illust', illust)
    return illust
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
    ['id', 'title', 'type', 'comment', 'description', 'author_id', 'author_name', 'imgs_', 'tags', 'sl', 'restrict', 'x_restrict', /* 'create_date',*/ 'tg_file_id'].forEach(x => {
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