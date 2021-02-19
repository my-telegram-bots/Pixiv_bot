const { Markup } = require("telegraf");
/**
 * 打开和分享
 * @param {*} id illust id
 * @param {*} share 是否分享 默认为真，留其它的可以增加share的东西
 * 简写 k -> keyboard os -> open and share
 */
function k_os(id,flag = false){
    inline_keyboard = []
    if(!flag.remove_keyboard){
        inline_keyboard = [[
            Markup.button.url('open', 'https://www.pixiv.net/artworks/' + id),
        ]]
        if(flag.share){
            inline_keyboard[0].push(Markup.button.switchToChat('share', `https://pixiv.net/i/${id}${flag.tags ? ' +tags' : ''}${!flag.c_show_id ? ' -id' : ''}`))
        }
    }
    return Markup.inlineKeyboard(inline_keyboard)
}
module.exports = {k_os}