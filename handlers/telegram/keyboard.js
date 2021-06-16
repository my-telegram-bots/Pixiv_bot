const { Markup } = require("telegraf");
/**
 * 打开和分享 用得比较多，所以就简写了
 * @param {*} id illust id
 * @param {*} share 是否分享 默认为真，留其它的可以增加share的东西
 * 简写 k -> keyboard os -> open and share
 */
function k_os(id, flag = false) {
    let inline_keyboard = [[]]
    if (flag.open) {
        inline_keyboard[0].push(Markup.button.url('open', 'https://www.pixiv.net/artworks/' + id))
    }
    if (flag.share) {
        inline_keyboard[0].push(Markup.button.switchToChat('share', `https://pixiv.net/artworks/${id}${flag.tags ? ' +tags' : ''}${!flag.show_id ? ' -id' : ''}`))
    }
    return Markup.inlineKeyboard(inline_keyboard)
}

function k_set_index(l = require('../../lang/en.js')) {
    let inline_keyboard = [[
        Markup.button.callback(l.settings.format, 'set_format'),
        //Markup.button.callback(l.settings.bookmarks,'record_bookmarks')
    ]]
    return Markup.inlineKeyboard(inline_keyboard).resize()
}
function k_setting_format(l = require('../../lang/en.js')) {
    let inline_keyboard = [[
        Markup.button.callback('message', 'set_format|message'),
        Markup.button.callback('inline(share)', 'set_format|inline')
    ], [
        Markup.button.callback('all', 'set_format|all')
    ], [
        Markup.button.callback('🔙 back', 'set_index')
    ]]
    return Markup.inlineKeyboard(inline_keyboard).resize()
}
module.exports = {
    k_os,
    k_set_index,
    k_setting_format
}