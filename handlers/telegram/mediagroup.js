const { format } = require("./format")
const { asyncForEach, download_file, honsole } = require("../common")
const { ugoiraurl } = require('../../config.json').pixiv
const { ugoira_to_mp4 } = require("../pixiv/tools")
function mg_create(illust, flag, url = false) {
    let mediagroups = []
    if (illust) {
        if (illust.type == 2) {
            ugoira_to_mp4(illust.id)
        }
        illust.imgs_.size.forEach((size, pid) => {
            let mediagroup_data = {
                type: 'photo',
                caption: format(illust, flag, 'message', pid),
                parse_mode: 'MarkdownV2',
                id: illust.id,
                p: pid
            }
            // mg2telegraph 还需要作品的 id
            if (flag.telegraph) {
                mediagroup_data.q_id = flag.q_id
            }
            if (flag.single_caption) {
                mediagroup_data.scaption = format(illust, flag, 'message', -1)
            }
            if (illust.tg_file_id) {
                if (typeof illust.tg_file_id == 'string') {
                    mediagroup_data.media_t = illust.tg_file_id
                } else {
                    mediagroup_data.media_t = illust.tg_file_id[pid]
                }
            }
            if (illust.type <= 1) {
                mediagroup_data.fsize = illust.imgs_.fsize[pid]
                mediagroup_data.media_o = illust.imgs_.original_urls[pid]
                mediagroup_data.media_r = illust.imgs_.regular_urls[pid]
            } else if (illust.type == 2) {
                mediagroup_data = {
                    ...mediagroup_data,
                    type: 'video',
                    media: {
                        url: ugoiraurl + illust.id + '.mp4'
                    },
                    media_o: ugoiraurl + illust.id + '.mp4'
                }
            }
            mediagroups.push(mediagroup_data)
        })
    }
    honsole.dev('mg_create', mediagroups)
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
            if (temp.length === m[0].sc.length) {
                t[gid][0].caption = t[gid][0].sc[0].scaption.replace('%mid%', '')
            } else {
                t[gid][0].caption = caption.join('\n')
            }
            delete t[gid][0].sc
        })
    }
    honsole.dev('mg_create', t)
    return t
}
async function mg_filter(mg, type = 't') {
    honsole.dev('filter_type', type)
    let t = []
    await asyncForEach(mg, async x => {
        let xx = {
            type: x.type
        }
        if (x.caption) {
            xx.caption = x.caption
            xx.parse_mode = x.parse_mode
        }
        if (x.media) {
            xx.media = x.media

        } else {
            xx.media = x.media_t ? x.media_t : x.media_o
        }
        if (x.type == 'video') {
            // nothing download in ugoira
            xx.media = {
                url: await ugoira_to_mp4(x.id)
            }
            if (type.includes('dl') || type.includes('r')) {
                xx.media.url = `${xx.media.url}?${+new Date()}`
            }
        } else {
            if (type.includes('o')) {
                if (x.fsize > 4999999 && type == 'o') {
                    type = 'r'
                } else if (x.fsize > 9999999 && type == 'dlo') {
                    type = 'dlr'
                }
            }
            if (type.includes('dl') && !x.media_t) {
                xx.media = {
                    // dlo => download media_o file
                    // dlr => download media_r file
                    source: await download_file(x['media_' + type.replace('dl', '')])
                }
            } else if (type == 'r') {
                xx.media = x.media_r ? x.media_r : x.media_o
            }
        }
        t.push(xx)
    })
    return t
}
module.exports = {
    mg_create,
    mg_albumize,
    mg_filter
}