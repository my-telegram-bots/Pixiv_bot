import { InlineKeyboard } from 'grammy'
import { _l } from './i18n.js'
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
/**
 * link setting
 * @param {*} language_code
 * @param {*} s
 * @returns
 */
export function k_link_setting(language_code = 'en', s) {
    let linked_chat_id = s.chat_id
    for (const key in s) {
        if (key !== 'type') {
            s[key] = parseInt(s[key])
        }
    }
    const buttons = [
        {
            prefix: 'link_sync',
            value: s.sync,
            next: s.sync >= 1 ? 0 : s.sync + 1
        },
        {
            prefix: 'link_administrator_only',
            value: s.administrator_only,
            next: s.administrator_only >= 1 ? 0 : s.administrator_only + 1
        },
        {
            prefix: 'link_repeat',
            value: s.repeat,
            next: s.repeat >= 2 ? 0 : s.repeat + 1
        },
        // {
        //     prefix: 'mediagroup_count',
        //     value: s.mediagroup_count,
        //     next: s.mediagroup_count >= 10 ? 0 : s.mediagroup_count + 1
        // }
    ]

    const keyboard = new InlineKeyboard()
    buttons.forEach(x => {
        keyboard.text(`${_l(language_code, x.prefix)} | ${_l(language_code, `${x.prefix}_${x.value}`)}`, `l|${x.prefix}|${linked_chat_id}|${x.value}|${x.next}`)
    })
    keyboard.row()
        .text(`${_l(language_code, 'link_unlink')}`, `l|link_unlink|${linked_chat_id}`)

    return { reply_markup: keyboard }
}