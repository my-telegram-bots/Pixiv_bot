import { run as grammyjsRun } from '@grammyjs/runner'
import config from './config.js'
import handlers from './handlers/index.js'
import db from './db.js'
import { update_setting } from './db.js'
const { asyncForEach, handle_illust, handle_ranking, handle_novel, get_pixiv_ids, get_user_illusts, ugoira_to_mp4, download_file, _l, k_os, k_link_setting, mg_create, mg_albumize, mg_filter, mg2telegraph, read_user_setting, honsole, handle_new_configuration, exec, sleep, reescape_strings, get_ugoira_path } = handlers
import { tgBot as bot } from './bot.js'
import axios from 'axios'
import { InputFile } from 'grammy'
import fs from 'fs'
import { fetch_tmp_file } from './handlers/common.js'

// step 0 initial some necessary variables
bot.use(async (ctx, next) => {
    // simple i18n
    ctx.l = (!ctx.from || !ctx.from.language_code) ? 'en' : ctx.from.language_code
    ctx.text = ''
    ctx.default_extra = {
        parse_mode: 'MarkdownV2'
    }
    if (!!ctx.message) {
        if (ctx.text = ctx.message.text || ctx.message.caption || '') {
            // remove command[@username] : /start@Pixiv_bot -> /start
            if (ctx.message.entities && ctx.text.startsWith('/')) {
                ctx.command = ctx.message.text.substring(1, ctx.message.entities[0].length).replace(`@${bot.botInfo.username}`, '')
            }
        }
        ctx.default_extra.reply_to_message_id = ctx.message.message_id
        ctx.default_extra.allow_sending_without_reply = true
        if (!!ctx.update.channel_post) {
            ctx.chat_id = ctx.channelPost.chat.id
            // channel post is anonymous
            ctx.user_id = 1087968824
        } else {
            ctx.chat_id = ctx.message.chat.id
            ctx.user_id = ctx.from.id
        }
    } else if (!!ctx.inlineQuery) {
        ctx.text = ctx.inlineQuery.query
        ctx.chat_id = ctx.inlineQuery.from.id
        ctx.user_id = ctx.inlineQuery.from.id
    } else if (!!ctx.callbackQuery) {
        ctx.chat_id = ctx.callbackQuery.message.chat.id
        ctx.user_id = ctx.callbackQuery.from.id
    }
    return await next()
})

bot.command('start', async (ctx, next) => {
    // match = deeplink 
    // see more https://core.telegram.org/bots#deep-linking
    if (!ctx.match.trim() || ctx.match === 's') {
        // reply start help command
        await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'start'), {
            ...ctx.default_extra
        })
    } else {
        // callback to next bot.on handler
        return await next()
    }
})

bot.command('help', async (ctx) => {
    await bot.api.sendMessage(ctx.chat.id, 'https://pixiv-bot.pages.dev', {
        ...ctx.default_extra,
        parse_mode: ''
    })
})
bot.command('privacy', async (ctx) => {
    await bot.api.sendMessage(ctx.chat.id, 'https://pixiv-bot.pages.dev/privacy', {
        ...ctx.default_extra,
        parse_mode: ''
    })
})


// gift: get id even if channel
bot.command('id', async (ctx) => {
    let text = ctx.chat.id < 0 ? `#chatid: \`${ctx.chat.id}\`\n` : ''
    // channel post maybe didn't have .from
    text += ctx.from ? `#userid: \`${ctx.from.id}\`` : ''
    await bot.api.sendMessage(ctx.chat.id, text, {
        ...ctx.default_extra,
        parse_mode: 'Markdown'
    })
})

