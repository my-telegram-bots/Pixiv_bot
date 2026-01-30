import { run as grammyjsRun } from '@grammyjs/runner'
import { loadAndValidateConfig, checkSystemDependencies } from '#handlers/utils/config-validator'
import db from '#db'

// Load and validate configuration at startup
let config
try {
    config = await loadAndValidateConfig()
    console.log('✓ Configuration loaded and validated successfully')
} catch (error) {
    console.error('✗ Configuration validation failed:', error.message)
    process.exit(1)
}
import { update_setting } from '#db'
import { asyncForEach, handle_illust, handle_ranking, handle_novel, get_pixiv_ids, get_user_illusts, ugoira_to_mp4, _l, k_os, k_link_setting, mg_albumize, mg2telegraph, read_user_setting, honsole, handle_new_configuration, sleep, reescape_strings, format, memoryMonitor } from '#handlers/index'
import { sendDocumentWithRetry, sendPhotoWithRetry, sendMediaGroupWithRetry, catchily } from '#handlers/telegram/sender'
import { createBot, getBot } from './bot.js'
import { FileCleaner } from '#handlers/utils/file-cleaner'
import { InputFile } from 'grammy'
import illustService from '#handlers/pixiv/illust-service'
import { ugoira_to_mp4 as ugoiraConverter } from '#handlers/pixiv/tools'
import { rankingScheduler } from '#handlers/pixiv/ranking-scheduler'

// Create bot instance with validated configuration
createBot(config)
const bot = getBot()
console.log('✓ Telegram bot instance created')

// Initialize file cleaner for temporary files only
const fileCleaner = new FileCleaner({
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 2 * 1024 * 1024 * 1024, // 2GB
    cleanupInterval: 2 * 60 * 60 * 1000, // 2 hours
    directories: ['./tmp/file', './tmp/ugoira', './tmp/timecode'] // 仅临时文件，不清理 MP4
})
fileCleaner.start()
console.log('✓ File cleanup scheduler started (temp files only, MP4 files preserved)')

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
                ctx.command = ctx.message.text.substring(1, ctx.message.entities[0].length)
                if (ctx.command.includes(`@${bot.botInfo.username}`)) {
                    ctx.command = ctx.command.replace(`@${bot.botInfo.username}`, '')
                    ctx.text = ctx.text.replace(`@${bot.botInfo.username}`, '')
                }
            }
        }
        ctx.default_extra.reply_to_message_id = ctx.message.message_id
        if (ctx.message.message_thread_id) {
            ctx.default_extra.message_thread_id = ctx.message.message_thread_id
        }
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
    next()
})

bot.command('start', async (ctx, next) => {
    // match = deeplink
    // see more https://core.telegram.org/bots#deep-linking
    if (!ctx.match.trim() || ctx.match === 's') {
        // reply start help command
        await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'start'), {
            ...ctx.default_extra
        }).catch(e => {
            honsole.warn('Failed to send start message:', e.description || e.message)
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
    }).catch(e => {
        honsole.warn('Failed to send help message:', e.description || e.message)
    })
})
bot.command('privacy', async (ctx) => {
    await bot.api.sendMessage(ctx.chat.id, 'https://pixiv-bot.pages.dev/privacy', {
        ...ctx.default_extra,
        parse_mode: ''
    }).catch(e => {
        honsole.warn('Failed to send privacy message:', e.description || e.message)
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
    }).catch(e => {
        honsole.warn('Failed to send id message:', e.description || e.message)
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
                }).catch(e => {
                    honsole.warn('Failed to edit message:', e.description || e.message)
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
                    await ctx.editMessageReplyMarkup(k_link_setting(ctx.l, link_setting))
                    apply_flag = true
                }
                catch (error) {
                    console.warn(error)
                }
            }
        } else {
            await ctx.answerCallbackQuery(reescape_strings(_l(ctx.l, 'error_not_a_gc_administrator')), {
                show_alert: true
            }).catch(() => { })
            return
        }
    }
    if (apply_flag) {
        await ctx.answerCallbackQuery(reescape_strings(_l(ctx.l, 'saved'))).catch(() => { })
    } else {
        await ctx.answerCallbackQuery(reescape_strings(_l(ctx.l, 'error'))).catch(() => { })
    }
})

