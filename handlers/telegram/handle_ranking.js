const ranking = require("../pixiv/ranking")
const { format } = require("./format")
const { k_os } = require("./keyboard")

// 作为 ../pixiv/ranking 的 tg 封装
async function handle_ranking([...rank],flag){
    let data = await ranking(...rank)
    if(!data)
        return false
    let inline = []
    data.data.forEach(p => {
        inline.push({
            type: 'photo',
            id: 'p_' + p.id,
            photo_url: (p.width > 2000 || p.height > 2000) ? p.murl : p.ourl,
            // 图片太多 加载好慢 先用小图preview
            thumb_url: p.turl,
            caption: format(p,flag,'inline',1,flag.setting.format.inline),
            parse_mode: 'Markdown',
            photo_width: p.width,
            photo_height: p.height,
            ...k_os(p.id,flag)
        })
    })
    return {
        data: inline,
        next_offset: data.next_page
    }
}
module.exports = handle_ranking