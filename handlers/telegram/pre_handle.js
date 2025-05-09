// there is no comment in this file
// may be next version will be added
import { Markup } from 'telegraf'
import db from '../../db.js'
import { honsole } from '../common.js'
import { _l } from './i18n.js'
import df from './df.js'
let default_extra = {
    parse_mode: 'MarkdownV2',
    allow_sending_without_reply: true
}
export function get_pixiv_ids(text) {
    let ids = {
        illust: [],
        author: [],
        novel: [],
        // fanbox: [],
    }
    if (text && (typeof text === 'string' || typeof text === 'number')) {
        //                  remove value text   nothing               remove www.               force add https://                          remove dup https://                         force https://                      https with newline                     remove all +- and space                                  force newline (for split) remove all /en
        get_values(text).rm_valued_text.replace(/-_-/g, ' ').replace(/www\./ig, '').replace(/pixiv\.net\//ig, 'https://pixiv.net/').replace(/https:\/\/https:\/\//ig, 'https://').replace(/http:\/\//ig, 'https://').replace(/https:\/\//ig, '\nhttps://').replace(/  /g, ' ').replace(/\+/g, ' +').replace(/\-/g, ' -').replace(/ /g, '\n').replace(/\/en/ig, '').split('\n').forEach(u => {
            // url match
            try {
                const uu = new URL(u)
                if (uu.hostname !== 'pixiv.net') {
                    return
                }
                let pathname = uu.pathname
                if (pathname.endsWith('/')) {
                    pathname = pathname.slice(0, -1)
                }
                if (pathname.startsWith('/artworks/') || pathname.startsWith('/i/')) {
                    const s_pathname = pathname.split('/')
                    ids.illust.push(parseInt(s_pathname[s_pathname.length - 1]))
                    return
                } else if (pathname.startsWith('/member_illust.php')) {
                    ids.illust.push(parseInt(uu.searchParams.get('illust_id')))
                    return
                } else if (pathname.startsWith('/novel/show.php')) {
                    ids.novel.push(parseInt(uu.searchParams.get('id')))
                    return
                } else if (pathname.startsWith('/users/') || pathname.startsWith('/u/')) {
                    const s_pathname = pathname.split('/')
                    ids.author.push(parseInt(s_pathname[s_pathname.length - 1]))
                    return
                }
            } catch (error) {
            }
            // general match (match illust id)
            if ((u.length === 8 || u.length === 9) && !isNaN(Number(u.replace('#', '').replace('id=', '').replace('id', ''))) && !u.startsWith('0x')) {
                // match #idxxxxxxx #xxxxxxx
                let id = Number(u.replace('#', '').replace('id', '').replace('=', ''))
                // if (id > 0 && id < 200000000) {
                ids.illust.push(id)
                return
                // }
            } else {
                // https://www.pixiv.net/en/artworks/87466156
                // https://www.pixiv.net/artworks/87466156
                // http://www.pixiv.net/artworks/87466156
                // https://pixiv.net/i/87466156
                // pixiv.net/i/87466156
                // 87466156
                // match text only have id (may resulted spam)
                // let t = u.replace('https://', '').replace('pixiv.net', '').replace('artworks', '').replace('i', '').replaceAll('/', '').split('?')[0].split('#')[0]
                // if (!isNaN(t) && t && t.length >= 8) {
                //     ids.illust.push(parseInt(t))
                // }
            }
            honsole.dev('text', u, ids)
        })
    }
    return { ...ids }
}
export function get_values(text = '') {
    let list = {}
    text = text.split('\n').filter(t => {
        if (t.includes('=')) {
            let st = t.replace('=', '\uff69').split('\uff69')
            st[0] = st[0].toLowerCase(); // may be Title or Author
            if (['title', 'author_name', 'author_url', 'an', 'au'].includes(st[0])) {
                if (st[0] == 'an') {
                    list['author_name'] = st[1]
                }
                if (st[0] == 'au') {
                    list['author_url'] = st[1]
                }
                list[st[0]] = st[1]
                return false
            }
        }
        return true
    }).join('\n')
    return {
        ...list,
        rm_valued_text: text
    }
}
export async function read_user_setting(bot, ctx) {
    let chat_id = ctx.chat_id
    const user_id = ctx.user_id || ctx.from.id
    if (!ctx.type) {
        ctx.type = ctx.chat ? ctx.chat.type : 'inline'
    }
    if (!chat_id) {
        chat_id = ctx.message ? ctx.message.chat.id : user_id
    }
    ctx.us = {
        // I don't wanna save the 'string' data in default (maybe the format will be changed in the future)
        // see telegram/fotmat.js to get real data
        setting: {
            format: {
                message: false,
                mediagroup_message: false,
                inline: false
            },
            default: {
                open: true,
                share: true,
                show_id: true,
                album: true
            },
            dbless: true, // the user isn't in chat_setting
        },
        q_id: 0 // telegraph albumized value
    }
    let setting = null
    if (ctx.chat || ctx.inlineQuery || ctx.callbackQuery) {
        setting = await db.collection.chat_setting.findOne({
            id: chat_id
        })
    }
    // get user's custom settings
    // 1st: = group
    if (ctx.chat_id < 0 &&
        // 2st: include +god
        ctx.text.includes('+god') ||
        // or group settings not includes result
        setting?.default?.overwrite !== true) {
        let setting_user = await db.collection.chat_setting.findOne({
            id: user_id
        })
        // maybe null
        if (setting_user && setting) {
            setting_user.link_chat_list = setting.link_chat_list
            setting = setting_user
        }
    }
    if (setting) {
        setting.default = {
            ...ctx.us.setting.default,
            ...setting.default
        }
        for (const key in ctx.us.setting.default) {
            if (typeof setting.default[key] == undefined) {
                setting.default[key] = ctx.us.setting.default[key]
            }
        }
        ctx.us.setting = setting
        ctx.us.setting.dbless = false
        delete ctx.us.setting._id
        delete ctx.us.setting.id
    }
    if (!ctx.us.setting.format) {
        ctx.us.setting.format = {}
    }
    if (!ctx.us.setting.default) {
        ctx.us.setting.default = {}
    }
    // default flag -> d_f
    let d_f = ctx.us.setting.default ? ctx.us.setting.default : {}
    ctx.us = {
        ...ctx.us,
        // caption start
        tags: us(d_f, ctx.text, 'tags', ['tag']),
        // show description
        description: us(d_f, ctx.text, 'description', ['desc']),
        open: us(d_f, ctx.text, 'open'),
        caption_extraction: us(d_f, ctx.text, 'caption_extraction', ['caption']),
        caption_above: us(d_f, ctx.text, 'caption_above', ['above']),
        // can't use switch_inline_query in a channel chat, because a user will not be able to use the button without knowing bot's username
        share: us(d_f, ctx.text, 'share'),
        //                                              dirty but work
        remove_keyboard: us(d_f, ctx.text.replaceAll('+', '\uff69').replaceAll('-', '+').replaceAll('\uff69', '-'), 'remove_keyboard', ['kb']),
        remove_caption: us(d_f, ctx.text.replaceAll('+', '\uff69').replaceAll('-', '+').replaceAll('\uff69', '-'), 'remove_caption', ['cp']),
        // inline mode doesn't support mediagroup single_caption mode is useless
        single_caption: us(d_f, ctx.text, 'single_caption', ['sc']),
        show_id: us(d_f, ctx.text, 'show_id', ['id']),
        // caption end
        // send as mediagroup when a illust with multiple images
        album: us(d_f, ctx.text, 'album'),
        // all works in one mediagroup
        album_one: us(d_f, ctx.text, 'album_one', ['one']),
        // album will keep same numbers per mediagroup
        album_equal: us(d_f, ctx.text, 'album_equal', ['equal']),
        // reverse order 
        reverse: us(d_f, ctx.text, 'reverse'),
        // send as telegraph
        telegraph: us(d_f, ctx.text, 'telegraph', ['graph']),
        // send as file
        asfile: us(d_f, ctx.text, 'asfile', ['file']),
        append_file: us(d_f, ctx.text, 'append_file', ['af']),
        append_file_immediate: us(d_f, ctx.text, 'append_file_immediate', ['af_i', 'afi']),
        // spoiler
        // But I have no idea to deisgn the logic.
        spoiler: us(d_f, ctx.text, 'spoiler', ['sp']),
        auto_spoiler: us(d_f, ctx.text, 'auto_spoiler', ['as']),

    }
    // group only value
    if (ctx.chat && ctx.chat.id < 0) {
        ctx.us.overwrite = (d_f.overwrite && !ctx.text.includes('-overwrite')) || ctx.text.includes('+overwrite')
    }
    if (ctx.us.telegraph) {
        ctx.us.album = true
        ctx.us.tags = true
    }
    if (ctx.us.single_caption || ctx.us.album_one || ctx.us.album_equal) {
        ctx.us.album = true
    }
    if (ctx.text.includes('+rm')) {
        ctx.us.remove_caption = ctx.us.remove_keyboard = false
    }
    if (ctx.text.includes('-rm')) {
        ctx.us.remove_caption = ctx.us.remove_keyboard = true
    }
    if (ctx.us.remove_keyboard) {
        ctx.us.open = ctx.us.share = false
    }
    if (ctx.us.append_file_immediate) {
        ctx.us.append_file = true
    }
    if (ctx.us.append_file) {
        ctx.us.asfile = false
    }
    if (ctx.us.asfile) {
        ctx.us.album = false
        ctx.us.album_one = false
        ctx.us.single_caption = false
    }
    if (ctx.type === 'channel') {
        ctx.us.share = false
    }
    if (ctx.type === 'inline') {
        ctx.us.single_caption = false
    }
    if (ctx.message) {
        let { title, author_name, author_url } = get_values(ctx.text.substring(0, 3) == '/s ' ? ctx.text.replace('/s ', '') : ctx.text)
        let v = {}
        if (title && title.length >= 256) {
            bot.api.sendMessage(chat_id, _l(ctx.l, 'error_tlegraph_title_too_long'), {
                ...default_extra,
                reply_to_message_id: ctx.message.message_id
            })
            return 'error'
        }
        try {
            //                                                                  check vaild url wuth 'new URL' if author_url is not a real url will throw error
            if ((author_name && author_name.length >= 128) || (author_url && new URL(author_url) && author_url.length >= 512)) {
                throw 'e'
            }
        } catch (error) {
            bot.api.sendMessage(chat_id, _l(ctx.l, 'error_tlegraph_author'), {
                ...default_extra,
                reply_to_message_id: ctx.message.message_id
            })
            return 'error'
        }
        v.telegraph_title = title || d_f.telegraph_title
        v.telegraph_author_name = author_name || d_f.telegraph_author_name
        v.telegraph_author_url = author_url || d_f.telegraph_author_url
        for (const key in v) {
            if (v[key] === undefined) {
                delete v[key]
            }
        }
        if (JSON.stringify(v).length > 2) {
            ctx.us = {
                ...ctx.us,
                ...v,
                value_update_flag: true
            }
        }
    }
    return ctx.us
}
function us(d_f, text, name = 'tags', slugs = []) {
    slugs.push(name)
    if (slugs.some(slug => {
        return text.includes(`-${slug}`)
    })) {
        return false
    }
    return d_f[name] || slugs.some(slug => {
        return text.includes(`+${slug}`)
    })
}
export async function handle_new_configuration(bot, ctx, default_extra) {
    if (ctx.chat && ctx.chat.type === 'channel') {
    } else if (ctx.message.sender_chat) {
        // chat -> link message
        return
    }
    //                                     1087968824 is a anonymous admin account
    else if (ctx.chat.id < 0 && ctx.from.id !== 1087968824) {
        let admin_flag = false
        try {
            let { status } = await bot.api.getChatMember(ctx.chat.id, ctx.from.id)
            if (status === 'administrator' || status === 'creator') {
                admin_flag = true
            }
        } catch (e) {
        }
        if (!admin_flag) {
            await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'error_not_a_gc_administrator'), default_extra)
            return
        }
    }
    if (ctx.text == '/s') {
        // lazy....
        ctx.us.setting = {
            format: {
                message: ctx.us.setting.format.message ? ctx.us.setting.format.message : df.format.message,
                mediagroup_message: ctx.us.setting.format.mediagroup_message ? ctx.us.setting.format.mediagroup_message : df.format.mediagroup_message,
                inline: ctx.us.setting.format.inline ? ctx.us.setting.format.inline : df.format.inline
            },
            default: ctx.us.setting.default
        }
        // alert who open old config (based on configuration generate time)
        ctx.us.setting.time = +new Date()
        delete ctx.us.setting.dbless
        await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'setting_open_link'), {
            ...default_extra,
            ...Markup.inlineKeyboard(
                [
                    Markup.button.url('open', `https://pixiv-bot.pages.dev/${_l(ctx.l)}/s#${Buffer.from(JSON.stringify(ctx.us.setting), 'utf8').toString('base64')}`.replace('/en', '').replace('/undefined', ''))
                ]),
            reply_to_message_id: ctx.message.message_id
        }).catch((e) => {
            honsole.warn(e)
        })
        return
    } else {
        if (ctx.text == '/s reset') {
            await db.delete_setting(ctx.chat.id)
            await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'setting_reset'), default_extra)
            return
        }
        // can't use +god in permanent settings on group / channel
        else if (ctx.chat_id < 0 && ctx.text.startsWith('/s') && ctx.text.includes('+god')) {
            await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'error'), default_extra)
            return
        }
        let new_setting = {}
        if (ctx.text.substring(0, 3) == 'eyJ') {
            try {
                new_setting = JSON.parse(Buffer.from(ctx.text, 'base64').toString('utf8'))
            } catch (error) {
                // message type is doesn't base64
                await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'error'))
                honsole.warn('parse base64 configuration failed', ctx.text, error)
            }
        } else if (ctx.text.length > 2 && (ctx.text.includes('+') || ctx.text.includes('-') || ctx.us.value_update_flag)) {
            new_setting = {
                default: ctx.us
            }
        }
        if (JSON.stringify(new_setting).length > 2) {
            honsole.dev(new_setting)
            if (await db.update_setting(new_setting, ctx.chat.id, ctx.us)) {
                await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'setting_saved'), default_extra)
            } else {
                await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'error'), default_extra)
            }
        }
        return
    }
}
