// there is no comment in this file
// may be next version will be added
import { Markup } from 'telegraf'
import db from '../../db.js'
import { honsole } from '../common.js'
import { _l } from './i18n.js'
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
        text.replace(/-_-/g, ' ').replace(/www\./ig, '').replace(/http:\/\//ig, 'https://').replace(/https:\/\//ig, '\nhttps://').replace(/  /g, ' ').replace(/\+/g, ' ').replace(/\-/g, ' ').replace(/ /g, '\n').replace(/\/en/ig, '/').split('\n').forEach(u => {
            try {
                if (!u || u.length < 6) {
                    return []
                    // Match url(s)
                }
                if (u.includes('novel')) {
                    if (!isNaN(parseInt(u.replace('https://pixiv.net/novel/show.php?id=', '').split('&')[0]))) {
                        ids.novel.push(parseInt(u.replace('https://pixiv.net/novel/show.php?id=', '').split('&')[0]))
                    }
                }
                if (u.includes('user')) {
                    if (!isNaN(parseInt(u.replace('https://pixiv.net/users/', '').split('?')[0].split('&')[0]))) {
                        ids.author.push(parseInt(u.replace('https://pixiv.net/users/', '').split('?')[0].split('&')[0]))
                    }
                }
                // general search
                try {
                    let uu = new URL(u).searchParams
                    if (uu.get('illust_id')) {
                        ids.illust.push(parseInt(uu.get('illust_id')))
                    }
                }
                catch (error) {
                }
                if (u.length > 7 && !isNaN(parseInt(u.replace('#', '').replace('id=', '').replace('id', '')))) {
                    // match #idxxxxxxx #xxxxxxx
                    ids.illust.push(parseInt(u.replace('#', '').replace('id', '').replace('=', '')))
                }
                else {
                    throw 'switch to general id matcher'
                }
            }
            catch (error) {
                // https://www.pixiv.net/en/artworks/87466156
                // https://www.pixiv.net/artworks/87466156
                // http://www.pixiv.net/artworks/87466156
                // https://pixiv.net/i/87466156
                // pixiv.net/i/87466156
                // 87466156
                // match text only have id (may resulted spam)
                let t = u.replaceAll('https://', '').replace('pixiv.net', '').replace('artworks', '').replace('i', '').replaceAll('/', '').split('?')[0].split('#')[0]
                if (!isNaN(t) && t && t.length === 8) {
                    ids.illust.push(parseInt(t))
                }
            }
            honsole.dev('url:', u, ids)
        })
    }
    return { ...ids }
}
export function get_values(text = '') {
    let list = {}
    text.split('\n').forEach(t => {
        if (t.includes('=')) {
            let st = t.replace('=', '\uff69').split('\uff69')
            st[0] = st[0].toLowerCase(); // may be Title or Author
            if (['title', 'author_name', 'author_url', 'an', 'au'].includes(st[0])) {
                if (st[0] == 'an')
                    list['author_name'] = st[1]
                if (st[0] == 'au')
                    list['author_url'] = st[1]
                list[st[0]] = st[1]
            }
        }
    })
    return list
}
export async function flagger(bot, ctx) {
    let chat_id = ctx.chat_id
    let user_id = ctx.user_id || ctx.from.id
    if (!ctx.type) {
        ctx.type = ctx.chat ? ctx.chat.type : 'inline'
    }
    if (!chat_id) {
        chat_id = ctx.message ? ctx.message.chat.id : user_id
    }
    ctx.flag = {
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
                album: true
            },
            dbless: true, // the user isn't in chat_setting
        },
        q_id: 0 // telegraph albumized value
    }
    let setting = false
    if (ctx.chat || ctx.inlineQuery || ctx.callbackQuery) {
        setting = await db.collection.chat_setting.findOne({
            id: chat_id
        })
    }
    if (ctx.chat_id !== ctx.user_id && ctx.from && (ctx.text.includes('+god') || (!setting || !setting.default || !setting.default.overwrite))) {
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
            ...ctx.flag.setting.default,
            ...setting.default
        }
        for (const key in ctx.flag.setting.default) {
            if (typeof setting.default[key] == undefined) {
                setting.default[key] = ctx.flag.setting.default[key]
            }
        }
        ctx.flag.setting = setting
        ctx.flag.setting.dbless = false
        delete ctx.flag.setting._id
        delete ctx.flag.setting.id
    }
    if (!ctx.flag.setting.format)
        ctx.flag.setting.format = {}
    if (!ctx.flag.setting.default)
        ctx.flag.setting.default = {}
    // default flag -> d_f
    let d_f = ctx.flag.setting.default ? ctx.flag.setting.default : {}
    ctx.flag = {
        ...ctx.flag,
        // caption start
        tags: (d_f.tags && !ctx.text.includes('-tag')) || ctx.text.includes('+tag'),
        open: (d_f.open && !ctx.text.includes('-open')) || ctx.text.includes('+open'),
        // can't use switch_inline_query in a channel chat, because a user will not be able to use the button without knowing bot's username
        share: (ctx.type !== 'channel' && (d_f.share && !ctx.text.includes('-share')) || ctx.text.includes('+share')),
        remove_keyboard: (d_f.remove_keyboard && !ctx.text.includes('+kb')) || ctx.text.includes('-kb'),
        remove_caption: (d_f.remove_caption && !ctx.text.includes('+cp')) || ctx.text.includes('-cp'),
        // inline mode doesn't support mediagroup single_caption mode is useless
        single_caption: (!ctx.inlineQuery && ((d_f.single_caption && !ctx.text.includes('-sc'))) || ctx.text.includes('+sc')),
        show_id: !ctx.text.includes('-id'),
        // caption end
        // send all illusts as mediagroup
        album: (d_f.album && !ctx.text.includes('-album')) || ctx.text.includes('+album'),
        // descending order 
        desc: (d_f.desc && !ctx.text.includes('-desc')) || ctx.text.includes('+desc'),
        // send as telegraph
        telegraph: ctx.text.includes('+graph') || ctx.text.includes('+telegraph'),
        // send as file
        asfile: (d_f.asfile && !ctx.text.includes('-file')) || ctx.text.includes('+file')
    }
    // group only value
    if (ctx.chat && ctx.chat.id < 0) {
        ctx.flag.overwrite = (d_f.overwrite && !ctx.text.includes('-overwrite')) || ctx.text.includes('+overwrite')
    }
    if (ctx.flag.telegraph) {
        ctx.flag.album = true
        ctx.flag.tags = true
    }
    if (ctx.flag.single_caption) {
        ctx.flag.album = true
    }
    if (ctx.text.includes('+rm')) {
        ctx.flag.remove_caption = ctx.flag.remove_keyboard = false
    }
    if (ctx.text.includes('-rm')) {
        ctx.flag.remove_caption = ctx.flag.remove_keyboard = true
    }
    if (ctx.flag.remove_keyboard) {
        ctx.flag.open = ctx.flag.share = false
    }
    if (ctx.message) {
        let { title, author_name, author_url } = get_values(ctx.text.substr(0, 3) == '/s ' ? ctx.text.replace('/s ', '') : ctx.text)
        let v = {}
        if (title && title.length >= 256) {
            bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error_tlegraph_title_too_long'), {
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
        }
        catch (error) {
            bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error_tlegraph_author'), {
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
            ctx.flag = {
                ...ctx.flag,
                ...v,
                value_update_flag: true
            }
        }
    }
    return ctx.flag
}
export async function handle_new_configuration(bot, ctx, default_extra) {
    if (ctx.chat && ctx.chat.type === 'channel') {
    }
    else if (ctx.message.sender_chat) {
        // chat -> link message
        return
    }
    //                                     1087968824 is a anonymous admin account
    else if (ctx.chat.id < 0 && ctx.from.id !== 1087968824) {
        let u = await bot.telegram.getChatMember(ctx.chat.id, ctx.from.id)
        if (u.status !== 'administrator' && u.status !== 'creator') {
            await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'error_not_a_administrator'), default_extra)
            return
        }
    }
    if (ctx.text == '/s') {
        // lazy....
        ctx.flag.setting = {
            format: {
                message: ctx.flag.setting.format.message ? ctx.flag.setting.format.message : '%NSFW|#NSFW %[%title%](%url%) / [%author_name%](%author_url%)% |p%%\n|tags%',
                mediagroup_message: ctx.flag.setting.format.mediagroup_message ? ctx.flag.setting.format.mediagroup_message : '%[%mid% %title%% |p%%](%url%)%\n|tags%',
                inline: ctx.flag.setting.format.inline ? ctx.flag.setting.format.inline : '%NSFW|#NSFW %[%title%](%url%) / [%author_name%](%author_url%)% |p%%\n|tags%'
            },
            default: ctx.flag.setting.default
        }
        // alert who open old config (based on configuration generate time)
        ctx.flag.setting.time = +new Date()
        delete ctx.flag.setting.dbless
        await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'setting_open_link'), {
            ...default_extra,
            ...Markup.inlineKeyboard([
                Markup.button.url('open', `https://pixiv-bot.pages.dev/${_l(ctx.l)}/s#${Buffer.from(JSON.stringify(ctx.flag.setting), 'utf8').toString('base64')}`.replace('/en', ''))
            ]),
            reply_to_message_id: ctx.message.message_id
        }).catch((e) => {
            console.log(e)
        })
        return
    }
    else {
        if (ctx.text == '/s reset') {
            await db.delete_setting(ctx.chat.id)
            await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'setting_reset'), default_extra)
            return
        }
        let new_setting = {}
        if (ctx.text.substr(0, 3) == 'eyJ') {
            try {
                new_setting = JSON.parse(Buffer.from(ctx.text, 'base64').toString('utf8'))
            }
            catch (error) {
                // message type is doesn't base64
                await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'error'))
                honsole.warn('parse base64 configuration failed', ctx.text, error)
            }
        }
        else if (ctx.text.length > 2 && (ctx.text.includes('+') || ctx.text.includes('-') || ctx.flag.value_update_flag)) {
            new_setting = {
                default: ctx.flag
            }
        }
        if (JSON.stringify(new_setting).length > 2) {
            honsole.log(new_setting)
            if (await db.update_setting(new_setting, ctx.chat.id, ctx.flag)) {
                await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'setting_saved'), default_extra)
            }
            else {
                await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'error'), default_extra)
            }
        }
        return
    }
}