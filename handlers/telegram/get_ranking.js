// 作为 ../pixiv/ranking 的 tg 封装

const { Markup } = require("telegraf")
const ranking = require("../pixiv/ranking")

module.exports = async (...arg)=>{
    let data = await ranking(...arg)
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
            caption: p.title,
            photo_width: p.width,
            photo_height: p.height,
            ...Markup.inlineKeyboard([[
                Markup.button.url('open', 'https://www.pixiv.net/artworks/' + p.id),
                Markup.button.switchToChat('share', 'https://pixiv.net/i/' + p.id)
            ]])
        })
    })
    return {
        data: inline,
        next_offset: data.next_page
    }
}