// step1 initial config
bot.use(async (ctx, next) => {
    if ((ctx.command === 's' || ctx.text.substring(0, 3) === 'eyJ') ||
        (ctx.message && ctx.message.reply_to_message && ctx.message.reply_to_message.from && ctx.message.reply_to_message.from.id === bot.botInfo.id &&
            ctx.message.reply_to_message.text && ctx.message.reply_to_message.text.substring(0, 5) === '#link')) {
    } else {
        ctx.ids = get_pixiv_ids(ctx.text)
        if (!ctx.callbackQuery && !ctx.inlineQuery
            && JSON.stringify(ctx.ids).length === 36 // have horrible bug in the feature LOL.
            && !['link'].includes(ctx.command)
            && !ctx.text.includes('fanbox.cc')) {
            // bot have nothing to do.
            return
        }
    }
    // read configuration
    ctx.us = await read_user_setting(bot, ctx)
    honsole.dev('input ->', ctx.chat, ctx.text, ctx.us)
    if (ctx.us === 'error') {
        honsole.warn('Get user setting error', ctx.text)
        return
    } else {
        return await next()
    }
})

bot.on('callback_query', async (ctx) => {
    let chat_id = ctx.chat_id
    let message_id = ctx.callbackQuery.message.message_id
    let user_id = ctx.user_id
    let stext = ctx.callbackQuery.data.split('|')
    let linked_chat_id = parseInt(stext[2])
    let apply_flag = false
    // let action = stext[0].replace('_','∏').split('∏')
    if (stext[0] === 'l') {
        if ((chat_id > 0 || await is_chat_admin(chat_id, user_id)) && await is_chat_admin(linked_chat_id, user_id)) {
            if (stext[1] === 'link_unlink') {
                await update_setting({
                    del_link_chat: {
                        chat_id: linked_chat_id
                    }
                }, chat_id)
                await bot.api.editMessageText(chat_id, message_id, false, _l(ctx.l, 'link_unlink_done'), {
                    reply_markup: {}
                })
                apply_flag = true
            } else {
                try {
                    let link_setting = {
                        chat_id: stext[2],
                        ...ctx.us.setting.link_chat_list[stext[2]]
                    }
                    link_setting[stext[1].replace('link_', '')] = stext[4]
                    await update_setting({
                        add_link_chat: link_setting
                    }, chat_id)
                    await bot.api.editMessageReplyMarkup(chat_id, message_id, false, k_link_setting(ctx.l, link_setting).reply_markup)
                    apply_flag = true
                }
                catch (error) {
                    console.warn(error)
                }
            }
        } else {
            await ctx.answerCallbackQuery(reescape_strings(_l(ctx.l, 'error_not_a_gc_administrator')), {
                show_alert: true
            }).catch()
            return
        }
    }
    if (apply_flag) {
        await ctx.answerCallbackQuery(reescape_strings(_l(ctx.l, 'saved'))).catch()
    } else {
        await ctx.answerCallbackQuery(reescape_strings(_l(ctx.l, 'error'))).catch()
    }
})

bot.command('link', async (ctx) => {
    // link this chat to another chat / channel
    let chat_id = ctx.message.chat.id
    let user_id = ctx.from.id
    if (ctx.from.id === 1087968824) {
        await bot.api.sendMessage(chat_id, _l(ctx.l, 'error_anonymous'), ctx.default_extra)
    } else {
        if (chat_id > 0 || await is_chat_admin(chat_id, user_id)) {
            // if (ctx.us.setting.link_chat_list && JSON.stringify(ctx.us.setting.link_chat_list).length > 2) {
            let new_flag = true
            if (ctx.us.setting.link_chat_list) {
                for (const linked_chat_id in ctx.us.setting.link_chat_list) {
                    // support muilt linked chat
                    // It's hard think permission
                    // So only link 1
                    if (await is_chat_admin(linked_chat_id, user_id)) {
                        await bot.api.sendMessage(chat_id, _l(ctx.l, 'link_setting'), {
                            ...ctx.default_extra,
                            ...k_link_setting(ctx.l, {
                                chat_id: linked_chat_id,
                                ...ctx.us.setting.link_chat_list[linked_chat_id]
                            })
                        })
                    } else {
                        await bot.api.sendMessage(chat_id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra)
                    }
                    new_flag = false
                }
            }
            if (new_flag) {
                await bot.api.sendMessage(chat_id, '\\#link ' + _l(ctx.l, 'link_start'), {
                    ...ctx.default_extra,
                    reply_markup: {
                        force_reply: true,
                        selective: true
                    }
                })
            }
        } else {
            await bot.api.sendMessage(chat_id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra)
        }
    }
})

