// there is no comment in this file
// may be next version will be added
const { Markup } = require("telegraf")
const db = require("../../db")
const { honsole } = require("../common")
const { _l } = require("./i18n")
let default_extra = {
    parse_mode: 'MarkdownV2',
    allow_sending_without_reply: true
}
function get_pixiv_ids(text) {
    let ids = {
        illust: [],
        author: [],
        novel: [],
        // fanbox: [],
    }
    if (text) {
        text.replaceAll('-_-', ' ').replaceAll('www.', '').replaceAll('http://', 'https://').replaceAll('https://', '\nhttps://').replaceAll('  ', ' ').replaceAll('+', ' ').replaceAll('-', ' ').replaceAll(' ', '\n').replaceAll('/en', '/').split('\n').forEach(u => {
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
                } catch (error) {

                }
                if (u.length > 7 && !isNaN(parseInt(u.replace('#', '').replace('id=', '').replace('id', '')))) {
                    // match #idxxxxxxx #xxxxxxx
                    ids.illust.push(parseInt(u.replace('#', '').replace('id', '').replace('=', '')))
                } else {
                    throw 'switch to general id matcher'
                }
            } catch (error) {
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

function get_values(text = '') {
    let list = {}
    text.split('\n').forEach(t => {
        if (t.includes('=')) {
            let st = t.replace('=', '\uff69').split('\uff69')
            st[0] = st[0].toLowerCase() // may be Title or Author
            if (['title', 'author_name', 'author_url', 'an', 'au'].includes(st[0])) {
                if (st[0] == 'an') list['author_name'] = st[1]
                if (st[0] == 'au') list['author_url'] = st[1]
                list[st[0]] = st[1]
            }
        }
    })
    return list

}

async function flagger(bot, ctx) {
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
    if (ctx.chat) {
        setting = await db.collection.chat_setting.findOne({
            id: ctx.chat.id
        })
    }
    if (ctx.rtext.includes('+god') || (!setting || (setting.default && !setting.default.overwrite))) {
        let setting_user = await db.collection.chat_setting.findOne({
            id: ctx.from.id
        })
        if (setting_user) {
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
    if (!ctx.flag.setting.format) ctx.flag.setting.format = {}
    if (!ctx.flag.setting.default) ctx.flag.setting.default = {}
    // default flag -> d_f
    let d_f = ctx.flag.setting.default ? ctx.flag.setting.default : {}
    ctx.flag = {
        ...ctx.flag,

        // caption start
        tags: (d_f.tags && !ctx.rtext.includes('-tag')) || ctx.rtext.includes('+tag'),
        open: (d_f.open && !ctx.rtext.includes('-open')) || ctx.rtext.includes('+open'),
        share: (d_f.share && !ctx.rtext.includes('-share')) || ctx.rtext.includes('+share'),
        remove_keyboard: (d_f.remove_keyboard && !ctx.rtext.includes('+kb')) || ctx.rtext.includes('-kb'),
        remove_caption: (d_f.remove_caption && !ctx.rtext.includes('+cp')) || ctx.rtext.includes('-cp'),
        // inline mode doesn't support mediagroup single_caption mode is useless
        single_caption: (!ctx.inlineQuery && ((d_f.single_caption && !ctx.rtext.includes('-sc'))) || ctx.rtext.includes('+sc')),
        show_id: !ctx.rtext.includes('-id'),
        // caption end

        // send all illusts as mediagroup
        album: (d_f.album && !ctx.rtext.includes('-album')) || ctx.rtext.includes('+album'),

        // descending order 
        desc: (d_f.desc && !ctx.rtext.includes('-desc')) || ctx.rtext.includes('+desc'),

        // send as telegraph
        telegraph: ctx.rtext.includes('+graph') || ctx.rtext.includes('+telegraph'),
        // send as file
        asfile: (d_f.asfile && !ctx.rtext.includes('-file')) || ctx.rtext.includes('+file')

    }
    // group only value
    if (ctx.chat && ctx.chat.id < 0) {
        ctx.flag.overwrite = (d_f.overwrite && !ctx.rtext.includes('-overwrite')) || ctx.rtext.includes('+overwrite')
    }
    if (ctx.flag.telegraph) {
        ctx.flag.album = true
        ctx.flag.tags = true
    }

    if (ctx.flag.single_caption) {
        ctx.flag.album = true
    }

    if (ctx.rtext.includes('+rm')) {
        ctx.flag.remove_caption = ctx.flag.remove_keyboard = false
    }
    if (ctx.rtext.includes('-rm')) {
        ctx.flag.remove_caption = ctx.flag.remove_keyboard = true
    }
    if (ctx.flag.remove_keyboard) {
        ctx.flag.open = ctx.flag.share = false
    }
    if (ctx.message !== undefined) {
        let {
            title,
            author_name,
            author_url
        } = get_values(ctx.rtext.substr(0, 3) == '/s ' ? ctx.rtext.replace('/s ', '') : ctx.rtext)
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
        } catch (error) {
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
async function handle_new_configuration(bot, ctx, default_extra) {
    //                                     1087968824 is a anonymous admin account
    if (ctx.chat.id < 0 && ctx.from.id !== 1087968824) {
        let u = await bot.telegram.getChatMember(ctx.chat.id, ctx.from.id)
        if (u.status !== 'administrator' && u.status !== 'creator') {
            await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'error_not_a_administrator'), default_extra)
            return
        }
    }
    if (ctx.rtext == '/s') {
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
        })
        return
    } else {
        if (ctx.rtext == '/s reset') {
            await db.delete_setting(ctx.chat.id)
            await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'setting_reset'), default_extra)
            return
        }
        let new_setting = {}
        if (ctx.rtext.substr(0, 3) == 'eyJ') {
            try {
                new_setting = JSON.parse(Buffer.from(ctx.rtext, 'base64').toString('utf8'))
            } catch (error) {
                // message type is doesn't base64
                await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'error'))
                honsole.warn('parse base64 configuration failed', ctx.rtext, error)
            }
        } else if (ctx.rtext.length > 2 && (ctx.rtext.includes('+') || ctx.rtext.includes('-') || ctx.flag.value_update_flag)) {
            new_setting = {
                default: ctx.flag
            }
        }
        if (JSON.stringify(new_setting).length > 2) {
            if (await db.update_setting(new_setting, ctx.chat.id, ctx.flag)) {
                await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'setting_saved'), default_extra)
            } else {
                await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'error'), default_extra)
            }
        }
        return
    }
}
module.exports = {
    get_pixiv_ids,
    get_values,
    flagger,
    handle_new_configuration
}