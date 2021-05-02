const fs = require('fs')
const { Telegraf, Markup } = require('telegraf')
const { telegrafThrottler } = require('telegraf-throttler')
const exec = require('util').promisify((require('child_process')).exec)
let config = require('./config.json')
const {
    asyncForEach,
    format,
    handle_illust,
    get_illust_ids,
    ugoira_to_mp4,
    handle_ranking,
    download_file,
    _l,
    k_os,
    mg_create,mg_albumize,
    mg2telegraph

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
    onThrottlerError: (error) =>{
        console.warn(error)
        return true
    }
})
const bot = new Telegraf(config.tg.token)
bot.use(throttler)
bot.use(async (ctx, next) => {
    // 本来是 .lang 的 后面简单点还是 .l
    // 然后在想 这边直接 ctx.l = l[ctx.from.language_code] 好还是按需好
    // 语言库里面没有的 会 fallback 到 en
    // 随便写的 以后可能要改（可能会遇到复杂的 i18n）
    ctx.l =  (!ctx.from || !ctx.from.language_code) ? 'en' : ctx.from.language_code
    try {
        let text = ''
        if(ctx.message && ctx.message.text)
            text = ctx.message.text
        if(ctx.inlineQuery && ctx.inlineQuery.query)
            text = ctx.inlineQuery.query
        // remove command[@username] : /start@pixiv_bot -> /start
        ctx.rtext = text.replaceAll('@' + ctx.botInfo.username,'')
    } catch (error) {
        ctx.rtext = ''
    }

    // db
    ctx.db = ctx.flag = {}
    ctx.db.s_col = await db.collection('chat_setting')
    if(!ctx.flag.setting && ctx.from && ctx.from.id){
        ctx.flag.setting = await ctx.db.s_col.findOne({
            id: ctx.from.id
        })
    }
    if(!ctx.flag.setting){
        // default user setting
        ctx.flag.setting = {
            format: {
                message: false,
                inline: false
            },
            dbless: true, // the user isn't in chat_setting
            status: false // user's current status
        }
    } else {
        ctx.flag.setting.dbless = false
    }
    if(ctx.rtext.substr(0,3) == 'eyJ'){ // JSON base64('{"xx') = EyJ
        try {
            let new_setting = JSON.parse(Buffer.from(ctx.rtext,'base64').toString('utf8'))
            await db.update_setting({
                format: {
                    message: new_setting.format.message,
                    inline: new_setting.format.inline
                }
            },ctx.from.id,ctx.flag)
            await ctx.reply(_l(ctx.l,'setting_saved'))
        } catch (error) {
            await ctx.reply(_l(ctx.l,'error'))
            console.warn(error)
        }
        return
    }
    next()
})
bot.command('s',async (ctx,next)=>{
    // only support user
    if(ctx.chat.id > 0){
        // lazy....
        if(ctx.flag.setting.dbles){
            ctx.flag.setting = {"format":{"message":"%NSFW|#NSFW %[%title%](%url%)% / [%author_name%](%author_url%) %p%\n%tags%","inline":"%NSFW|#NSFW %[%title%](%url%)% / [%author_name%](%author_url%) %p%\n%tags%"}}
        }
        ctx.reply(_l(ctx.l,'setting_open_link'),{
            ...Markup.inlineKeyboard([
                Markup.button.url('Open', `https://pixiv-bot.pages.dev/${_l(ctx.l)}/s.html#${Buffer.from(JSON.stringify(ctx.flag.setting),'utf8').toString('base64')}`.replace('/en',''))
            ])
        })
    }
})
bot.use(async (ctx,next)=>{
    ctx.flag = {
        ...ctx.flag,
        tags: ctx.rtext.includes('+tag'),
        share: !ctx.rtext.includes('-share'),
        remove_keyboard: ctx.rtext.includes('-rmk'),
        remove_caption: ctx.rtext.includes('-rmc'),
        asfile: ctx.rtext.includes('+file'),
        album: ctx.rtext.includes('+album'),
        telegraph: ctx.rtext.includes('+graph') || ctx.rtext.includes('+telegraph'),
        c_show_id: !ctx.rtext.includes('-id'),
        q_id: 0 // telegraph albumized value
    }
    if(ctx.flag.telegraph){
        ctx.flag.album = true
        ctx.flag.tags = true
    }
    ctx.temp_data = {
        mediagroup_o: [],
        mediagroup_r: []
    }
    // replaced text
    ctx.rtext = ctx.rtext
    .replaceAll('+tags','').replaceAll('+tag','')
    .replaceAll('+telegraph','').replaceAll('+graph','')
    .replaceAll('+file','')
    .replaceAll('+album','')
    .replaceAll('-share','')
    .replaceAll('-rmc','')
    .replaceAll('-rmk','')
    .replaceAll('-id','')

    if(ctx.rtext.includes('-rm')){
        ctx.flag.remove_caption = ctx.flag.remove_keyboard = true
        ctx.rtext = ctx.rtext.replaceAll('-rm','')
    }
    await next()
})
bot.start(async (ctx,next) => {
    // startPayload = deeplink 
    if(ctx.startPayload){
        // callback to bot.on function
        await next()
    }else{
        // 回复垃圾文（（（
        await ctx.reply(_l(ctx.l,'start',ctx.message.message_id))
    }
})
bot.on('text',async (ctx,next)=>{
    if(ids = get_illust_ids(ctx.rtext)){
        await asyncForEach(ids,async id=>{
            let d = await handle_illust(id,ctx.flag)
            if(!d && typeof d == 'number'){
                // chat.id > 0 = user
                if(ctx.chat.id > 0)
                    await ctx.reply(_l(ctx.l,'illust_404'))
            }
            ctx.flag.q_id += 1
            if(d.type == 2 && !d.tg_file_id){
                ctx.replyWithChatAction('upload_video')
                await ugoira_to_mp4(d.id)
            }
            let mg = mg_create(d.td,ctx.flag)
            if(ctx.flag.album){
                ctx.temp_data.mediagroup_o = [...ctx.temp_data.mediagroup_o,...mg.mediagroup_o]
                ctx.temp_data.mediagroup_r = [...ctx.temp_data.mediagroup_r,...mg.mediagroup_r]
            }else if(ctx.flag.asfile){
                if(d.type <= 1){
                    await asyncForEach(d.td.original_urls, async (imgurl,id) => {
                        ctx.replyWithChatAction('upload_document')
                        // Post the file using multipart/form-data in the usual way that files are uploaded via the browser. 10 MB max size for photos, 50 MB for other files.
                        await ctx.replyWithDocument(imgurl,{
                            thumb: d.td.thumb_urls[id],
                            parse_mode: 'Markdown',
                            caption: format(d.td,ctx.flag,'message',id),
                        }).catch(async ()=>{
                            // Download to local and send (url upload only support 5MB)
                            ctx.replyWithChatAction('upload_document')
                            await ctx.replyWithDocument({source: await download_file(imgurl)},{
                                parse_mode: 'Markdown',
                                caption: format(d.td,ctx.flag,'message',id),
                            }).catch(async (e)=>{
                                // visit pximg.net with no referer will respond 403
                                await ctx.reply(_l(ctx.l,'file_too_large',imgurl.replace('i.pximg.net',config.pixiv.pximgproxy)))
                                console.warn(e)
                            })
                        })
                    })
                }
            }else{
                if(d.type <= 1){
                    if(mg.mediagroup_o.length == 1){
                        // mediagroup doesn't support inline keyboard.
                        ctx.replyWithChatAction('upload_photo')
                        let extra = {
                            parse_mode: 'Markdown',
                            caption: format(d.td,ctx.flag,'message',-1),
                            ...k_os(d.id,ctx.flag)
                        }
                        await ctx.replyWithPhoto(mg.mediagroup_o[0].media,extra).catch(async ()=>{
                            await ctx.replyWithPhoto(mg.mediagroup_r[0].media,extra)
                        })
                    }else{
                        ctx.temp_data.mediagroup_o = [...ctx.temp_data.mediagroup_o,...mg_albumize(mg.mediagroup_o)]
                        ctx.temp_data.mediagroup_r = [...ctx.temp_data.mediagroup_r,...mg_albumize(mg.mediagroup_r)]
                    }
                }else if(d.type == 2){
                    let media = d.td.tg_file_id
                    if(!media){
                        ctx.replyWithChatAction('upload_video')
                        media = {
                            source: `./tmp/mp4_1/${d.id}.mp4` 
                        }
                    }
                    let data = await ctx.replyWithAnimation(media, {
                        caption: format(d.td,ctx.flag,'message',-1),
                        parse_mode: 'Markdown',
                        ...k_os(d.id,ctx.flag)
                    })
                    // save ugoira file_id
                    if(!d.td.tg_file_id && data.document) {
                        let col = await db.collection('illust')
                        await col.updateOne({
                            id: d.id.toString(),
                        }, {
                            $set: {
                                tg_file_id: data.document.file_id
                            }
                        })
                    }
                }
            }
        })
        if(ctx.flag.telegraph){
            try {
                let res_data = await mg2telegraph(ctx.temp_data.mediagroup_o)
                if(res_data){
                    await asyncForEach(res_data,async (d)=>{
                        await ctx.reply(d.ids.join('\n') + '\n' + d.url)
                    })
                    await ctx.reply(_l(ctx.l,'telegraph_iv'))
                }
            } catch (error) {
                console.warn(error)
            }
        }else{
            if(ctx.flag.album){
                ctx.temp_data.mediagroup_o = mg_albumize(ctx.temp_data.mediagroup_o)
                ctx.temp_data.mediagroup_r = mg_albumize(ctx.temp_data.mediagroup_r)
            }
            if(ctx.temp_data.mediagroup_o.length > 0){
                await asyncForEach(ctx.temp_data.mediagroup_o, async (mediagroup_o,id) => {
                    ctx.replyWithChatAction('upload_photo')
                    await ctx.replyWithMediaGroup(mediagroup_o).catch(async () => {
                        ctx.replyWithChatAction('upload_photo')
                        await ctx.replyWithMediaGroup(ctx.temp_data.mediagroup_r[id])
                    })
                })
            }
        }
    }else{
        next()
    }
})
bot.on('inline_query',async (ctx)=>{
    let res = []
    let { offset } = ctx.inlineQuery
    if(!offset)
        offset = 0 // 这里 offset 空的话 就定义 = 0，因为下面还有分页模块 所以就不定义为1了
    let query = ctx.rtext
    // 目前暂定 offset 只是页数吧 这样就直接转了，以后有需求再改
    offset = parseInt(offset)
    let res_options = {
        cache_time: 60
    }
    if(ids = get_illust_ids(query)){
        await asyncForEach(ids.reverse(),async id=>{
            let d = await handle_illust(id,ctx.flag)
            // 动图目前还是要私聊机器人生成
            if(d.type == 2 && d.td.inline.length == 0){
                // 这个时候就偷偷开始处理了 所以不加 await
                ugoira_to_mp4(d.id)
                try {
                    await ctx.answerInlineQuery([], {
                        switch_pm_text: _l(ctx.l,'pm_to_generate_ugoira'),
                        switch_pm_parameter: ids.join('-_-').toString(), // 这里对应 get_illust_ids 的处理
                        cache_time: 0
                    })
                } catch (error) {
                    console.warn(error)
                }
                return true
            }
            res = d.td.inline.concat(res)
        })
        if(res.splice((offset + 1) * 20 - 1,20))
            res_options.next_offset = offset + 1
        res = res.splice(offset * 20,20)
    }else if(query.replace(/ /g,'') == ''){
        let data = await handle_ranking([offset],ctx.flag)
        res = data.data
        if(data.next_offset)
            res_options.next_offset = data.next_offset
    }
    try {
        await ctx.answerInlineQuery(res,res_options)
    } catch (error) {
        console.warn(error)
    }
})
bot.catch(async (error,ctx)=>{
    ctx.telegram.sendMessage(config.tg.master_id,'error' + error)
    console.error('error!',error)
})
bot.launch().then(async () => {
    if(!process.env.DEPENDIONLESS && !process.env.dev){
        try {
            await exec('which ffmpeg')
            await exec('which mp4fpsmod')
        } catch (error) {
            console.error('You must install ffmpeg and mp4fpsmod to enable ugoira to mp4 function',error)
            console.error('If you want to run but won\'t install ffmpeg and mp4fpsmod, please exec following command:')
            console.error('DEPENDIONLESS=1 node app.js')
            process.exit()
        }
    }
    console.log(new Date(),'started!')
}).catch(e=>{
    console.error('offline or bad bot token')
    process.exit()
})