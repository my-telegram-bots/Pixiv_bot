const db = require("../../db");
const { follow_user, unfollow_user } = require("../pixiv/user");

/**
 * subscribe author
 * @param {*} author_id 
 * @returns 
 */
async function subscribe_pixiv_author(chat_id, author_id) {
    let s_data = {}
    // if author is exist in db
    s_data[`subscribe_author_list.${author_id}`] = { $exists: true }
    let exist_data = await db.collection.chat_setting.findOne(s_data)
    if (!exist_data) {
        await follow_user(author_id)
    }
    s_data.id = chat_id
    let data = await db.collection.chat_setting.findOne(s_data)
    if (!data) {
        await db.update_setting({
            add_subscribe_author: author_id
        }, chat_id)
    }
    return true
    // maybe not have `return false`
}


/**
 * unsubscribe author
 * @param {*} author_id 
 * @returns true / false
 */
async function unsubscribe_pixiv_author(chat_id, author_id) {
    let s_data = {}
    // if author is exist in db
    s_data[`subscribe_author_list.${author_id}`] = { $exists: true }
    s_data.id = chat_id
    let data = await db.collection.chat_setting.findOne(s_data)
    if (data) {
        await db.update_setting({
            del_subscribe_author: author_id
        }, chat_id)
    }
    // unfollow user when no user subscribe
    let exist_data = await db.collection.chat_setting.find(s_data).toArray()
    if (exist_data.length == 0) {
        await unfollow_user(author_id)
    }
    return true
    // maybe not have `return false` ?
}
/**
 * subscribe author's bookmarks
 * url: https://www.pixiv.net/en/users/17819621/bookmarks/artworks
 * only support public bookmarks(`like`)
 * @param {*} chat_id 
 * @param {*} author_id 
 */
async function subscribe_pixiv_bookmarks(chat_id, author_id) {
    await db.update_setting({
        add_subscribe_author_bookmarks: author_id
    }, chat_id)
    return true
}

/**
 * unsubscribe author's bookmarks
 * @param {*} chat_id 
 * @param {*} author_id 
 */
async function unsubscribe_pixiv_bookmarks(chat_id, author_id) {
    let next_flag = true
    while (condition) {
        
    }
    await db.update_setting({
        del_subscribe_author_bookmarks: author_id
    }, chat_id)
    return true
}
module.exports = {
    subscribe_pixiv_author,
    unsubscribe_pixiv_author,
    subscribe_pixiv_bookmarks,
    unsubscribe_pixiv_bookmarks
}