const r_p = require('./r_p')
const { asyncForEach, sleep, honsole } = require('../common')
let db = require('../../db')
const { ugoira_to_mp4 } = require('./tools')
const { update_illust } = require('./illust')
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
async function get_user_illusts(author_id, page = 0, try_time = 0) {
    if (try_time > 5) {
        return false
    }
    try {
        let illusts_id = await get_user_illusts_id(author_id, page)
        if (page > 0) {
            illusts_id = illusts_id[page - 1]
        }
        let illusts = illusts_id
        // query from local database
        let local_illust_data = await (db.collection.illust.find({
            $or: illusts_id.map(id => {
                return {
                    id: id
                }
            })
        }))
        await local_illust_data.forEach(illust => {
            // s**t code
            illusts[illusts_id.indexOf(illust.id)] = illust
        })
        // filter illust not in local database
        // and query from Pixiv
        let p = illusts.filter(x => { return typeof x != 'object' })
        if (p.length > 0) {
            if (p.length > 49) {
                let pp = []
                while (p.length > 0) {
                    pp.push(p.splice(0, 50))
                }
                p = pp
            } else {
                p = [p]
            }
            honsole.dev('query from pixiv', p)
            await asyncForEach(p, async pp => {
                let illusts_data = (await r_p.get(`user/${author_id}/profile/illusts?ids%5B%5D=${pp.join('&ids%5B%5D=')}&work_category=illustManga&is_first_page=1`)).data
                for (const id in illusts_data.body.works) {
                    illusts[illusts_id.indexOf(id)] = {
                        ...illusts_data.body.works[id],
                        flag: true // flag this data is from pixiv
                    }
                }
            })
        }
        await asyncForEach(illusts, async (illust, id) => {
            if (illust.type == 2) {
                ugoira_to_mp4(illust.id)
            }
            if (illust.flag) {
                illusts[id] = await update_illust(illust)
            }
        })
        return illusts
    } catch (e) {
        console.warn(e)
        await sleep(500)
        return get_user_illusts_by_id(id, page, try_time++)
    }
}
/**
 * get user's all illusts id
 * @param {*} author_id author id
 * @param {*} page page (0 = all)
 * @param {*} try_time 
 * @returns 
 */
async function get_user_illusts_id(author_id, page = 0, try_time = 0) {
    if (try_time > 5) {
        return []
    }
    let illusts_id = []
    try {
        let illust_id_list_all = (await r_p.get(`user/${author_id}/profile/all`)).data
        if (illust_id_list_all.error || !illust_id_list_all.body || !illust_id_list_all.body.illusts) {
            throw illust_id_list_all
        }
        illust_id_list_all = illust_id_list_all.body.illusts
        let illust_id_list_p = [[]]
        // 50 items per page
        for (const id in illust_id_list_all) {
            if (page > 0) {
                illust_id_list_p[illust_id_list_p.length - 1].push(id)
                if (illust_id_list_p[illust_id_list_p.length - 1].length > 49) {
                    illust_id_list_p.push([])
                }
            } else {
                illusts_id.push(parseInt(id))
            }
        }
        if (page > 0) {
            illusts_id = illust_id_list_p[page - 1]
        }
    } catch (e) {
        honsole.warn(e)
        await sleep(500)
        get_user_illusts_id(author_id, page, try_time++)
        return []
    }
    return illusts_id
}
/**
 * get user's (all) illusts by illusts id
 * all illusts will be cached to database
 * @param {*} id user id
 * @param {*} page when pages = 0 will return all illusts
 * @param {*} try_time 
 * @returns object / boolean
 * max 50 illusts
 */
async function get_user_illusts_by_id(author_id, illusts_id = [], try_time = 0) {

}
module.exports = {
    get_user,
    get_user_illusts_id,
    get_user_illusts
}