bot.on([':text', ':caption'], async (ctx) => {
    let chat_id = ctx.chat_id
    let user_id = ctx.user_id
    if (ctx.command === 's' || ctx.text.substring(0, 3) === 'eyJ') {
        await handle_new_configuration(bot, ctx, ctx.default_extra)
        return
    }
    // @link
    if (ctx.message && ctx.message.reply_to_message && ctx.message.reply_to_message.text && ctx.message.reply_to_message.text.substring(0, 5) === '#link') {
        if (ctx.from.id === 1087968824) {
            await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'error_anonymous'), ctx.default_extra)
        }
        if ((ctx.chat.id > 0 || await is_chat_admin(ctx.chat.id, ctx.from.id)) && await is_chat_admin(ctx.text, ctx.from.id)) {
            let linked_chat = await bot.api.getChat(ctx.text)
            let default_linked_setting = {
                chat_id: linked_chat.id,
                type: linked_chat.type,
                sync: 0,
                administrator_only: 0,
                repeat: 0
            }
            // if(
            await update_setting({
                add_link_chat: default_linked_setting
            }, ctx.chat.id)
            await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'link_done', linked_chat.title, linked_chat.id) + _l(ctx.l, 'link_setting'), {
                ...ctx.default_extra,
                ...k_link_setting(ctx.l, default_linked_setting)
            })
        } else {
            await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra)
        }
        return
    }
    if (chat_id > 0) {
        (async ()=>{
            await ctx.react('👀').catch()
            setTimeout(async () => {
                await ctx.api.setMessageReaction(chat_id, ctx.message.message_id, []).catch()
            }, 5000)
        })()
    }
    let direct_flag = (ctx.message.caption && !ctx.us.caption_extraction) ? false : true
    for (const linked_chat_id in ctx.us.setting.link_chat_list) {
        let link_setting = ctx.us.setting.link_chat_list[linked_chat_id]
        if (ctx.message.sender_chat && ctx.message.sender_chat.id === linked_chat_id) {
            direct_flag = false
            // sync mode
        } else if ((ctx.type !== 'channel') && (chat_id > 0 || link_setting.sync === 0 || (link_setting.sync === 1 && ctx.message.text.includes('@' + bot.botInfo.username)))) {
            // admin only
            if (chat_id > 0 || link_setting.administrator_only === 0 || (link_setting.administrator_only === 1 && await is_chat_admin(chat_id, user_id))) {
                let new_ctx = {
                    ...ctx,
                    chat_id: linked_chat_id,
                    user_id: user_id,
                    default_extra: {
                        parse_mode: 'MarkdownV2'
                    },
                    type: link_setting.type
                }
                delete new_ctx.us
                await tg_sender(new_ctx)
                if (link_setting.repeat < 2) {
                    direct_flag = false
                    if (link_setting.repeat === 1) {
                        // feature request:
                        // return message id
                        await ctx.reply(_l(ctx.l, 'sent'), {
                            ...ctx.default_extra,
                            reply_to_message_id: ctx.message.message_id
                        })
                    }
                }
            }
        }
    }
    if (direct_flag) {
        await tg_sender(ctx)
    }
    return
})

/**
 * build ctx object can send illust / novel manually (subscribe / auto push)
 * @param {*} ctx
 */
