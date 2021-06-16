const { format } = require("./format")
const { asyncForEach, download_file, honsole, ugoira_to_mp4 } = require("../common")
const { ugoiraurl } = require('../../config.json').pixiv
function mg_create(td, flag, url = false) {
    let mediagroups = []
    if (td) {
        if (td.type == 2) {
            ugoira_to_mp4(td.id)
        }
        td.size.forEach((size, pid) => {
            let mediagroup_data = {
                type: 'photo',
                caption: format(td, flag, 'message', pid),
                parse_mode: 'MarkdownV2',
                id: td.id,
                p: pid
            }
            // mg2telegraph 还需要作品的 id
            if (flag.telegraph) {
                mediagroup_data.q_id = flag.q_id
            }
            if (flag.single_caption) {
                mediagroup_data.scaption = format(td, flag, 'message', -1)
            }
            if (td.tg_file_id) {
                if (typeof td.tg_file_id == 'string') {
                    mediagroup_data.media_t = td.tg_file_id
                } else {
                    mediagroup_data.media_t = td.tg_file_id[pid]
                }
            }
            if (td.type <= 1) {
                mediagroup_data.media_o = td.original_urls[pid]
                mediagroup_data.media_r = td.regular_urls[pid]
            } else if (td.type == 2) {
                mediagroup_data = {
                    ...mediagroup_data,
                    type: 'video',
                    media: {
                        url: ugoiraurl + td.id + '.mp4'
                    },
                    media_o: ugoiraurl + td.id + '.mp4'
                }
            }
            mediagroups.push(mediagroup_data)
        })
    }
    honsole.log('mg_create', mediagroups)
    return mediagroups
}
function mg_albumize(mg, single_caption = false) {
    // 10 item to a group
    let t = []
    mg.forEach((m, mid) => {
        let gid = Math.floor(mid / 10)
        let id = mid % 10
        if (!t[gid]) {
            t[gid] = []
        }
        m.caption = m.caption.replaceAll('%mid%', mid % 10 + 1)
        // So It's doesn't support | prefix
        t[gid][id] = {
            ...m,
            caption: m.caption
        }
        if (single_caption && m.id) {
            if (id == 0) {
                t[gid][0].sc = []
                t[gid][id].caption = ''
            } else {
                delete t[gid][id].caption
                delete t[gid][id].parse_mode
            }
            t[gid][0].sc.push({
                id: m.id,
                caption: m.caption,
                scaption: m.scaption
            })
        }
    })
    if (single_caption) {
        t.map((m, gid) => {
            let caption = []
            let temp = m[0].sc.filter(x => {
                caption.push(x.caption)
                return m[0].sc[0].id == x.id
            })
            if (temp.length == m[0].sc.length) {
                t[gid][0].caption = t[gid][0].sc[0].scaption.replace('%mid%', '')
            } else {
                t[gid][0].caption = caption.join('\n')
            }
            delete t[gid][0].sc
        })
    }
    honsole.log('mg_create', t)
    return t
}
async function mg_filter(mg, type = 't') {
    let t = []
    await asyncForEach(mg, async x => {
        let xx = { ...x }
        if (!x.media) xx.media = xx.media_t ? xx.media_t : xx.media_o
        if (mg.type == 'video') {
            // nothing download in ugoira
            xx.media = await ugoira_to_mp4(xx.id)
        } else {
            if (type.includes('dl') && !xx.media_t) {
                xx.media = {
                    // dlo => download media_o file
                    // dlr => download media_r file
                    source: await download_file(xx['media_' + type.replace('dl', '')])
                }
            } else if (type == 'r') {
                xx.media = xx.media_r ? xx.media_r : xx.media_o
            }
        }
        delete xx.sc
        delete xx.media_o
        delete xx.media_r
        delete xx.media_t
        delete xx.id
        delete xx.p
        t.push(xx)
    })
    return t
}
module.exports = {
    mg_create,
    mg_albumize,
    mg_filter
}