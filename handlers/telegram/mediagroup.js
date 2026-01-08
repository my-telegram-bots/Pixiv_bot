import { format } from './format.js'
import { asyncForEach, fetch_tmp_file, honsole } from '../common.js'
import { detect_ugpira_url, ugoira_to_mp4 } from '../pixiv/tools.js'
import { InputFile } from 'grammy'
import config from '../../config.js'

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
            if (us.spoiler || (illust.nsfw && us.auto_spoiler)) {
                mediagroup_data.has_spoiler = true
            }
            if (us.caption_above) {
                mediagroup_data.show_caption_above_media = true
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
                // For local conversion: wait if mp4 doesn't exist yet
                // For remote conversion: URL is always available (tensei handles on-demand)
                if (!url && !config.pixiv.ugoira_remote) {
                    honsole.log('Ugoira mp4 not ready, waiting for local conversion:', illust.id)
                    url = await ugoira_to_mp4(illust)
                    if (!url) {
                        honsole.warn('Ugoira local conversion failed:', illust.id)
                        return // Skip adding this to mediagroups
                    }
                }
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
        t[gid][id] = {
            ...m,
            caption: m.caption
        }
        if (us.single_caption && m.id) {
            if (id === 0) {
                t[gid][id].caption = ''
            } else {
                delete t[gid][id].caption
                delete t[gid][id].parse_mode
            }
        }
    })
    honsole.dev('mg_albumize', t)
    return t
}
export async function mg_filter(mg, type = 't') {
    honsole.dev('filter_type', type)

    // Parallel processing for better performance (especially when downloading files)
    const results = await Promise.all(mg.map(async (x) => {
        let xx = {
            type: x.type
        }
        if (x.has_spoiler) {
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

        // Create local copy of type for this specific item
        let itemType = type

        if (x.type == 'document') {
            xx.media = x.media_o
            if (itemType.includes('dl')) {
                // dlo => download media_o file
                // dlr => download media_r file
                const url = x['media_' + itemType.replace('dl', '')]
                xx.media = new InputFile(await fetch_tmp_file(url), url.slice(url.lastIndexOf('/') + 1))
            }
        } else if (x.type == 'video') {
            // Video: prefer file_id, otherwise force local download (HTTP URLs unreliable for video in mediagroup)
            if (x.tg_file_id) {
                xx.media = x.tg_file_id
            } else {
                // Force download and upload as InputFile
                const url = x.media_o || x.media
                xx.media = new InputFile(await fetch_tmp_file(url), url.slice(url.lastIndexOf('/') + 1))
            }
        } else {
            if (itemType.includes('o')) {
                if (x.fsize > 4999999 && itemType == 'o') {
                    itemType = 'r'
                } else if (x.fsize > 9999999 && itemType == 'dlo') {
                    itemType = 'dlr'
                }
            }
            // Smart retry: if current type failed before, try alternatives
            if (x.invaild && x.invaild.includes(itemType)) {
                const fallbackOrder = ['r', 'dlo', 'dlr']
                itemType = fallbackOrder.find(t => !x.invaild.includes(t)) || itemType
            }

            if (itemType.includes('dl') && !x.media_t) {
                // dlo => download media_o file
                // dlr => download media_r file
                const url = x['media_' + itemType.replace('dl', '')]
                xx.media = new InputFile(await fetch_tmp_file(url), url.slice(url.lastIndexOf('/') + 1))
            } else if (itemType == 'r') {
                xx.media = x.media_r ? x.media_r : x.media_o
            }
        }
        return xx
    }))

    return results
}