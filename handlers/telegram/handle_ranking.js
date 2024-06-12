import ranking from '../pixiv/ranking.js'
import { format } from './format.js'
import { k_os } from './keyboard.js'
// 作为 ../pixiv/ranking 的 tg 封装
export async function handle_ranking([...rank], flag) {
    let data = await ranking(...rank)
    if (!data)
        return false
    let inline = []
    data.data.forEach(td => {
        inline.push({
            type: 'photo',
            id: 'p_' + td.id,
            // only show regualar url
            photo_url: td.murl,
            thumb_url: td.turl,
            caption: format(td, flag, 'inline', 1, flag.setting.format.inline),
            parse_mode: 'MarkdownV2',
            photo_width: td.width,
            photo_height: td.height,
            ...k_os(td.id, flag)
        })
    })
    return {
        data: inline,
        next_offset: data.next_page
    }
}
