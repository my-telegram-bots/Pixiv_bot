const r_p = require('./r_p')
const { asyncForEach, sleep, honsole, ugoira_to_mp4 } = require('../common')
const db = require('../../db')
const { thumb_to_all } = require('./tools')
/**
 * get user data
 * save illust data to MongoDB
 * @param {number} id illust_id
 * @param {object} flag configure
 */
async function get_user(id) {
    if (id.toString().length > 8 && id > 80000000)
        return false
    honsole.log('u', id)
}
/**
 * get user's (all) illusts
 * @param {*} id user id
 * @param {*} page when pages = 0 will return all illusts
 * @param {*} try_time 
 * @returns object / boolean
 */
async function get_user_illusts(id, page = 0, try_time = 0) {
    let col = db.collection.illust
    if (try_time > 5) {
        return false
    }
    try {
        if (typeof page == 'number') {
            let illusts = []
            let illust_id_list_all = (await r_p.get(`user/${id}/profile/all`)).data
            if (illust_id_list_all.error) {
                return 404
            }
            if (illust_id_list_all.body && illust_id_list_all.body.illusts) {
                illust_id_list_all = illust_id_list_all.body.illusts
                let illust_id_list_p = [[]]
                // 50 items per page
                for (const id in illust_id_list_all) {
                    illust_id_list_p[illust_id_list_p.length - 1].push(id)
                    if (illust_id_list_p[illust_id_list_p.length - 1].length > 49) {
                        illust_id_list_p.push([])
                    }
                }
                if (page != 0) {
                    illust_id_list_p = [illust_id_list_p[page - 1]]
                }
                await asyncForEach(illust_id_list_p, async illust_id_list => {
                    if (illust_id_list.length > 0) {
                        if (a = await get_user_illusts(id, illust_id_list)) {
                            illusts = [...illusts, ...a]
                        }
                    }
                })
                return illusts.filter(i => {
                    return i.id
                })
            }
        } else if (typeof page == 'object') {
            let illusts = page
            let local_illust_data = await (col.find({
                $or: page.map(id => {
                    return {
                        id: id
                    }
                })
            }))
            await local_illust_data.forEach(illust => {
                // s**t code
                illusts[page.indexOf(illust.id)] = illust
            })
            let p = illusts.filter(x => { return typeof x != 'object' })
            if (p.length > 0) {
                honsole.dev('query from pixiv', p)
                let illusts_data = (await r_p.get(`user/${id}/profile/illusts?ids%5B%5D=${p.join('&ids%5B%5D=')}&work_category=illustManga&is_first_page=1`)).data
                for (const id in illusts_data.body.works) {
                    illusts[page.indexOf(id)] = {
                        ...illusts_data.body.works[id],
                        flag: true
                    }
                }
            }
            await asyncForEach(illusts, async (illust, id) => {
                let extra = {}
                if (illust.type == 2) {
                    ugoira_to_mp4(illust.id)
                }
                if (!illust.flag) return
                extra.type = illust.illustType
                extra.imgs_ = {
                    thumb_urls: [],
                    regular_urls: [],
                    original_urls: [],
                    size: []
                }
                if (illust.illustType <= 1) {
                    extra.imgs_ = await thumb_to_all(illust)
                } else if (illust.illustType == 2) {
                    extra.imgs_ = {
                        size: [{
                            width: illust.width,
                            height: illust.height
                        }]
                    }
                }
                illust = {
                    id: illust.id,
                    title: illust.title,
                    description: illust.description,
                    type: illust.illustType,
                    userName: illust.userName,
                    userId: illust.userId,
                    restrict: illust.restrict,
                    xRestrict: illust.xRestrict,
                    tags: illust.tags,
                    createDate: illust.createDate,
                    imgs_: extra.imgs_
                }
                try {
                    col.insertOne(illust)
                } catch (error) {
                    console.warn(error)
                }
                illusts[id] = {
                    ...illust,
                    ...illust.imgs_
                }
                delete illusts[id].imgs_
            })
            return illusts
        }
    } catch (e) {
        console.warn(e)
        await sleep(500)
        return get_user_illusts(id, page, try_time++)
    }
    return false
}
module.exports = {
    get_user,
    get_user_illusts
}