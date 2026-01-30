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
            // Use standard imgs_ structure
            photo_url: td.imgs_.regular_urls[0],
            thumbnail_url: td.imgs_.thumb_urls[0],
            caption: format(td, flag, 'inline', 0, flag.setting.format.inline),
            parse_mode: 'MarkdownV2',
            photo_width: td.imgs_.size[0].width,
            photo_height: td.imgs_.size[0].height,
            ...k_os(td.id, flag)
        })
    })
    return {
        data: inline,
        next_offset: data.next_page
    }
}
