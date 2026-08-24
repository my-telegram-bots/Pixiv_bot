import { InlineKeyboard } from 'grammy'
/**
 * 打开和分享 用得比较多，所以就简写了
 * @param {*} id illust id
 * @param {*} share 是否分享 默认为真，留其它的可以增加share的东西
 * 简写 k -> keyboard os -> open and share
 */
export function k_os(id, flag = {}) {
    const keyboard = new InlineKeyboard()
    if (flag.open) {
        keyboard.url('open', 'https://www.pixiv.net/artworks/' + id)
    }
    if (flag.share) {
        keyboard.switchInline('share', `https://pixiv.net/artworks/${id}${flag.tags ? ' +tags' : ''}${!flag.show_id ? ' -id' : ''}${flag.spoiler ? ' +spoiler' : ''}${flag.description ? ' +description' : ''}`)
    }
    return { reply_markup: keyboard }
}
export function k_setting_index(language_code = 'en', flag) {
    const keyboard = new InlineKeyboard()
        .text(l.settings.format, 'set_format')
        //Markup.button.callback(l.settings.bookmarks,'record_bookmarks')
    return { reply_markup: keyboard }
}
export function k_setting_format(language_code = 'en', flag) {
    const keyboard = new InlineKeyboard()
        .text('message', 'set_format|message')
        .text('inline(share)', 'set_format|inline')
        .row()
        .text('all', 'set_format|all')
        .row()
        .text('🔙 back', 'set_index')
    return { reply_markup: keyboard }
}