bot.command('link', async (ctx) => {
    // link this chat to another chat / channel
    let chat_id = ctx.message.chat.id
    let user_id = ctx.from.id
    if (ctx.from.id === 1087968824) {
        await bot.api.sendMessage(chat_id, _l(ctx.l, 'error_anonymous'), ctx.default_extra).catch(e => {
            honsole.warn('Failed to send anonymous error message:', e.description || e.message)
        })
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
                        }).catch(e => {
                            honsole.warn('Failed to send link setting message:', e.description || e.message)
                        })
                    } else {
                        await bot.api.sendMessage(chat_id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra).catch(e => {
                            honsole.warn('Failed to send admin check error message:', e.description || e.message)
                        })
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
                }).catch(e => {
                    honsole.warn('Failed to send link start message:', e.description || e.message)
                })
            }
        } else {
            await bot.api.sendMessage(chat_id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra).catch(e => {
                honsole.warn('Failed to send admin check error message:', e.description || e.message)
            })
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
            await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'error_anonymous'), ctx.default_extra).catch(e => {
                honsole.warn('Failed to send anonymous error message:', e.description || e.message)
            })
        }
        if ((ctx.chat.id > 0 || await is_chat_admin(ctx.chat.id, ctx.from.id)) && await is_chat_admin(ctx.text, ctx.from.id)) {
            let linked_chat = await bot.api.getChat(ctx.text).catch(e => {
                honsole.warn('Failed to get chat info:', e.description || e.message)
                return null
            })
            if (!linked_chat) return
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
            }).catch(e => {
                honsole.warn('Failed to send link done message:', e.description || e.message)
            })
        } else {
            await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra).catch(e => {
                honsole.warn('Failed to send admin check error message:', e.description || e.message)
            })
        }
        return
    }
    if (chat_id > 0) {
        (async () => {
            await ctx.react('👀').catch(() => { })
            setTimeout(async () => {
                await ctx.api.setMessageReaction(chat_id, ctx.message.message_id, []).catch(() => { })
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
                // Non-blocking processing for linked chats
                tg_sender(new_ctx).catch(error => {
                    honsole.error('Error processing linked chat message:', error)
                })
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
        // Check if this message contains Pixiv IDs that need processing
        if (ctx.ids && (ctx.ids.illust.length > 0 || ctx.ids.novel.length > 0)) {
            // Send quick acknowledgment for private chats with Pixiv content
            if (chat_id > 0) {
                // Start appropriate action indicator - use upload_photo for illusts, typing for novels
                const action = ctx.ids.illust.length > 0 ? 'upload_photo' : 'typing'
                bot.api.sendChatAction(chat_id, action, ctx.default_extra.message_thread_id ? {
                    message_thread_id: ctx.default_extra.message_thread_id
                } : {}).catch(() => { })

                // Process asynchronously without blocking
                tg_sender(ctx).catch(error => {
                    honsole.error('Error processing direct message:', error)
                    // Send error notification to user
                    bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), ctx.default_extra).catch(() => { })
                })
            } else {
                // For groups/channels, process synchronously to maintain message order
                try {
                    await tg_sender(ctx)
                } catch (error) {
                    honsole.error('Error processing group/channel message:', error)
                    // Send error notification
                    bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), ctx.default_extra).catch(() => { })
                }
            }
        } else {
            // For non-Pixiv messages, process normally (fast anyway)
            try {
                await tg_sender(ctx)
            } catch (error) {
                honsole.error('Error processing non-Pixiv message:', error)
                bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), ctx.default_extra).catch(() => { })
            }
        }
    }
    return
})


/**
 * build ctx object can send illust / novel manually (subscribe / auto push)
 * @param {*} ctx
 */
