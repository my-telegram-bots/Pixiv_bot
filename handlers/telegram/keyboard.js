const { Markup } = require("telegraf");
/**
 * 打开和分享
 * @param {*} id illust id
 * @param {*} share 是否分享 默认为真，留其它的可以增加share的东西
 * 简写 k -> keyboard os -> open and share
 */
function k_os(id,keyboard_flag){
    if(!keyboard_flag){
        keyboard_flag = {
            tags: false,
            share: true,
            remove_keyboard: false
        }
    }
    inline_keyboard = []
    if(!keyboard_flag.remove_keyboard){
        inline_keyboard = [[
            Markup.button.url('open', 'https://www.pixiv.net/artworks/' + id),
        ]]
        if(keyboard_flag.share){
            inline_keyboard[0].push(Markup.button.switchToChat('share', `https://pixiv.net/i/${id} ${keyboard_flag.tags ? '+tags' : ''}`))
        }
    }
    return Markup.inlineKeyboard(inline_keyboard)
}
module.exports = {k_os}