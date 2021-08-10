const { Telegraf, Markup } = require('telegraf')
const { telegrafThrottler } = require('telegraf-throttler')
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
    handle_new_configuration,
    exec,
    sleep
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
    }
})
const bot = new Telegraf(config.tg.token)
bot.use(throttler)

bot.start(async (ctx, next) => {
    // startPayload = deeplink 
    // see more https://core.telegram.org/bots#deep-linking
    if (!ctx.startPayload.trim() || ctx.startPayload === 's') {
        // reply start help command
        await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'start'), {
            parse_mode: 'MarkdownV2',
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
        })
    } else {
        // callback to bot.on function
        next()
    }
})

bot.help(async (ctx) => {
    await bot.telegram.sendMessage(ctx.chat.id, 'https://pixiv-bot.pages.dev', {
        reply_to_message_id: ctx.message.message_id
    })
})

bot.command('/id', async (ctx) => {
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
    if (!ctx.rtext.includes('fanbox.cc') && !ctx.inlineQuery && JSON.stringify(ctx.ids).length === 36 & !configuration_mode) {
        // bot have nothing to do
        return
    }
    // read configuration
    ctx.flag = await flagger(bot, ctx)
    honsole.dev('input ->', ctx.chat, ctx.rtext, ctx.flag)
    if (ctx.flag === 'error') {
        honsole.warn('flag error', ctx.rtext)
        return
    }
    // add await => wait this function complete
    else if (process.env.dev) {
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
        parse_mode: 'MarkdownV2'
    }
    if (message_id) {
        default_extra.allow_sending_without_reply = true
        default_extra.reply_to_message_id = message_id
    }
    let temp_data = {
        mg: []
    }
    if (rtext.split(' ')[0] == '/s' || rtext.substr(0, 3) == 'eyJ') {
        await handle_new_configuration(bot, ctx, default_extra)
        return
    }
    let ids = ctx.ids
    let illusts = []
    if (ids.author.length > 0) {
        if (user_id == config.tg.master_id) {
            bot.telegram.sendChatAction(chat_id, 'typing')
            await asyncForEach(ids.author, async id => {
                illusts = [...illusts, ...await get_user_illusts(id)]
            })
        }
    }
    if (ids.illust.length > 0) {
        await asyncForEach(ids.illust, async id => {
            let d = await handle_illust(id, ctx.flag)
            if (d) {
                // if (d.type <= 1) bot.telegram.sendChatAction(chat_id, 'upload_photo')
                // if (d.type == 2) bot.telegram.sendChatAction(chat_id, 'upload_video')
                illusts.push(d)
            }
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
                    await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'illust_404'), default_extra)
                    return
                }
            }
            ctx.flag.q_id += 1
            let mg = mg_create(d, ctx.flag)
            // send as file
            if (ctx.flag.asfile) {
                await asyncForEach(mg, async (o) => {
                    bot.telegram.sendChatAction(chat_id, 'upload_document')
                    let extra = {
                        ...default_extra,
                        caption: o.caption.replaceAll('%mid%', '')
                    }
                    if (mg.type == 'video') {
                        await ugoira_to_mp4(mg.id)
                    }
                    await bot.telegram.sendDocument(chat_id, o.media_o, extra).catch(async e => {
                        if (catchily(e, chat_id, ctx.l)) {
                            if (d.type <= 2) {
                                await bot.telegram.sendDocument(chat_id, { source: await download_file(o.media_o, o.id) }, { ...extra, thumb: { source: await download_file(o.media_r ? o.media_r : o.media_o, o.id) } }).catch(async e => {
                                    if (catchily(e, chat_id, ctx.l)) {
                                        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'file_too_large', o.media_o.replace('i-cf.pximg.net', config.pixiv.pximgproxy)), default_extra)
                                    }
                                })
                            } else {
                                await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                            }
                        }
                    })
                })
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
                        caption: mg[0].caption.replaceAll('%mid%', ''),
                        ...k_os(d.id, ctx.flag)
                    }
                    if (d.type <= 1) {
                        if (mg.length === 1) {
                            let photo_urls = [mg[0].media_o, `dl-${mg[0].media_o}`, mg[0].media_r, `dl-${mg[0].media_r}`]
                            // Telegram will download and send the file. 5 MB max size for photos
                            // It's useless to provide original (Telegram will compress image about 200kb)
                            if (mg.fsize > 5000000) {
                                photo_urls = [mg[0].media_r, `dl-${mg[0].media_r}`]
                            }
                            await sendPhotoWithRetry(chat_id, ctx.l, photo_urls, extra)
                        } else {
                            temp_data.mg = [...temp_data.mg, ...mg_albumize(mg)]
                        }
                    } else if (d.type == 2) {
                        bot.telegram.sendChatAction(chat_id, 'upload_video')
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
                            if (catchily(e, chat_id, ctx.l)) {
                                bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                            }
                        })
                    }
                }
            }
        })
        // eslint-disable-next-line no-empty
        if (ctx.flag.asfile) {
        } else if (ctx.flag.telegraph) {
            try {
                bot.telegram.sendChatAction(chat_id, 'typing')
                let res_data = await mg2telegraph(temp_data.mg, ctx.flag.telegraph_title, user_id, ctx.flag.telegraph_author_name, ctx.flag.telegraph_author_url)
                if (res_data) {
                    await asyncForEach(res_data, async (d) => {
                        await bot.telegram.sendMessage(chat_id, d.ids.join('\n') + '\n' + d.telegraph_url)
                    })
                    await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'telegraph_iv'), default_extra)
                }
            } catch (error) {
                console.warn(error)
            }
        } else {
            if (ctx.flag.album) {
                temp_data.mg = mg_albumize(temp_data.mg, ctx.flag.single_caption)
            }
            if (temp_data.mg.length > 0) {
                let extra = default_extra
                await asyncForEach(temp_data.mg, async (mg, i) => {
                    let data = await sendMediaGroupWithRetry(chat_id, ctx.l, mg, extra)
                    extra.reply_to_message_id = data[0].message_id
                    // Too Many Requests: retry after 10
                    if (i > 4) {
                        await sleep(3000)
                    } else {
                        await sleep(1000)
                    }
                })
            }
        }
    }

    if (ids.novel.length > 0) {
        await asyncForEach(ids.novel, async id => {
            bot.telegram.sendChatAction(chat_id, 'typing')
            let d = await handle_novel(id)
            if (d) {
                await bot.telegram.sendMessage(chat_id, `${d.telegraph_url}`)
            } else {
                await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'illust_404'), default_extra)
            }
        })
    }

    if (rtext.includes('fanbox.cc/') && chat_id > 0) {
        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'fanbox_not_support'), default_extra)
    }
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
            if (d.type == 2 && d.inline.length === 0) {
                // pre convert (without await)
                ugoira_to_mp4(d.id)
                await ctx.answerInlineQuery([], {
                    switch_pm_text: _l(ctx.l, 'pm_to_generate_ugoira'),
                    switch_pm_parameter: ids.illust.join('-_-').toString(),
                    cache_time: 0
                }).catch(async e => {
                    catchily(e, chat_id, ctx.l)
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
        catchily(e, chat_id, ctx.l)
    })
})
bot.catch(async (e) => {
    bot.telegram.sendMessage(config.tg.master_id, e)
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
    if (config.web.enabled && !process.env.WEBLESS) {
        // simple runner?
        require('./web')
    }
})
/**
 * catch error report && reply
 * @param {*} e error
 * @param {*} ctx ctx
 */