async function tg_sender(ctx) {
    let chat_id = ctx.chat_id || ctx.message.chat.id
    let user_id = ctx.user_id || ctx.from.id
    let text = ctx.text || ''
    let default_extra = ctx.default_extra
    if (!ctx.us) {
        ctx.us = await read_user_setting(bot, ctx)
    }
    default_extra.show_caption_above_media = ctx.us.caption_above
    let ids = ctx.ids
    let illusts = []
    // fetch authors' all illusts
    // alpha version (owner only)
    if (ids.author.length > 0) {
        if (user_id === config.tg.master_id) {
            (async ()=>{
                await bot.api.sendChatAction(chat_id, 'typing').catch()
            });
            await asyncForEach(ids.author, async (id) => {
                illusts = [...illusts, ...await get_user_illusts(id)]
            });
        }
    }
    if (ids.illust.length > 0) {
        await asyncForEach(ids.illust, async (id) => {
            let d = await handle_illust(id, ctx.us)
            if (d) {
                if (d === 404) {
                    if (chat_id > 0) {
                        await bot.api.sendMessage(chat_id, _l(ctx.l, 'illust_404'), default_extra)
                        return
                    }
                } else {
                    illusts.push(d)
                }
            }
        })
    }
    if (illusts.length > 0) {
        let mgs = []
        await asyncForEach(ctx.us.desc ? illusts.reverse() : illusts, async (illust) => {
            // telegraph
            ctx.us.q_id += 1
            let mg = illust.mediagroup
            // send as file
            if (!ctx.us.asfile) {
                if (!ctx.us.telegraph && (!ctx.us.album || (illusts.length == 1 && mg.length === 1))) {
                    // see https://core.telegram.org/bots/api#inlinekeyboardbutton
                    // Especially useful when combined with switch_pm… actions – in this case the user will be automatically returned to the chat they switched from, skipping the chat selection screen.
                    // So we need inline share button to switch chat window even if user don't want share button
                    if (illust.type === 2 && ctx.match) {
                        ctx.us.share = true
                    }
                    let extra = {
                        ...default_extra,
                        caption: mg[0].caption.replaceAll('%mid%', ''),
                        ...k_os(illust.id, ctx.us)
                    }
                    if (ctx.us.spoiler) {
                        extra.has_spoiler = ctx.us.spoiler
                    }
                    if (ctx.us.caption_above) {
                        extra.show_caption_above_media = ctx.us.caption_above
                    }
                    if (illust.type <= 1) {
                        let { reply_to_message_id } = extra
                        await asyncForEach(illust.mediagroup, async (o, i) => {
                            let photo_urls = [o.media_o, `dl-${o.media_o}`, o.media_r, `dl-${o.media_r}`]
                            // Telegram will download and send the file. 5 MB max size for photos
                            // It's useless to provide original (Telegram will compress image about 200kb)
                            if (o.fsize > 5000000) {
                                photo_urls = [o.media_r, `dl-${o.media_r}`]
                            }
                            const result = await sendPhotoWithRetry(chat_id, ctx.l, photo_urls, {
                                ...extra,
                                reply_to_message_id,
                                caption: o.caption
                            })
                            reply_to_message_id = result.message_id
                        })
                    } else if (illust.type === 2) {
                        (async ()=>{
                            await bot.api.sendChatAction(chat_id, 'upload_video').catch()
                        });
                        let media = mg[0].media_t
                        if (!media) {
                            if (mg[0].media_o) {
                                media = mg[0].media_o
                            } else {
                                media = await ugoira_to_mp4(illust)
                            }
                        }
                        if (media.includes('tmp/')) {
                            media = new InputFile(media)
                        }
                        await bot.api.sendAnimation(chat_id, media, extra).then(async (data) => {
                            // save ugoira file_id and next time bot can reply without send file
                            if (!illust.tg_file_id && data.document) {
                                let col = db.collection.illust
                                await col.updateOne({
                                    id: illust.id
                                }, {
                                    $set: {
                                        tg_file_id: data.document.file_id
                                    }
                                })
                            }
                        }).catch(async (e) => {
                            if (await catchily(e, chat_id, ctx.l)) {
                                bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                            }
                        })
                    }
                } else {
                    // handle mediagroup
                    if (ctx.us.telegraph || ctx.us.album_one) {
                        if (mgs.length == 0) {
                            mgs.push([])
                        }
                        mgs[0] = [...mgs[0], ...mg]
                    } else {
                        mgs = [...mgs, ...mg]
                    }
                }
            }
        })
        let mg_extra = {
            ...default_extra,
            has_spoiler: ctx.us.spoiler,
            // show_caption_above_media: ctx.us.caption_above
        }
        if (mgs.length > 0) {
            if (ctx.us.telegraph) {
                // when not have title provided and 1 illust only
                if(!ctx.us.telegraph_title && illusts.length === 1) {
                    ctx.us.telegraph_title = illusts[0].title
                    if(!ctx.us.telegraph_author_name){
                        ctx.us.telegraph_author_name = illusts[0].author_name
                        ctx.us.telegraph_author_url = `https://www.pixiv.net/artworks/${illusts[0].id}`
                    }
                }
                try {
                    (async ()=>{
                        await bot.api.sendChatAction(chat_id, 'typing').catch()
                    });
                    let res_data = await mg2telegraph(mgs[0], ctx.us.telegraph_title, user_id, ctx.us.telegraph_author_name, ctx.us.telegraph_author_url)
                    if (res_data) {
                        await asyncForEach(res_data, async (d) => {
                            await bot.api.sendMessage(chat_id, d.ids.join('\n') + '\n' + d.telegraph_url)
                        })
                        await bot.api.sendMessage(chat_id, _l(ctx.l, 'telegraph_iv'), default_extra)
                    }
                } catch (error) {
                    console.warn(error)
                }
            } else {
                await asyncForEach(mg_albumize(mgs, ctx.us), async (mg, i) => {
                    let data = await sendMediaGroupWithRetry(chat_id, ctx.l, mg, mg_extra, ['o', 'r', 'dlo', 'dlr'])
                    if (data) {
                        if (data[0] && data[0].message_id) {
                            mg_extra.reply_to_message_id = data[0].message_id
                        }
                        else {
                            delete mg_extra.reply_to_message_id
                        }
                    } else {
                        honsole.warn('error send mg', data)
                        // await bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                    }
                    // Too Many Requests: retry after 10
                    if (i > 4) {
                        await sleep(3500)
                    } else {
                        await sleep(1500)
                    }
                })
            }
        }
        if (ctx.us.asfile || ctx.us.append_file) {
            await asyncForEach(ctx.us.desc ? illusts.reverse() : illusts, async (illust) => {
                let { reply_to_message_id } = default_extra
                await asyncForEach(illust.mediagroup, async (o) => {
                    (async ()=>{
                        await bot.api.sendChatAction(chat_id, 'upload_document').catch()
                    });
                    let extra = {
                        ...default_extra,
                        caption: o.caption.replaceAll('%mid%', ''),
                        disable_content_type_detection: true,
                        reply_to_message_id
                    }
                    if (o.type === 'video') {
                        // ¿
                        o.media_o = await ugoira_to_mp4(o.id)
                        const ugoira_path = get_ugoira_path(o.id)
                        if (fs.existsSync(ugoira_path)) {
                            o.media_o = new InputFile(get_ugoira_path(o.id))
                        } else if (o.media_o.startsWith('https://')) {
                            o.media_o = new InputFile(new URL(o.media_o))
                        }
                    }
                    await bot.api.sendDocument(chat_id, o.media_o, extra).then(x => {
                        reply_to_message_id = x.message_id
                    }).catch(async (e) => {
                        if (await catchily(e, chat_id, ctx.l)) {
                            if (illust.type <= 2) {
                                await bot.api.sendDocument(chat_id, new InputFile(await fetch_tmp_file(o.media_o)), {
                                    ...extra,
                                }).then(x => {
                                    reply_to_message_id = x.message_id
                                }).catch(async (e) => {
                                    if (await catchily(e, chat_id, ctx.l)) {
                                        await bot.api.sendMessage(chat_id, _l(ctx.l, 'file_too_large', o.media_o.replace('i.pximg.net', config.pixiv.pximgproxy)), default_extra)
                                    }
                                })
                            } else {
                                await bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                            }
                        }
                    })
                })
            })
        }
    }

    if (ids.novel.length > 0) {
        await asyncForEach(ids.novel, async (id) => {
            (async ()=>{
                await bot.api.sendChatAction(chat_id, 'typing').catch()
            });
            let d = await handle_novel(id)
            if (d) {
                await bot.api.sendMessage(chat_id, `${d.telegraph_url}`)
            } else {
                await bot.api.sendMessage(chat_id, _l(ctx.l, 'illust_404'), default_extra)
            }
        })
    }
    if (text.includes('fanbox.cc/') && chat_id > 0) {
        await bot.api.sendMessage(chat_id, _l(ctx.l, 'fanbox_not_support'), default_extra)
    }
    return true
}

bot.on('inline_query', async (ctx) => {
    let res = []
    let offset = ctx.inlineQuery.offset
    if (!offset) {
        offset = 0; // offset == empty -> offset = 0
    }
    let query = ctx.text
    // offset = page
    offset = parseInt(offset)
    let res_options = {
        cache_time: 20,
        is_personal: ctx.us.setting.dbless ? false : true // personal result
    }
    let ids = ctx.ids
    if (ids.illust.length > 0) {
        await asyncForEach([...ids.illust.reverse()], async (id) => {
            let d = await handle_illust(id, ctx.us)
            if (!d || d === 404) {
                return
            }
            // There is no enough time to convert ugoira, so need switch_pm to bot's chat window convert
            if (d.type === 2 && d.inline.length === 0) {
                // pre convert (without await)
                ugoira_to_mp4(d.id)
                await ctx.answerInlineQuery([], {
                    switch_pm_text: _l(ctx.l, 'pm_to_generate_ugoira'),
                    switch_pm_parameter: ids.illust.join('-_-').toString(),
                    cache_time: 0
                }).catch(async (e) => {
                    await catchily(e, chat_id, ctx.l)
                })
                return true
            }
            res = d.inline.concat(res)
        })
        if (res.splice((offset + 1) * 20 - 1, 20)) {
            res_options.next_offset = offset + 1
        }
        res = res.splice(offset * 20, 20)
        // ids.illust > 8 -> .length > 64 = cant send /start with deeplink
        // lazy... I would like to store ids in database or redis
        if (res.length > 1 && ids.illust.length < 8) {
            res_options.switch_pm_text = _l(ctx.l, 'pm_to_get_all_illusts')
            res_options.switch_pm_parameter = ids.illust.join('-')
        }
    } else if (query.replaceAll(' ', '') === '') { // why not use .trim() ? LOL
        let data = await handle_ranking([offset], ctx.us)
        res = data.data
        if (data.next_offset) {
            res_options.next_offset = data.next_offset
        }
    }
    await ctx.answerInlineQuery(res, res_options).catch(async (e) => {
        await catchily(e, config.tg.master_id, ctx.l)
    })
})

bot.catch(async (e) => {
    honsole.warn('gg', e)
    bot.api.sendMessage(config.tg.master_id, e, {
        disable_web_page_preview: true
    })
})

db.db_initial().then(async () => {
    if (!process.env.DEPENDIONLESS && !process.env.dev) {
        try {
            await exec('which ffmpeg')
            await exec('which mp4fpsmod')
            await exec('which unzip')
        }
        catch (error) {
            console.error('You must install ffmpeg, mp4fpsmod and unzip to active ugoira to mp4 function', error)
            console.error('If you want to run bot but won\'t install these above, please exec following command:')
            console.error('DEPENDIONLESS=1 node app.js')
            console.log('bye')
            process.exit()
        }
    }
    bot.init().then(async () => {
        grammyjsRun(bot)

        console.log(new Date(), `bot @${bot.botInfo.username} started!`)
        bot.api.sendMessage(config.tg.master_id, `${new Date().toString()} bot started!`)
    }).catch((e) => {
        console.error('You are offline or bad bot token', e)
        process.exit()
    })
    if (config.web.enabled && !process.env.WEBLESS) {
        import('./web.js')
    }
})

/**
 * catch error report && reply
 * @param {*} e error
 * @param {*} ctx ctx
 */
async function catchily(e, chat_id, language_code = 'en') {
    let default_extra = {
        parse_mode: 'MarkdownV2'
    }
    honsole.warn(e)
    try {
        bot.api.sendMessage(config.tg.master_id, JSON.stringify(e).substring(0, 1000), {
            disable_web_page_preview: true
        }).catch()
        if (!e.ok) {
            const description = e.description.toLowerCase()
            if (description.includes('media_caption_too_long')) {
                bot.api.sendMessage(chat_id, _l(language_code, 'error_text_too_long'), default_extra)
                return false
            } else if (description.includes('can\'t parse entities: character')) {
                bot.api.sendMessage(chat_id, _l(language_code, 'error_format', e.description))
                return false
                // banned by user
            } else if (description.includes('forbidden:')) {
                return false
                // not have permission
            } else if (description.includes('not enough rights to send')) {
                bot.api.sendMessage(chat_id, _l(language_code, 'error_not_enough_rights'), default_extra)
                return false
                // just a moment
            } else if (description.includes('too many requests')) {
                console.log(chat_id, 'sleep', e.description.parameters.retry_after, 's')
                // await sleep(e.description.parameters.retry_after * 1000)
                return 'redo'
            } else if (description.includes('failed to get http url content') || description.includes('wrong file identifier/http url specified') || description.includes('wrong type of the web page content') || description.includes('group send failed')) {
                let photo_urls = []
                if (e.method === 'sendPhoto') {
                    photo_urls[0] = e.payload.photo
                } else if (e.method === 'sendMediaGroup' && e.payload.media) {
                    photo_urls = e.payload.media.filter(m => {
                        return m.media && typeof m.media === 'string' && m.media.includes('https://')
                    }).map(m => {
                        return m.media
                    })
                }
                honsole.dev(photo_urls)
                if (config.tg.refetch_api && photo_urls) {
                    try {
                        await axios.post(config.tg.refetch_api, {
                            url: photo_urls.join('\n')
                        })
                        honsole.log('[ok] fetch new url(s)', photo_urls)
                    } catch (error) {
                        honsole.warn('[err] fetch new url(s)', error)
                    }
                }
            }
        }
    } catch (error) {
        console.warn(error)
        return false
    }
    return true
}

/**
 * send mediagroup with retry
 * @param {*} chat_id
 * @param {*} mg
 * @param {*} extra
 * @param {*} mg_type
 * @returns
 */
async function sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type = []) {
    if (mg_type.length === 0) {
        honsole.warn('empty mg', chat_id, mg)
        return false
    }
    // dirty but work
    // this function not have .us variable
    const has_spoiler = extra.has_spoiler
    if (has_spoiler) {
        delete extra.has_spoiler
    }
    let current_mg_type = mg_type.shift();
    (async ()=>{
        await bot.api.sendChatAction(chat_id, 'upload_photo').catch()
    });
    try {
        return await bot.api.sendMediaGroup(chat_id, await mg_filter([...mg], current_mg_type, has_spoiler), extra)
    } catch (e) {
        let status = await catchily(e, chat_id, language_code)
        if (status) {
            if (status === 'redo') {
                mg_type.unshift(current_mg_type)
            }
            return await sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type)
        } else {
            honsole.warn('error send mg', chat_id, mg)
            return false
        }
    }
}