export async function tg_sender(ctx) {
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
            (async () => {
                await bot.api.sendChatAction(chat_id, 'upload_photo', ctx.default_extra.message_thread_id ? {
                    message_thread_id: ctx.default_extra.message_thread_id
                } : {}).catch(() => { })
            })();
            await asyncForEach(ids.author, async (id) => {
                illusts = [...illusts, ...await get_user_illusts(id)]
            });
        }
    }
    if (ids.illust.length > 0) {
        // Parallel processing for better performance (40-60% faster for multiple IDs)
        const results = await Promise.allSettled(
            ids.illust.map(id => handle_illust(id, ctx.us))
        )

        // Process results
        let has404 = false
        let hasError = false

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const d = result.value
                if (d === 404) {
                    has404 = true
                } else if (d === false) {
                    hasError = true
                } else if (d) {
                    illusts.push(d)
                }
            } else {
                // Promise rejected
                honsole.error('Failed to handle illust:', result.reason)
                hasError = true
            }
        }

        // Send error notifications only in private chats
        if (chat_id > 0) {
            if (has404 && illusts.length === 0) {
                await bot.api.sendMessage(chat_id, _l(ctx.l, 'illust_404'), default_extra).catch(() => { })
            }
            if (hasError && illusts.length === 0) {
                await bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra).catch(() => { })
            }
        }
    }
    if (illusts.length > 0) {
        let mgs = []
        let files = []
        await asyncForEach(ctx.us.desc ? illusts.reverse() : illusts, async (illust) => {
            // telegraph
            ctx.us.q_id += 1
            let mg = illust.mediagroup
            if (!ctx.us.telegraph &&
                (
                    !ctx.us.album ||
                    (illusts.length == 1 && mg.length === 1) ||
                    (!ctx.us.album_one && mg.length === 1)
                )) {
                // see https://core.telegram.org/bots/api#inlinekeyboardbutton
                // Especially useful when combined with switch_pm… actions – in this case the user will be automatically returned to the chat they switched from, skipping the chat selection screen.
                // So we need inline share button to switch chat window even if user don't want share button
                if (illust.type === 2 && ctx.match) {
                    ctx.us.share = true
                }
                let extra = {
                    ...default_extra,
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
                    let file_reply_to_message_id = reply_to_message_id
                    await asyncForEach(illust.mediagroup, async (o, i) => {
                        let photo_urls = [o.media_r, `dl-${o.media_r}`]
                        let extra_one = {
                            ...extra,
                            caption: ctx.us.single_caption ? format(illust, {
                                ...ctx.us,
                                single_caption: false
                            }, 'message', i) : o.caption
                        }
                        if (!ctx.us.asfile) {
                            let result = await sendPhotoWithRetry(chat_id, ctx.l, photo_urls, {
                                ...extra_one,
                                reply_to_message_id
                            })
                            if (result && result.message_id) {
                                reply_to_message_id = result.message_id
                            } else {
                                honsole.warn('Failed to send photo for illust', illust.id, 'page', i)
                                // Notify user of failure
                                await bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra).catch(() => { })
                            }
                        }
                        if (ctx.us.asfile || ctx.us.append_file_immediate) {
                            delete extra_one.reply_markup
                            let result = await sendDocumentWithRetry(chat_id, o.media_o, {
                                ...extra_one,
                                reply_to_message_id: ctx.us.append_file_immediate ? reply_to_message_id : file_reply_to_message_id
                            }, ctx.l)
                            if (ctx.us.append_file_immediate && result) {
                                file_reply_to_message_id = result
                            }
                        }
                        if (ctx.us.append_file && !ctx.us.append_file_immediate) {
                            delete extra_one.reply_markup
                            files.push([chat_id, o.media_o, extra_one, ctx.l])
                        }
                    })
                } else if (illust.type === 2) {
                    // Ugoira - send upload_video action
                    bot.api.sendChatAction(chat_id, 'upload_video', ctx.default_extra.message_thread_id ? {
                        message_thread_id: ctx.default_extra.message_thread_id
                    } : {}).catch(() => { })

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
                    if (!ctx.us.asfile) {
                        let result
                        try {
                            // First try: send external URL
                            result = await bot.api.sendAnimation(chat_id, media, {
                                ...extra,
                                caption: mg[0].caption
                            })
                        } catch (e) {
                            // Retry: download from ugoira server to memory and send as arraybuffer
                            if (typeof media === 'string' && media.includes(config.pixiv.ugoiraurl)) {
                                honsole.warn('External ugoira URL failed, downloading to memory:', media)
                                try {
                                    // Download directly to memory as arraybuffer
                                    const arrayBuffer = await fetch_tmp_file(media, 0, true)
                                    if (arrayBuffer) {
                                        honsole.log('Downloaded ugoira to memory, retrying send')
                                        // Create InputFile from arraybuffer
                                        result = await bot.api.sendAnimation(chat_id, new InputFile(arrayBuffer, `${illust.id}.mp4`), {
                                            ...extra,
                                            caption: mg[0].caption
                                        })
                                    } else {
                                        throw new Error('Failed to download ugoira to memory')
                                    }
                                } catch (downloadError) {
                                    honsole.error('Failed to download and send ugoira:', downloadError)
                                    if (await catchily(e, chat_id, ctx.l)) {
                                        bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra).catch(() => { })
                                    }
                                }
                            } else {
                                if (await catchily(e, chat_id, ctx.l)) {
                                    bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra).catch(() => { })
                                }
                            }
                        }
                        // save ugoira file_id and next time bot can reply without send file
                        if (!illust.tg_file_id && result?.document) {
                            let col = db.collection.illust
                            await col.updateOne({
                                id: illust.id
                            }, {
                                $set: {
                                    tg_file_id: result.document.file_id
                                }
                            })
                        }
                        if (result) {
                            extra.reply_to_message_id = result.message_id
                        } else {
                            honsole.warn('Failed to send ugoira animation for illust', illust.id)
                            // Error already notified by catch blocks above
                        }
                    }
                    if (ctx.us.asfile || ctx.us.append_file_immediate) {
                        delete extra.reply_markup
                        const result = await sendDocumentWithRetry(chat_id, mg[0].media_o, {
                            ...extra,
                            caption: mg[0].caption,
                            disable_content_type_detection: true
                        }, ctx.l).catch(async (e) => {
                            if (await catchily(e, chat_id, ctx.l)) {
                                bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra).catch(() => { })
                            }
                        })
                    }
                    if (ctx.us.append_file && !ctx.us.append_file_immediate) {
                        delete extra.reply_markup
                        files.push([chat_id, mg[0].media_o, extra, ctx.l])
                    }
                }
            } else {
                // handle mediagroup
                if (ctx.us.telegraph || ctx.us.album_one) {
                    if (mgs.length === 0) {
                        mgs.push([])
                    }
                    mgs[0] = [...mgs[0], ...mg]
                } else {
                    mgs = [...mgs, mg]
                }
            }
        })
        let mg_extra = {}
        if (ctx.message.message_thread_id) {
            mg_extra.message_thread_id = ctx.message.message_thread_id
        }
        if (mgs.length > 0) {
            if (ctx.us.telegraph) {
                // when not have title provided and 1 illust only
                if (!ctx.us.telegraph_title && illusts.length === 1) {
                    ctx.us.telegraph_title = illusts[0].title
                    if (!ctx.us.telegraph_author_name) {
                        ctx.us.telegraph_author_name = illusts[0].author_name
                        ctx.us.telegraph_author_url = `https://www.pixiv.net/artworks/${illusts[0].id}`
                    }
                }
                try {
                    // Telegraph conversion - use typing action for text processing
                    bot.api.sendChatAction(chat_id, 'typing', ctx.default_extra.message_thread_id ? {
                        message_thread_id: ctx.default_extra.message_thread_id
                    } : {}).catch(() => { })

                    let res_data = await mg2telegraph(mgs[0], ctx.us.telegraph_title, user_id, ctx.us.telegraph_author_name, ctx.us.telegraph_author_url)
                    if (res_data) {
                        await asyncForEach(res_data, async (d) => {
                            await bot.api.sendMessage(chat_id, d.ids.join('\n') + '\n' + d.telegraph_url, default_extra).catch(() => { })
                        })
                        await bot.api.sendMessage(chat_id, _l(ctx.l, 'telegraph_iv'), default_extra).catch(() => { })
                    }
                } catch (error) {
                    console.warn(error)
                }
            } else {
                // Bad Request: document can't be mixed with other media types
                // if (ctx.us.append_file_immediate) {
                //     const mgs_f = mgs.map(mg => {
                //         return {
                //             ...mg,
                //             type: 'document'
                //         }
                //     })
                //     mgs = mgs.flatMap((value, index) => [value, mgs_f[index]])
                // }
                await asyncForEach(mgs, async mgsi => {
                    await asyncForEach(mg_albumize(mgsi, ctx.us), async (mg, i) => {
                        let single_caption = ''
                        if (ctx.us.single_caption) {
                            if (mg.every(m => m.id === mg[0].id)) {
                                single_caption = format(illusts.find((illust) => illust.id === mg[0].id), {
                                    ...ctx.us,
                                    single_caption: false
                                }, 'message', -1, false)
                            } else {
                                mg.forEach((m, mid) => {
                                    single_caption += format(illusts.find((illust) => illust.id === m.id), ctx.us, 'mediagroup_message', m.p, mid + 1)
                                    if (mg.length - 1 !== i) {
                                        single_caption += '\n'
                                    }
                                })
                            }
                            mg[0].caption = single_caption
                        }
                        let result = await sendMediaGroupWithRetry(chat_id, ctx.l, mg, mg_extra, ['r', 'o', 'dlr', 'dlo'])
                        if (result) {
                            if (result[0] && result[0].message_id) {
                                mg_extra.reply_to_message_id = result[0].message_id
                            } else {
                                delete mg_extra.reply_to_message_id
                            }
                        } else {
                            honsole.warn('error send mg', result)
                            // Notify user of failure so they know to retry
                            await bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra).catch(() => { })
                        }
                        // Too Many Requests: retry after 10
                        if (i > 4) {
                            await sleep(1500)
                        } else {
                            await sleep(500)
                        }
                        if (ctx.us.append_file_immediate) {
                            let result = await sendMediaGroupWithRetry(chat_id, ctx.l, mg.map(mg => {
                                return {
                                    ...mg,
                                    type: 'document'
                                }
                            }), mg_extra, ['o', 'dlo'])
                            if (result) {
                                if (result[0] && result[0].message_id) {
                                    mg_extra.reply_to_message_id = result[0].message_id
                                } else {
                                    delete mg_extra.reply_to_message_id
                                }
                            } else {
                                honsole.warn('error send mg (append_file_immediate)', result)
                                // Notify user of failure so they know to retry
                                await bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra).catch(() => { })
                            }
                            // Too Many Requests: retry after 10
                            if (i > 4) {
                                await sleep(1500)
                            } else {
                                await sleep(500)
                            }
                        }
                    })
                })
                if (ctx.us.append_file && !ctx.us.append_file_immediate) {
                    await asyncForEach(mgs, async mgsi => {
                        await asyncForEach(mg_albumize(mgsi, ctx.us), async (mg, i) => {
                            let result = await sendMediaGroupWithRetry(chat_id, ctx.l, mg.map(mg => {
                                delete mg.media_t
                                return {
                                    ...mg,
                                    type: 'document'
                                }
                            }), mg_extra, ['o', 'dlo'])
                            if (result) {
                                if (result[0] && result[0].message_id) {
                                    mg_extra.reply_to_message_id = result[0].message_id
                                } else {
                                    delete mg_extra.reply_to_message_id
                                }
                            } else {
                                honsole.warn('error send mg (append_file)', result)
                                // Notify user of failure so they know to retry
                                await bot.api.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra).catch(() => { })
                            }
                            // Too Many Requests: retry after 10
                            if (i > 4) {
                                await sleep(1500)
                            } else {
                                await sleep(500)
                            }
                        })
                    })
                }
            }
        }

        await asyncForEach(files, async (f, i) => {
            const result = await sendDocumentWithRetry(...f)
            if (!result) {
                honsole.warn('Failed to send appended file', i, f[1])
                // Note: error already sent by sendDocumentWithRetry if applicable
            }
        })
    }

    if (ids.novel.length > 0) {
        await asyncForEach(ids.novel, async (id) => {
            // Novel - use typing action for text content
            bot.api.sendChatAction(chat_id, 'typing', ctx.default_extra.message_thread_id ? {
                message_thread_id: ctx.default_extra.message_thread_id
            } : {}).catch(() => { })

            let d = await handle_novel(id)
            if (d) {
                let extra = { ...default_extra }
                delete extra.parse_mode
                await bot.api.sendMessage(chat_id, `${d.telegraph_url}`, extra).catch(e => {
                    if (e.error_code === 400 && e.description === 'Bad Request: TOPIC_CLOSED') {
                        console.log('Topic is closed, skipping message')
                        return
                    }
                    console.warn(e)
                })
            } else {
                await bot.api.sendMessage(chat_id, _l(ctx.l, 'illust_404'), default_extra).catch(() => { })
            }
        })
    }
    if (text.includes('fanbox.cc/') && chat_id > 0) {
        await bot.api.sendMessage(chat_id, _l(ctx.l, 'fanbox_not_support'), default_extra).catch(() => { })
    }
    return true
}

