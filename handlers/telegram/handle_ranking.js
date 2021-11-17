import ranking from '../pixiv/ranking.js'
import { format } from './format.js'
import { k_os } from './keyboard.js'
// 作为 ../pixiv/ranking 的 tg 封装
export async function handle_ranking([...rank], flag) {
    let data = await ranking(...rank)
    if (!data)
        return false
    let inline = []
    data.data.forEach(p => {
        inline.push({
            type: 'photo',
            id: 'p_' + p.id,
            // only show regualar url
            photo_url: p.murl,
            thumb_url: p.turl,
            caption: format(p, flag, 'inline', 1, flag.setting.format.inline),
            parse_mode: 'MarkdownV2',
            photo_width: p.width,
            photo_height: p.height,
            ...k_os(p.id, flag)
        })
    })
    return {
        data: inline,
        next_offset: data.next_page
    }
}
