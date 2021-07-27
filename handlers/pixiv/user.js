const { r_p, r_p_ajax } = require('./request')
const { asyncForEach, sleep, honsole } = require('../common')
let db = require('../../db')
const { ugoira_to_mp4 } = require('./tools')
const { update_illust } = require('./illust')
let csrf = null

/**
 * get user's profile
 * @param {number} author_id illust_id
 */
async function get_user_profile(author_id, try_time = 0) {
    if (id.toString().length > 8 && id > 80000000) {
        return false
    }
    if (try_time > 5) {
        honsole.error('max try time in get_user_profile')
        return false
    }
    try {
        let data = (await r_p_ajax(`user/${author_id}/?full=1`)).data
        if (data.error) {
            return 404
        } else {
            return {
                author_id,
                author_name: data.name,
                author_avatar_url: data.imageBig,
                comment: data.comment,
                comment_html: data.comment_html
            }
        }
    } catch (error) {
        honsole.error(error)
        await sleep(500)
        return await get_user_profile(author_id, try_time + 1)
    }
    honsole.log('u', id)
}

/**
 * get user's illusts (per page)
 * @param {*} author_id 
 * @param {*} page 
 * @param {*} try_time 
 * @returns 
 */
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
        })).toArray()
        local_illust_data.forEach(illust => {
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
                let illusts_data = (await r_p_ajax.get(`user/${author_id}/profile/illusts?ids%5B%5D=${pp.join('&ids%5B%5D=')}&work_category=illustManga&is_first_page=1`)).data
                honsole.dev(illusts_data.body.works)
                for (let id in illusts_data.body.works) {
                    id = parseInt(id)
                    illusts[illusts.indexOf(id)] = {
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
                honsole.log('test', illust)
                illusts[id] = await update_illust(illust)
            }
        })
        return illusts
    } catch (e) {
        honsole.warn(e)
        await sleep(500)
        return get_user_illusts_by_id(id, page, try_time + 1)
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
        let illust_id_list_all = (await r_p_ajax.get(`user/${author_id}/profile/all`)).data
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
        get_user_illusts_id(author_id, page, try_time + 1)
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

async function follow_user(author_id, try_time = 0) {
    if (!author_id || try_time > 3) {
        return false
    }
    try {
        let data = await r_p.post('bookmark_add.php', `mode=del&type=user&user_id=${author_id}&tag=&restrict=0&format=json`)
        if (data.data.length < 2) {
            return true
        } else {
            honsole.error('follow_user_error', data.data)
            return false
        }
    } catch (error) {
        honsole.error(error)
        if (error.response && error.response.status == 404) {
            return false
        }
        await sleep(500)
        return await follow_user(author_id, try_time + 1)
    }
}
async function unfollow_user(author_id) {
    return await group_setting('del', 'bookuser', author_id)
}
/**
 * group setting 
 * https://www.pixiv.net/rpc_group_setting.php
 * @param {*} mode mode
 * @param {*} type type
 * @param {*} id (author) id
 */
async function group_setting(mode, type, id, retry_time = 0) {
    if (!mode || !type || !id || retry_time > 3) {
        return false
    }
    try {
        let data = await r_p.post('rpc_group_setting.php', `mode=${encodeURIComponent(mode)}&type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`)
        if (data.data.length < 2) {
            honsole.error(mode + '_user_error', data.data)
            return false
        } else {
            return true
        }
    } catch (error) {
        honsole.error(error.response)
        if (error.response && error.response.status == 404) {
            return false
        }
        await sleep(500)
        return await group_setting(mode, type, id, retry_time + 1)
    }
}
/**
 * get user's latest csrf token
 * may be use in the future
 **/
async function get_user_csrf(try_time = 0) {
    if (try_time > 3) {
        honsole.error('get csrf error')
        return false
    }
    try {
        let html = (await r_p.get()).data
        csrf = html.split('{"token":"')[1].split('"')[0]
        honsole.log('new csrf token:', csrf)
        return csrf
    } catch (error) {
        honsole.error(error)
        await sleep(500)
        return await get_user_csrf(try_time + 1)
    }
}
/**
 * get user's bookmarks (per page)
 * @param {*} author_id 
 * @param {*} page 
 * @returns {
 * total: number,
 * illusts: []
 * }
 */
async function get_user_bookmarks(author_id, page = 1, try_time = 0) {
    if (try_time > 5) {
        honsole.error('can\'t get author', author_id, 'bookmarks')
        return false
    }
    try {
        let data = (await r_p_ajax(`user/${author_id}/illusts/bookmarks?tag=&offset=${(page - 1) * 100}&limit=100&rest=show`)).data
        if (!data.error) {
            let illusts = data.body.works
            let illusts_id = []
            // query from local database
            let local_illust_data = await (db.collection.illust.find({
                $or: illusts.map(illust => {
                    let id = parseInt(illust.id)
                    illusts_id.push(id)
                    return {
                        id: id
                    }
                })
            })).toArray()
            local_illust_data.forEach(illust => {
                // s**t code
                illusts[illusts_id.indexOf(illust.id)] = {
                    ...illust,
                    local_flag: true
                }
            })
            await asyncForEach(illusts, async (illust, id) => {
                if (!illust.local_flag) {
                    // illust don't exist and database not have cache -> ignore
                    // delete
                    if (JSON.stringify(illust).includes('limit_unknown_s')) {
                        illusts.splice(id, 1)
                    } else {
                        illusts[id] = await update_illust(illust)
                    }
                } else {
                    delete illusts[id].local_flag
                }
            })
            return {
                total: data.body.total,
                illusts: illusts
            }
        } else {
            // user not exist ?
            return {
                total: 0,
                illusts: []
            }
        }
    } catch (error) {
        honsole.error(error)
        await sleep(500)
        return await get_user_bookmarks(author_id, page, try_time + 1)
    }
}
module.exports = {
    get_user_profile,
    get_user_illusts_id,
    get_user_illusts,
    get_user_bookmarks,
    follow_user,
    unfollow_user,
    get_user_csrf
}