const { format } = require("./format")
const { ugoiraurl } = require('../../config.json').pixiv
function mg_create(td, flag,url = false) {
    let mediagroup_t = []
    let mediagroup_o = []
    let mediagroup_r = []
    if (td) {
        td.size.forEach((size, pid) => {
            let mediagroup_data = {
                type: 'photo',
                caption: format(td, flag, 'message', pid),
                parse_mode: 'MarkdownV2'
            }
            // mg2telegraph 还需要作品的 id
            if (flag.telegraph) {
                mediagroup_data.id = td.id
                mediagroup_data.q_id = flag.q_id
            }
            if(td.tg_file_id){
                mediagroup_t[pid] = mediagroup_data
                if (typeof td.tg_file_id == 'string') {
                    mediagroup_t[pid].media = td.tg_file_id
                } else {
                    mediagroup_t[pid].media = td.tg_file_id[pid]
                }
            } else {
                mediagroup_t[pid] = []
            }
            if (td.type <= 1) {
                mediagroup_o[pid] = {
                    ...mediagroup_data,
                    media: td.original_urls[pid],
                }
                mediagroup_r[pid] = {
                    ...mediagroup_data,
                    media: td.regular_urls[pid]
                }
            } else if (td.type == 2) {
                mediagroup_o[pid] = mediagroup_r[pid] = {
                    ...mediagroup_data,
                    type: 'video',
                    media:  {
                        url: ugoiraurl + td.id + '.mp4'
                    }
                }
            }
        })
    }
    if (process.env.dev) {
        console.log('mg_create', JSON.stringify(mediagroup_o),JSON.stringify(mediagroup_t))
    }
    return {
        mediagroup_t,
        mediagroup_o,
        mediagroup_r
    }
}
function mg_albumize(mg, single_caption = false) {
    // 10 item to a group
    let t = []
    mg.forEach((m, mid) => {
        let gid = Math.floor(mid / 10)
        if (!t[gid])
            t[gid] = []
        // So It's doesn't support | prefix
        m.caption = m.caption.replaceAll('%mid%', mid % 10 + 1)
        t[gid][mid % 10] = m
        if (single_caption) {
            if (mid % 10 == 0) {
                m.caption += '\n'
            } else {
                t[gid][0].caption += m.caption + '\n' // telegram will show the caption when only [0] have caption
                t[gid][mid % 10].caption = ''
                delete t[gid][mid % 10].parse_mode
            }
        }
    })
    return t
}
module.exports = {
    mg_create,
    mg_albumize
}