bot.on('inline_query', async (ctx) => {
    const startTime = Date.now()
    const TIMEOUT = 25000 // 25 seconds (Telegram limit is 30s, leave 5s buffer)

    const offset = parseInt(ctx.inlineQuery.offset) || 0
    const query = ctx.text
    const ids = ctx.ids

    let res = []
    const res_options = {
        cache_time: 20,
        is_personal: !ctx.us.setting.dbless // personal result
    }

    if (ids.illust.length > 0) {
        // Deduplicate and reverse (newest first)
        const uniqueIds = [...new Set(ids.illust)].reverse()

        // Parallel processing with IllustService
        const illustPromises = uniqueIds.map(async (id) => {
            try {
                if (Date.now() - startTime > TIMEOUT) {
                    honsole.warn('[inline_query] Timeout approaching, skipping illust', id)
                    return null
                }

                // Use IllustService.getQuick() for fast inline response
                const illust = await illustService.getQuick(id)
                if (!illust || illust === 404) {
                    return null
                }

                // Build inline results (with URL validation)
                const inline = []
                if (illust.type <= 1) {
                    illust.imgs_.size.forEach((size, pid) => {
                        // Skip if URLs are missing
                        if (!illust.imgs_.regular_urls[pid]) {
                            honsole.warn('[inline_query] Missing URLs for illust', illust.id, 'pid', pid)
                            return
                        }
                        const regular_url = illust.imgs_.regular_urls[pid]

                        inline[pid] = {
                            type: 'photo',
                            id: 'p_' + illust.id + '-' + pid,
                            photo_url: regular_url,
                            thumbnail_url: regular_url,  // Use same URL for thumbnail to avoid URL issues
                            caption: format(illust, ctx.us, 'inline', pid),
                            photo_width: size.width,
                            photo_height: size.height,
                            parse_mode: 'MarkdownV2',
                            show_caption_above_media: ctx.us.caption_above,
                            ...k_os(illust.id, ctx.us)
                        }
                    })
                } else if (illust.type === 2) {
                    // Ugoira - only show if already converted to MP4
                    if (illust.tg_file_id || process.env.DBLESS) {
                        const options = {}
                        if (illust.tg_file_id) {
                            options.mpeg4_file_id = illust.tg_file_id
                        } else if (process.env.DBLESS) {
                            options.mpeg4_url = await ugoira_to_mp4(illust)
                            options.thumbnail_url = illust.imgs_.cover_img_url
                        }
                        inline[0] = {
                            type: 'mpeg4_gif',
                            id: 'p' + illust.id,
                            caption: format(illust, ctx.us, 'inline', 1),
                            parse_mode: 'MarkdownV2',
                            show_caption_above_media: ctx.us.caption_above,
                            ...options,
                            ...k_os(illust.id, ctx.us)
                        }
                        if (ctx.us.spoiler) {
                            inline[0].has_spoiler = true
                        }
                    } else {
                        // Not converted yet - mark for redirect (collect all unconverted ugoiras)
                        ugoiraConverter(illust.id)
                        return { type: 'ugoira_redirect', id }
                    }
                }

                // Filter out undefined elements (from skipped URLs)
                return inline.filter(Boolean)
            } catch (error) {
                honsole.error('[inline_query] Failed to handle illust', id, error)
                return null
            }
        })

        // Wait for all promises to complete
        const results = await Promise.allSettled(illustPromises)

        // Collect ugoira redirect IDs and regular results
        const ugoiraRedirectIds = []
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                if (result.value.type === 'ugoira_redirect') {
                    ugoiraRedirectIds.push(result.value.id)
                } else if (Array.isArray(result.value)) {
                    res = res.concat(result.value)
                }
            }
        }

        // If any ugoira needs conversion, redirect to PM
        if (ugoiraRedirectIds.length > 0) {
            await ctx.answerInlineQuery([], {
                switch_pm_text: _l(ctx.l, 'pm_to_generate_ugoira'),
                switch_pm_parameter: ugoiraRedirectIds.join('-_-'),
                cache_time: 0
            }).catch(async (e) => {
                await catchily(e, config.tg.master_id, ctx.l)
            })
            return
        }

        // Add "Get all" button if total results > 1 and within deeplink limit
        if (res.length > 1 && uniqueIds.length < 8) {
            res_options.switch_pm_text = _l(ctx.l, 'pm_to_get_all_illusts')
            res_options.switch_pm_parameter = uniqueIds.join('-')
        }

        // Pagination: slice results for current page
        const itemsPerPage = 20
        const startIndex = offset * itemsPerPage
        const endIndex = startIndex + itemsPerPage

        if (endIndex < res.length) {
            res_options.next_offset = offset + 1
        }

        res = res.slice(startIndex, endIndex)
    } else if (query.trim() === '') {
        // Ranking query
        try {
            const data = await handle_ranking([offset], ctx.us)
            if (data) {
                res = data.data || []
                if (data.next_offset) {
                    res_options.next_offset = data.next_offset
                }
            }
        } catch (error) {
            honsole.error('[inline_query] Ranking failed:', error)
        }
    }

    // Return results (empty array if no results found)
    const duration = Date.now() - startTime
    honsole.dev(`[inline_query] Completed in ${duration}ms with ${res.length} results`)

    await ctx.answerInlineQuery(res, res_options).catch(async (e) => {
        await catchily(e, config.tg.master_id, ctx.l)
    })
})

