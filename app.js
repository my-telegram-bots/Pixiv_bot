const { Telegraf, Markup } = require('telegraf')
const { telegrafThrottler } = require('telegraf-throttler')
const exec = require('util').promisify((require('child_process')).exec)
let config = require('./config.json')
const {
    asyncForEach,
    handle_illust, handle_ranking, handle_novel,
    get_pixiv_ids,
    get_user_illusts,
    ugoira_to_mp4,
    download_file,
    _l,
    k_os,
    mg_create, mg_albumize, mg_filter,
    mg2telegraph,
    flagger,
    honsole,
    handle_new_configuration
} = require('./handlers')
const db = require('./db')
const throttler = telegrafThrottler({
    group: {
        minTime: 500
    },
    in: {
        highWater: 100,
        minTime: 500
    },
    out: {
        highWater: 100,
        minTime: 500
    },
    onThrottlerError: (error) => {
        console.warn(error)
    }
})
const bot = new Telegraf(config.tg.token)
bot.use(throttler)
bot.start(async (ctx, next) => {
    // startPayload = deeplink 
    // see more https://core.telegram.org/bots#deep-linking
    if (ctx.startPayload) {
        // callback to bot.on function
        next()
    } else {
        // reply start help command
        await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'start'), {
            parse_mode: 'MarkdownV2',
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
        })
    }
})
bot.help(async (ctx) => {
    await bot.telegram.sendMessage(ctx.chat.id, 'https://pixiv-bot.pages.dev', {
        reply_to_message_id: ctx.message.message_id
    })
})
bot.command('/id', async (ctx, next) => {
    await bot.telegram.sendMessage(ctx.chat.id, (ctx.chat.id < 0 ? `#chatid: \`${ctx.chat.id}\`\n` : '') + `#userid: \`${ctx.from.id}\`\n`, {
        reply_to_message_id: ctx.message.message_id,
        parse_mode: 'Markdown'
    })
})
// read i18n and configuration for message & inline
bot.use(async (ctx, next) => {
    // simple i18n
    ctx.l = (!ctx.from || !ctx.from.language_code) ? 'en' : ctx.from.language_code
    ctx.rtext = ''
    try {
        if (ctx.message && ctx.message.text) {
            // remove command[@username] : /start@Pixiv_bot -> /start
            ctx.rtext = ctx.message.text.replace('@' + ctx.botInfo.username, '')
        }
        if (ctx.inlineQuery && ctx.inlineQuery.query) {
            ctx.rtext = ctx.inlineQuery.query
        }
    } catch (error) {
    }
    let configuration_mode = false
    if (((ctx.rtext.substr(0, 2) == '/s' && ctx.rtext.substr(0, 6) !== '/start') || ctx.rtext.substr(0, 3) == 'eyJ')) {
        configuration_mode = true
    }
    ctx.ids = get_pixiv_ids(ctx.rtext)
    if (!ctx.inlineQuery && ctx.ids.author.length == 0 && ctx.ids.illust.length == 0 && ctx.ids.novel.length == 0 & !configuration_mode) {
        // bot have nothing to do
        return
    }
    // read configuration
    ctx.flag = await flagger(bot, ctx)
    honsole.dev('input ->', ctx.chat, ctx.rtext, ctx.flag)
    // add await => wait this function complete
    if (process.env.dev) {
        await next()
    } else {
        next()
    }
})
bot.on('text', async (ctx) => {
    tg_sender(ctx)
})

/**
 * build ctx object can send illust / novel manually (subscribe / auto push)
 * @param {*} ctx 
 */
