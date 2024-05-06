import { format } from './format.js'
import { asyncForEach, fetch_tmp_file, honsole } from '../common.js'
import config from '../../config.js'
import { detect_ugpira_url, ugoira_to_mp4 } from '../pixiv/tools.js'
import { InputFile } from 'grammy'
export async function mg_create(illust, us) {
    let mediagroups = []
    if (illust) {
        if (illust.type == 2) {
            ugoira_to_mp4(illust)
        }
        await asyncForEach(illust.imgs_.size, async (size, pid) => {
            let mediagroup_data = {
                type: 'photo',
                caption: format(illust, us, 'message', pid),
                parse_mode: 'MarkdownV2',
                id: illust.id,
                p: pid
            }
            // mg2telegraph 还需要作品的 id
            if (us.telegraph) {
                mediagroup_data.q_id = us.q_id
            }
            if (us.single_caption) {
                mediagroup_data.scaption = format(illust, us, 'message', -1)
            }
            // if illust data have file_id
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
                let url = await detect_ugpira_url(illust, 'mp4')
                mediagroup_data = {
                    ...mediagroup_data,
                    type: 'video',
                    media: url,
                    media_o: url
                }
            }
            mediagroups.push(mediagroup_data)
        })
    }
    honsole.dev('mg_create', mediagroups)
    return mediagroups
}
export function mg_albumize(mg = [], us) {
    // 10(maybe) item to a group
    let t = []
    let split_i = 10
    // if (mg.length > 10 && mg.length < 100) {
    //     12 = 6 + 6 
    //     14 = 7 + 7
    //     21 = 7 + 7 + 7
    //     16 = 8 + 8
    //     24 = 8 + 8 + 8
    //     32 = 8 + 8 + 8 + 8
    //     48 = 8 + 8 + 8 + 8 + 8
    //     18 = 9 + 9
    //     27 = 9 + 9 + 9
    //     36 = 9 + 9 + 9 + 9
    // }
    // maybe with image ratio to split
    // so it disabled by default (album_equal)
    // some image is not square | width > height /2 | height > width /2
    if (us.album_equal) {
        switch (mg.length) {
            case 12:
                split_i = 6
                break
            case 14:
            case 21:
                split_i = 7
                break
            case 16:
            case 24:
            case 32:
            case 48:
                split_i = 8
                break
            case 18:
            case 27:
            case 36:
                split_i = 9
            // default:
            //     break;
        }
    }
    mg.forEach((m, mid) => {
        let gid = Math.floor(mid / split_i)
        let id = mid % split_i
        if (!t[gid]) {
            t[gid] = []
        }
        m.caption = m.caption.replaceAll('%mid%', mid % split_i + 1)
        // So It's doesn't support | prefix
        t[gid][id] = {
            ...m,
            caption: m.caption
        }
        if (us.single_caption && m.id) {
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
    if (us.single_caption) {
        t.forEach((m, gid) => {
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
    honsole.dev('mg_albumize', t)
    return t
}
export async function mg_filter(mg, type = 't', has_spoiler = false) {
    honsole.dev('filter_type', type)
    let t = []
    await asyncForEach(mg, async (x) => {
        let xx = {
            type: x.type
        }
        if (has_spoiler) {
            xx.has_spoiler = true
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
            xx.media = x.media
            if (type.includes('dl') || type.includes('r')) {
                xx.media = `${xx.media}?${+new Date()}`
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
                // dlo => download media_o file
                // dlr => download media_r file
                xx.media = new InputFile(await fetch_tmp_file(x['media_' + type.replace('dl', '')]))
            } else if (type == 'r') {
                xx.media = x.media_r ? x.media_r : x.media_o
            }
        }
        t.push(xx)
    })
    return t
}