bot.catch(async (e) => {
    honsole.warn('gg', e)
    bot.api.sendMessage(config.tg.master_id, e.substring(0, 1000).replace(config.tg.token, '<REALLOCATED>'), {
        disable_web_page_preview: true
    }).catch(() => { })
})

db.db_initial().then(async () => {
    // Check system dependencies
    if (!process.env.DEPENDIONLESS && !process.env.dev) {
        try {
            const depCheck = await checkSystemDependencies()
            if (!depCheck.allPresent) {
                console.error('✗ Missing system dependencies for ugoira to MP4 conversion:')
                depCheck.missing.forEach(dep => console.error(`  - ${dep}`))
                console.error('Install missing dependencies or run with: DEPENDIONLESS=1 node app.js')
                process.exit(1)
            } else {
                console.log('✓ All system dependencies are installed')
            }
        } catch (error) {
            console.error('✗ Error checking system dependencies:', error)
            process.exit(1)
        }
    } else {
        console.log('⚠ Running without dependency check (DEPENDIONLESS mode)')
    }
    if (process.argv[1].includes('cron')) {
        return
    }
    bot.init().then(async () => {
        // Initialize memory monitor with bot instance
        memoryMonitor.init(bot, config.tg.master_id)
        console.log('✓ Memory monitor initialized')

        // Initialize ranking scheduler (skip in dbless mode)
        if (!process.env.DBLESS) {
            rankingScheduler.start()
            console.log('✓ Ranking scheduler initialized')
        } else {
            console.log('⚠ Ranking scheduler skipped (DBLESS mode)')
        }

        grammyjsRun(bot)

        console.log(new Date(), `bot @${bot.botInfo.username} started!`)
        bot.api.sendMessage(config.tg.master_id, `${new Date().toString()} bot started!`).catch(() => { })
    }).catch((e) => {
        console.error('You are offline or bad bot token', e)
        process.exit()
    })
    if (config.web.enabled && !process.env.WEBLESS) {
        import('./web.js')
    }
})

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