function catchily(e, chat_id, language_code = 'en') {
    honsole.error(e)
    bot.telegram.sendMessage(config.tg.master_id, e)
    if (e.response) {
        if (e.response.description.includes('MEDIA_CAPTION_TOO_LONG')) {
            bot.telegram.sendMessage(chat_id, _l(language_code, 'error_text_too_long'))
            return false
        } else if (e.response.description.includes('Forbidden:')) {
            return false
        } else if (e.response.description.includes('can\'t parse entities: Character')) {
            bot.telegram.sendMessage(chat_id, _l(language_code, 'error_format', e.response.description), {
                parse_mode: 'MarkdownV2'
            })
            return false
        }
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
async function sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type = ['o', 'r', 'dlo', 'dlr']) {
    if (mg_type.length === 0) {
        honsole.warn('error send mg', chat_id, mg)
    }
    try {
        bot.telegram.sendChatAction(chat_id, 'upload_photo')
        let data = await bot.telegram.sendMediaGroup(chat_id, await mg_filter([...mg], mg_type.shift()), extra)
        return data
    } catch (e) {
        if (catchily(e, chat_id, language_code)) {
            return await sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type)
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
async function sendPhotoWithRetry(chat_id, language_code, photo_urls, extra) {
    if (photo_urls.length === 0) {
        honsole.warn('error send photo', chat_id, photo_urls)
        return
    }
    let photo_url = photo_urls.shift()
    try {
        bot.telegram.sendChatAction(chat_id, 'upload_photo')
        if (photo_url.substr(0, 3) == 'dl-') {
            photo_url = await download_file(photo_url.substr(2))
        }
        let data = await bot.telegram.sendPhoto(chat_id, photo_url, extra)
        return data
    } catch (e) {
        if (catchily(e, chat_id, language_code)) {
            return await sendPhotoWithRetry(chat_id, language_code, photo_urls, extra)
        }
    }
}
module.exports = {
    sendMediaGroupWithRetry,
    sendPhotoWithRetry,
    catchily
}