/**
 * send photo with retry
 * @param {*} chat_id
 * @param {*} mg
 * @param {*} extra
 * @param {*} mg_type
 * @returns
 */
async function sendPhotoWithRetry(chat_id, language_code, photo_urls = [], extra) {
    if (photo_urls.length === 0) {
        honsole.warn('error send photo', chat_id, photo_urls)
        return false
    }
    (async ()=>{
        await bot.api.sendChatAction(chat_id, 'upload_photo').catch()
    });
    let raw_photo_url = photo_urls.shift()
    let photo_url = raw_photo_url
    try {
        if (photo_url.substring(0, 3) === 'dl-') {
            photo_url = new InputFile(await fetch_tmp_file(photo_url.substring(3)))
        }
        return await bot.api.sendPhoto(chat_id, photo_url, extra)
    } catch (e) {
        let status = await catchily(e, chat_id, language_code)
        if (status) {
            if (status === 'redo') {
                photo_urls.unshift(raw_photo_url)
            }
            return await sendPhotoWithRetry(chat_id, language_code, photo_urls, extra)
        } else {
            honsole.warn('error send photo', chat_id, photo_urls)
            return false
        }
    }
}

/**
 * when user is chat's administrator / creator, return true
 * @param {*} chat_id
 * @param {*} user_id
 * @returns Boolean
 */
async function is_chat_admin(chat_id, user_id) {
    try {
        let { status } = await bot.api.getChatMember(chat_id, user_id)
        if (status === 'administrator' || status === 'creator') {
            return true
        }
    }
    catch (e) {
    }
    return false
}