async function tg_sender(ctx) {
    let chat_id = ctx.message.chat.id
    let message_id = ctx.message.message_id
    let user_id = ctx.from.id
    let rtext = ctx.rtext ? ctx.rtext : ''
    let default_extra = {
        parse_mode: 'MarkdownV2',
        allow_sending_without_reply: true
    }
    if (message_id) {
        default_extra.reply_to_message_id = message_id
    }
    let temp_data = {
        mg: []
    }
    if (rtext.split(' ')[0] == '/s' || rtext.substr(0, 3) == 'eyJ') {
        await handle_new_configuration(bot, ctx, default_extra)
        return
    }
    let timer_type = []
    let f_timer = () => {
        timer_type = timer_type.filter((v, i, s) => {
            return s.indexOf(v) == i
        })
        if (timer_type.includes('video')) {
            bot.telegram.sendChatAction(chat_id, 'upload_video')
        }
        if (timer_type.includes('photo')) {
            bot.telegram.sendChatAction(chat_id, 'upload_photo')
        }
        if (timer_type.includes('document')) {
            bot.telegram.sendChatAction(chat_id, 'upload_document')
        }
        if (timer_type.includes('typing')) {
            bot.telegram.sendChatAction(chat_id, 'typing')
        }
    }
    let timer = null
    setTimeout(() => {
        f_timer()
        timer = setInterval(f_timer, 3500)
    }, 500)
    // max time (send chatAction) = 30s
    setTimeout(() => {
        clearInterval(timer)
    }, 30000)
    let ids = ctx.ids
    let illusts = []
    if (ids.author.length > 0) {
        timer_type[3] = 'typing'
        if (user_id == config.tg.master_id) {
            await asyncForEach(ids.author, async id => {
                illusts = [...illusts, ...await get_user_illusts(id)]
            })
        }
        timer_type[3] = ''
    }
    if (ids.illust.length > 0) {
        await asyncForEach(ids.illust, async id => {
            let d = await handle_illust(id, ctx.flag)
            if (!d) {
                return
            }
            if (d.type <= 1) timer_type[0] = 'photo'
            if (d.type == 2) timer_type[1] = 'video'
            illusts.push(d)
        })
    }
    if (ctx.flag.desc) {
        illusts = illusts.reverse()
    }
    if (illusts.length > 0) {
        await asyncForEach(illusts, async illust => {
            let d = illust
            if (d == 404) {
                if (chat_id > 0) {
                    await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'illust_404'), { ...default_extra, parse_mode: 'Markdown' })
                    return
                }
            }
            ctx.flag.q_id += 1
            let mg = mg_create(d, ctx.flag)
            // send as file
            if (ctx.flag.asfile) {
                timer_type = ['', '', 'document']
                await asyncForEach(mg, async (o) => {
                    let extra = {
                        ...default_extra,
                        caption: o.caption.replace('%mid%', '').trim()
                    }
                    if (mg.type == 'video') {
                        await ugoira_to_mp4(mg.id)
                    }
                    await bot.telegram.sendDocument(chat_id, o.media_o, extra).catch(async e => {
                        if (catchily(e, ctx)) {
                            if (d.type <= 2) {
                                await bot.telegram.sendDocument(chat_id, { source: await download_file(o.media_o, o.id) }, { ...extra, thumb: { source: await download_file(o.media_r ? o.media_r : o.media_o, o.id) } }).catch(async e => {
                                    if (catchily(e, ctx)) {
                                        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'file_too_large', o.media_o.replace('i-cf.pximg.net', config.pixiv.pximgproxy)), default_extra)
                                    }
                                })
                            } else {
                                await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                            }
                        }
                    })
                })
                timer_type[2] = ''
            } else {
                if (ctx.flag.telegraph || (ctx.flag.album && (ids.illust.length > 1 || (d.imgs_ && d.imgs_.size.length > 1)))) {
                    temp_data.mg = [...temp_data.mg, ...mg]
                } else {
                    if (d.type == 2 && ctx.startPayload) {
                        // see https://core.telegram.org/bots/api#inlinekeyboardbutton
                        // Especially useful when combined with switch_pm… actions – in this case the user will be automatically returned to the chat they switched from, skipping the chat selection screen.
                        // So we need inline share button to switch chat window even if user don't want share button
                        ctx.flag.share = true
                    }
                    let extra = {
                        ...default_extra,
                        caption: mg[0].caption.replaceAll('%mid%', '').trim(),
                        ...k_os(d.id, ctx.flag)
                    }
                    if (d.type <= 1) {
                        if (mg.length == 1) {
                            // mediagroup doesn't support inline keyboard.
                            if (mg.media_t) {
                                await bot.telegram.sendPhoto(chat_id, mg[0].media_t, extra).catch(async e => {
                                    catchily(e, ctx)
                                })
                            } else {
                                if (mg.fsize < 6000000) {
                                    await bot.telegram.sendPhoto(chat_id, mg[0].media_o, extra).catch(async e => {
                                        if (catchily(e, ctx)) {
                                        }
                                    })
                                } else {
                                    await bot.telegram.sendPhoto(chat_id, mg[0].media_r, extra).catch(async e => {
                                        await bot.telegram.sendPhoto(chat_id, await download_file(mg[0].media_o), extra).catch(async e => {
                                            await bot.telegram.sendPhoto(chat_id, await download_file(mg[0].media_r), extra).catch(async e => {
                                                if (catchily(e, ctx)) {
                                                    bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                                                }
                                            })
                                        })
                                    })
                                }
                            }
                        } else {
                            temp_data.mg = [...temp_data.mg, ...mg_albumize(mg)]
                        }
                        timer_type[0] = ''
                    } else if (d.type == 2) {
                        let media = mg.media_t
                        if (!media) {
                            await ugoira_to_mp4(d.id)
                            media = {
                                source: `./tmp/mp4_1/${d.id}.mp4`
                            }
                        }
                        await bot.telegram.sendAnimation(chat_id, media, extra).then(async data => {
                            // save ugoira file_id and next time bot can reply without send file
                            if (!d.tg_file_id && data.document) {
                                let col = db.collection.illust
                                await col.updateOne({
                                    id: d.id
                                }, {
                                    $set: {
                                        tg_file_id: data.document.file_id
                                    }
                                })
                            }
                        }).catch(e => {
                            if (catchily(e, ctx)) {
                                bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                            }
                        })
                        timer_type[1] = ''
                    }
                }
            }
        })
        if (temp_data.mg.length == 0) {
            clearInterval(timer)
            return
        }
        // eslint-disable-next-line no-empty
        if (ctx.flag.asfile) {
        } else if (ctx.flag.telegraph) {
            try {
                let res_data = await mg2telegraph(temp_data.mg, ctx.flag.telegraph_title, user_id, ctx.flag.telegraph_author_name, ctx.flag.telegraph_author_url)
                if (res_data) {
                    await asyncForEach(res_data, async (d) => {
                        await bot.telegram.sendMessage(chat_id, d.ids.join('\n') + '\n' + d.telegraph_url)
                    })
                    await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'telegraph_iv'))
                }
            } catch (error) {
                console.warn(error)
            }
        } else {
            if (ctx.flag.album) {
                temp_data.mg = mg_albumize(temp_data.mg, ctx.flag.single_caption)
            }
            if (temp_data.mg.length > 0) {
                await asyncForEach(temp_data.mg, async (mg) => {
                    await bot.telegram.sendMediaGroup(chat_id, await mg_filter([...mg])).catch(async e => {
                        if (catchily(e, ctx)) {
                            await bot.telegram.sendMediaGroup(chat_id, await mg_filter([...mg], 'r')).catch(async () => {
                                await bot.telegram.sendMediaGroup(chat_id, await mg_filter([...mg], 'dlo')).catch(async () => {
                                    await bot.telegram.sendMediaGroup(chat_id, await mg_filter([...mg], 'dlr')).catch(async e => {
                                        catchily(e, ctx)
                                        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'))
                                    })
                                })
                            })
                        }
                    })
                })
            }
        }
    }

    if (ids.novel.length > 0) {
        try {
            await asyncForEach(ids, async id => {
                let d = await handle_novel(id)
                if (d) {
                    await bot.telegram.sendMessage(chat_id, `${d.telegraph_url}`)
                }
            })
        } catch (error) {
            console.warn(error)
        }
    }
    if (rtext.includes('fanbox.cc/') && chat_id > 0) {
        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'fanbox_not_support'))
    }
    timer_type = []
}
bot.on('inline_query', async (ctx) => {
    let res = []
    let offset = ctx.inlineQuery.offset
    if (!offset)
        offset = 0 // offset == empty -> offset = 0
    let query = ctx.rtext
    // offset = page
    offset = parseInt(offset)
    let res_options = {
        cache_time: 20, // maybe update format
        is_personal: ctx.flag.setting.dbless ? false : true // personal result
    }
    let ids = ctx.ids
    if (ids.illust.length > 0) {
        await asyncForEach([...ids.illust.reverse()], async id => {
            let d = await handle_illust(id, ctx.flag)
            // There is no enough time to convert ugoira, so need switch_pm to bot's chat window convert
            if (d.type == 2 && d.inline.length == 0) {
                // pre convert (without await)
                ugoira_to_mp4(d.id)
                await ctx.answerInlineQuery([], {
                    switch_pm_text: _l(ctx.l, 'pm_to_generate_ugoira'),
                    switch_pm_parameter: ids.illust.join('-_-').toString(),
                    cache_time: 0
                }).catch(async e => {
                    catchily(e, ctx)
                })
                return true
            }
            res = d.inline.concat(res)
        })
        if (res.splice((offset + 1) * 20 - 1, 20)) {
            res_options.next_offset = offset + 1
        }
        res = res.splice(offset * 20, 20)
    } else if (query.replaceAll(' ', '') == '') { // why not use .trim() ? LOL
        let data = await handle_ranking([offset], ctx.flag)
        res = data.data
        if (data.next_offset) {
            res_options.next_offset = data.next_offset
        }
    }
    await ctx.answerInlineQuery(res, res_options).catch(async e => {
        catchily(e, ctx)
    })
})
bot.catch(async (e, ctx) => {
    catchily(e, ctx)
})
db.db_initial().then(async () => {
    if (!process.env.DEPENDIONLESS && !process.env.dev) {
        try {
            await exec('which ffmpeg')
            await exec('which mp4fpsmod')
        } catch (error) {
            console.error('You must install ffmpeg and mp4fpsmod to enable ugoira to mp4 function', error)
            console.error('If you want to run but won\'t install ffmpeg and mp4fpsmod, please exec following command:')
            console.error('DEPENDIONLESS=1 node app.js')
            console.log('bye')
            process.exit()
        }
    }
    await bot.launch().then(async () => {
        console.log(new Date(), 'bot started!')
        bot.telegram.sendMessage(config.tg.master_id, `${new Date().toString()} bot started!`)
    }).catch((e) => {
        console.error('You are offline or bad bot token', e)
        process.exit()
    })
    if (config.web.enabled) {
        // simple runner?
        require('./web')
    }
}).catch(e => {
    console.error('database error', e)
    console.log('bye')
    process.exit()
})

/**
 * catch error report && reply
 * @param {*} e error
 * @param {*} ctx ctx
 */
function catchily(e, chat_id) {
    honsole.error(e)
    bot.telegram.sendMessage(config.tg.master_id, 'error' + e)
    if (e.response) {
        if (e.response.description.includes('MEDIA_CAPTION_TOO_LONG')) {
            bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error_text_too_long'))
            return false
        } else if (e.response.description.includes('Forbidden:')) {
            return false
        }
    }
    return true
}