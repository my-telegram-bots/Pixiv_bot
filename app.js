const fs = require('fs')
const { Telegraf } = require('telegraf')
const { telegrafThrottler } = require('telegraf-throttler')
const exec = require('util').promisify((require('child_process')).exec)
let config = require('./config.json')
const { handle_illust, get_illust_ids, ugoira_to_mp4, asyncForEach, handle_ranking, download_file, k_os, k_setting_index, _l} = require('./handlers')
const db = require('./db')
const { format } = require('./handlers/telegram/format')
const { mg_create, mg_albumize } = require('./handlers/telegram/mediagroup')
const { mg2telegraph } = require('./handlers/telegram/telegraph')
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
        ctx.rtext = text.replaceAll('@' + ctx.botInfo.username,'')
    } catch (error) {
        
    }
    await next()
})
bot.start(async (ctx,next) => {
    // 这里的 startPayload 参考 tg api 文档的 deeplink 
    if(ctx.startPayload){
        // callback 到下面处理，这里不再处理
        next()
    }else{
        // 回复垃圾文（（（
        ctx.reply(_l(ctx.l,'start',ctx.message.message_id))
    }
})
bot.command('setting',async (ctx,next)=>{
    ctx.reply('Choose one item you want to set',{
        reply_to_message_id: ctx.message.message_id,
        ...k_setting_index()
    })
})
bot.command('format',async (ctx,next)=>{
    console.log(ctx.rtext)
    let rmtext = ctx.rtext.replace('/format','').replace('message','').replace('inline','')
    console.log(rmtext)
    if(rmtext == ''){
        if(ctx.chat.id < 0){
            // 群组的先不做
        }
        ctx.reply('choose you want edit yourself',{
            reply_to_message_id: ctx.message.message_id,
            reply_markup: {
                one_time_keyboard: true,
                selective: true,
                resize_keyboard: true,
                keyboard: [
                    ['message', 'inline (share)'],
                    ['all']
                ]
            }
        })
    }
    if(ctx.rtext){
        if(ctx.message.text.includes('message')){

        }
    }

})
bot.use(async (ctx,next)=>{
    ctx.flag = {
        tags: ctx.rtext.indexOf('+tag') > -1,
        share: ctx.rtext.indexOf('-share') == -1,
        remove_keyboard: ctx.rtext.indexOf('-rm') > -1,
        asfile: ctx.rtext.indexOf('+file') > -1,
        album: ctx.rtext.indexOf('+album') > -1,
        telegraph: ctx.rtext.indexOf('+graph') > -1 || ctx.rtext.indexOf('+telegraph') > -1,
        c_show_id: ctx.rtext.indexOf('-id') == -1,
        q_id: 0 // 总查询id 目前用来标记 telegraph
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
    ctx.rtext = ctx.rtext.replaceAll('+tags','').replaceAll('+tag','')
    .replaceAll('+file','')
    .replaceAll('+telegraph','').replaceAll('+graph','')
    .replaceAll('+album','')
    .replaceAll('-share','')
    .replaceAll('-rm','')
    .replaceAll('-rm','')
    next()
})
bot.on('text',async (ctx,next)=>{
    if(ids = get_illust_ids(ctx.rtext)){
        await asyncForEach(ids,async id=>{
            let d = await handle_illust(id,ctx.flag)
            if(!d && typeof d == 'number'){
                // 群组就不返回找不到 id 的提示了
                if(ctx.chat.id > 0)
                    await ctx.reply(_l(ctx.l,'illust_404'))
                return false
            }
            ctx.flag.q_id += 1
            let mg = mg_create(d.td,ctx.flag)
            if(d.type <= 1){ // 0 1 -> illust manga
                if(ctx.flag.asfile && !ctx.flag.telegraph){
                    await asyncForEach(d.td.original_urls, async (imgurl,id) => {
                        ctx.replyWithChatAction('upload_document')
                        // Post the file using multipart/form-data in the usual way that files are uploaded via the browser. 10 MB max size for photos, 50 MB for other files.
                        await ctx.replyWithDocument(imgurl,{
                            thumb: d.td.thumb_urls[id],
                            parse_mode: 'Markdown',
                            caption: format(d.td,ctx.flag,'message',id),
                        }).catch(async ()=>{
                            ctx.replyWithChatAction('upload_document')
                            await ctx.replyWithDocument({source: await download_file(imgurl)},{
                                parse_mode: 'Markdown',
                                caption: format(d.td,ctx.flag,'message',id),
                            }).catch(async (e)=>{
                                await ctx.reply(_l(ctx.l,'file_too_large',imgurl.replace('i.pximg.net',config.pixiv.pximgproxy)))
                                console.warn(e)
                            })
                        })
                    })
                    return
                }
                if(!ctx.flag.album){
                    if(mg.mediagroup_o.length == 1){
                        // 这里发单图 sendphoto 才有按钮（（
                        ctx.replyWithChatAction('upload_photo')
                        let extra = {
                            parse_mode: 'Markdown',
                            caption: format(d.td,ctx.flag,'inline',-1), // 默认 inline 相比 message 少了 url 所以这里偷懒直接用 inline 的模板
                            ...k_os(d.id,ctx.flag)
                        }
                        await ctx.replyWithPhoto(mg.mediagroup_o[0].media,extra).catch(async ()=>{
                            await ctx.replyWithPhoto(mg.mediagroup_r[0].media,extra)
                        })
                    }else{
                        ctx.temp_data.mediagroup_o = [...ctx.temp_data.mediagroup_o,...mg_albumize(mg.mediagroup_o)]
                        ctx.temp_data.mediagroup_r = [...ctx.temp_data.mediagroup_r,...mg_albumize(mg.mediagroup_r)]
                    }
                }else{
                    ctx.temp_data.mediagroup_o = [...ctx.temp_data.mediagroup_o,...mg.mediagroup_o]
                    ctx.temp_data.mediagroup_r = [...ctx.temp_data.mediagroup_r,...mg.mediagroup_r]
                }
            }else if(d.type == 2){ // 2 = ugoira
                if(ctx.flag.telegraph){
                    ctx.reply(_l(ctx.l,'telegraph_ugoira'))
                }else{
                    ctx.replyWithChatAction('upload_video')
                    let media = d.td.tg_file_id
                    if(!media){
                        media = {
                            source: await ugoira_to_mp4(d.id)
                        }
                    }
                    let data = await ctx.replyWithAnimation(media, {
                        caption: format(td,ctx.flag,'message',-1),
                        ...k_os(d.id,ctx.flag)
                    })
                    // 保存动图的 tg file id
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
                        ctx.reply(d.ids.join('\n') + d.url)
                    })
                    await ctx.reply(_l(ctx.l,'telegraph_iv'))
                }
            } catch (error) {
                
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
            if(d.type == 2 && !d.td.tg_file_id){
                // 这个时候就偷偷开始处理了 所以不加 await
                ugoira_to_mp4(d.id)
                await ctx.answerInlineQuery([], {
                    switch_pm_text: _l(ctx.l,'pm_to_generate_ugoira'),
                    switch_pm_parameter: ids.join('-_-').toString(), // 这里对应 get_illust_ids 的处理
                    cache_time: 0
                })
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
    await ctx.answerInlineQuery(res,res_options)
})
bot.catch(async (error,ctx)=>{
    ctx.telegram.sendMessage(config.tg.master_id,'error' + error)
    console.error('error!',error)
})
bot.launch().then(async () => {
    if(!process.env.DEPENDIONLESS){
        try {
            await exec('which ffmpeg')
            await exec('which mp4fpsmod')
        } catch (error) {
            console.error('You must install ffmpeg and mp4fpsmod to enable ugoira to mp4 function',error)
            console.error('If you want to run but and won\'t install ffmpeg and mp4fpsmod, please exec following command:')
            console.error('DEPENDIONLESS=1 node app.js')
            process.exit()
        }
    }
    console.log(new Date(),'started!')
}).catch(e=>{
    console.error('offline or bad bot token')
    process.exit()
})