// https://www.pixiv.net/bookmark_new_illust.php

const { asyncForEach } = require("../common")
const { update_illust } = require("./illust")


async function get_bookmark_new_illust(page = 1) {
    try {
        let data = (await r_p(`bookmark_new_illust.php?p=${page}`))
            .data.split('data-items="')[1].split('"style="')[0].replaceAll('&quot;', '"')
        //                                                                 I only see this char
        await asyncForEach(JSON.parse(data), async d => {
            let illust = await update_illust(d)

        })
    } catch (error) {

    }
}

module.exports = {
    get_bookmark_new_illust
}