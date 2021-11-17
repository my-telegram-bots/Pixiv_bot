// https://www.pixiv.net/bookmark_new_illust.php

const { asyncForEach } = require("../common")
const { update_illust } = require("./illust")

/**
 * get newest illusts bot followed
 * @param {*} page 
 */
export async function get_bookmark_new_illust(page = 1) {
    let illusts = []
    try {
        // god bless! Pixiv does not change the page's structure
        let data = (await r_p(`bookmark_new_illust.php?p=${page}`))
            .data.split('data-items="')[1].split('"style="')[0].replaceAll('&quot;', '"')
        //                                                                 I only see " char
        await asyncForEach(JSON.parse(data), async d => {
            let illust = await update_illust(d)
        })
    } catch (error) {

    }
}