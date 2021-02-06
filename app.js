const fs = require('fs')
const { Telegraf, Markup } = require('telegraf')
const { telegrafThrottler } = require('telegraf-throttler')
const { MongoClient } = require("mongodb")
const { default: axios } = require('axios')
const exec = require('util').promisify((require('child_process')).exec)
let config = require('./config.json')
const throttler = telegrafThrottler({
    // example https://github.com/KnightNiwrem/telegraf-throttler
    out:{
        minTime: 25,
        reservoir: 3,
        reservoirRefreshAmount: 3,
        reservoirRefreshInterval: 10000,
    },
})
let db = {}
let r_p = axios.create({
    baseURL: 'https://www.pixiv.net/ajax/',
    headers: {
        'User-Agent': config.pixiv.ua,
        'Cookie': config.pixiv.cookie
    }
})

// mc 简写了下 MongoDB CLient
const mc = new MongoClient(config.mongodb.uri,{
    useUnifiedTopology: true
})
const bot = new Telegraf(config.tg.token)

// 引入 i18n
const l = {}
load_i18n()

bot.use(throttler)
bot.use(async (ctx, next) => {
    // 本来是 .lang 的 后面简单点还是 .l
    // 然后在想 这边直接 ctx.l = l[ctx.from.language_code] 好还是按需好
    // 语言库里面没有的 会 fallback 到 en
    // 随便写的
    if(!ctx.from || ctx.from.language_code)
        ctx.l = 'en'
    else
        ctx.l = (ctx.from.language_code && l[ctx.from.language_code]) ? ctx.from.language_code : 'en'
    await next()
})
bot.start(async (ctx,next) => {
    if(ctx.startPayload){
        // callback 到下面处理，这里不再处理
        next()
    }else{
        // 回复垃圾文（（（
        ctx.reply(l[ctx.l].start)
    }
})
bot.command('reload_lang',async (ctx)=>{
    try {
        reload_lang()
        ctx.reply(l[ctx.l].reload_lang)
    } catch (error) {
        ctx.reply(l[ctx.l].reload_lang)
    }
})
bot.on('text',async (ctx)=>{
    if(ids = get_illust_ids(ctx.message.text)){
        asyncForEach(ids,async id=>{
            let d = await get_illust(id,ctx.message.text.indexOf('+tag') > -1)
            if(d.type <= 1){
                // 大图发不了就发小的
                await asyncForEach(d.td.mediagroup_o, async (mediagroup_o,id) => {
                    ctx.replyWithChatAction('upload_photo')
                    await ctx.replyWithMediaGroup(mediagroup_o).catch(async () => {
                        await ctx.replyWithMediaGroup(d.td.mediagroup_r[id])
                    })
                })
            }else if(d.type == 2){
                // ugoira 動いら
                ctx.replyWithChatAction('upload_video')
                let media = d.td.tg_file_id
                if(!media){
                    media = {
                        source: await ugoira_to_mp4(d.id)
                    }
                }
                let data = await ctx.replyWithAnimation(media, {
                    caption: d.title,
                    ...Markup.inlineKeyboard([[
                        Markup.button.url('open', 'https://www.pixiv.net/artworks/' + d.id),
                        Markup.button.switchToChat('share', 'https://pixiv.net/i/' + d.id)
                    ]])
                })
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
        })
    }
})
bot.on('inline_query',async (ctx)=>{
    let res = []
    if(ids = get_illust_ids(ctx.inlineQuery.query)){
        await asyncForEach(ids,async id=>{
            let d = await get_illust(id,ctx.inlineQuery.query.indexOf('+tag') > -1)
            if(d.type == 2 && !d.td.tg_file_id){
                // 这个时候就偷偷开始处理了 所以不加 await
                ugoira_to_mp4(d.id)
                let a = await ctx.answerInlineQuery([], {
                    switch_pm_text: l[ctx.l].pm_to_generate_ugoira,
                    switch_pm_parameter: ids.join('-_-').toString(), // 这里对应 get_illust_ids
                    cache_time: 0
                })
                return
            }
            res = d.td.inline.concat(res)
        })
    }
    await ctx.answerInlineQuery(res,{
        cache_time: 0
    })
})
bot.catch(async (error,ctx)=>{
    console.error('error',error)
})
// 先连数据库 再启动 bot
mc.connect().then(async m => {
    db = m.db(config.mongodb.dbname)
    bot.launch().then(async () => {
        console.log('started!')
    }).catch(e=>{
        console.error('offline or bad bot token')
        process.exit()
    })
}).catch(()=>{
    console.error('db connect error')
    process.exit()
})


/**
 * 获取 illust
 * 会进行缓存 数据存 MongoDB 里面（暂时不考虑更新这种东西）
 * @param {number} id illust_id
 * @param {boolean} show_tags 是否输出tag
 * @param {boolean} show_inline_keyboard 是否输出键盘
 * @param {number} mode 模式
 */
async function get_illust(id,show_tags = false,show_inline_keyboard = false,mode = 0) {
    let col = await db.collection('illust')
    let illust = await col.findOne({
        illustId: id.toString()
    })
    console.log(id)
    // 如果数据库没有缓存结果，那么就向 pixiv api 查询
    if(!illust) {
        try {
            illust = (await r_p.get('illust/' + id)).data
            // 应该是没有检索到 直接返回 false 得了
            if(illust.error)
                return false
            illust = illust.body
        } catch (error) {
            // 一般是网路 还有登录问题
            console.error(error)
        }
        // 删除我觉得不需要的 data
        delete illust.zoneConfig,
        delete illust.extraData
        delete illust.userIllusts
        delete illust.noLoginData
        delete illust.fanboxPromotion
        illust.id = illust.illustId
        // 插裤
        col.insertOne(illust)
    }
    // 接下来是处理成 tg 要的格式（图片之类的）
    let td = {
        tags: []
    }
    asyncForEach(illust.tags.tags, tag => {
        td.tags.push(tag.tag)
    })
    if(illust.illustType <= 1){
        // for (let i = 0; i < illust.pageCount; i++) {
        //     // 通过观察url规律 图片链接只是 p0 -> p1 这样的
        //     // 不过没有 weight 和 height 放弃了
        //     td.thumb_urls.push(illust.urls.thumb.replace('p0', 'p' + i))
        //     td.regular_urls.push(illust.urls.regular.replace('p0', 'p' + i))
        //     td.original_urls.push(illust.urls.original.replace('p0', 'p' + i))
        // }
        if(illust.pageCount == 1) {
            td = {
                thumb_urls: [illust.urls.thumb],
                regular_urls: [illust.urls.regular],
                original_urls: [illust.urls.original],
                size: [{
                    width: illust.width,
                    height: illust.height
                }],
                tags: td.tags
            }
        } else if(illust.pageCount > 1) {
            // 多p处理
            try {
                td = {
                    thumb_urls: [],
                    regular_urls: [],
                    original_urls: [],
                    size: [],
                    tags: td.tags
                }
                let pages = (await r_p('illust/' + id + '/pages')).data.body
                // 应该不会有 error 就不 return 了
                pages.forEach(p => {
                    td.thumb_urls.push(p.urls.thumb_mini)
                    td.regular_urls.push(p.urls.regular)
                    td.original_urls.push(p.urls.original)
                    td.size.push({
                        width: p.width,
                        height: p.height
                    })
                })
            } catch (error) {
                console.error(error)
            }
        }
        td = td
        td.mediagroup_o = []
        td.mediagroup_r = []
        td.inline = []
        await asyncForEach(td.size, (size, pid) => {
            caption = illust.title + (td.original_urls.length > 1 ? (' #' + (pid + 1).toString()) : '')
            if(show_tags)
                caption += '\n' + td.tags.map(tag => {
                    return '#' + tag + ' '
                })
            // 10个一组 mediagroup
            let gid = Math.floor(pid / 10)
            if(!td.mediagroup_o[gid]) {
                td.mediagroup_o[gid] = []
                td.mediagroup_r[gid] = []
            }
            td.mediagroup_o[gid][pid % 10] = {
                type: 'photo',
                media: td.original_urls[pid].replace('https://i.pximg.net/', 'https://i-cf.pximg.net/'),
                caption: caption,
                type: 'photo'
            }
            td.mediagroup_r[gid][pid % 10] = {
                type: 'photo',
                media: td.regular_urls[pid].replace('https://i.pximg.net/', 'https://i-cf.pximg.net/'),
                caption: caption,
            }
            td.inline[pid] = {
                type: 'photo',
                id: 'p_' + illust.id + '-' + pid,
                // 图片 size 太大基本发不出去了 用小图凑合
                photo_url: (size.width > 2000 || size.height > 2000) ? td.regular_urls[pid] : td.original_urls[pid],
                thumb_url: td.thumb_urls[pid],
                caption: caption,
                photo_width: size.width,
                photo_height: size.height,
                ...Markup.inlineKeyboard([[
                    Markup.button.url('open', 'https://www.pixiv.net/artworks/' + illust.id),
                    Markup.button.switchToChat('share', 'https://pixiv.net/i/' + illust.id)
                ]])
            }
        })
    }else if(illust.illustType == 2){
        // inline 只有在现存动图的情况下有意义
        if(illust.tg_file_id){
            td = {
                size: [{
                    width: illust.width,
                    height: illust.height
                }],
                inline: [],
                tags: td.tags
            }
            let caption = illust.title
            if (show_tags)
                caption += '\n' + td.tags.map(tag => {
                    return '#' + tag + ' '
                })
            td.tg_file_id = illust.tg_file_id
            td.inline[0] = {
                type: 'mpeg4_gif',
                id: 'p' + illust.id,
                mpeg4_file_id: illust.tg_file_id,
                caption: caption,
                ...Markup.inlineKeyboard([[
                    Markup.button.url('open', 'https://www.pixiv.net/artworks/' + illust.id),
                    Markup.button.switchToChat('share', 'https://pixiv.net/i/' + illust.id)
                ]])
            }
        }
    }
    return {
        id: id,
        title: illust.title,
        type: illust.illustType,
        td: td
    }
}
/**
 * 从文本消息里面获取可能有的 Pixiv illust_id 们
 * @param {*} text 文本
 */
function get_illust_ids(text) {
    if(!text)
        return false
    let ids = []
    // 首先以换行来分割
    // A-Z, a-z, 0-9, _ and - are allowed. We recommend using base64url to encode parameters with binary and other types of content.
    text.replace(/-_-/ig, ' ').replace(/  /ig, ' ').replace(/\+tags/ig, '').split('\n').forEach(ntext => {
        // 接着按照空格来分割
        ntext.split(' ').forEach(u => {
            try {
                // https://www.pixiv.net/member_illust.php?mode=medium&illust_id=87430599 
                // 老版
                if(u && !isNaN(parseInt(u.replace('#','').replace('id','')))){
                    // 匹配 #idxxxxxxx #xxxxxxx
                    ids.push(parseInt(u.replace('#', '').replace('id', '')))
                }else if(uu = new URL(u).searchParams.get('illust_id')) {
                    if(uu) {
                        ids.push(uu)
                    }
                }else{
                    // 参考链接
                    // https://www.pixiv.net/artworks/87466156
                    // http://www.pixiv.net/artworks/87466156
                    // https://pixiv.net/i/87466156
                    // 还有纯 id 也匹配了
                    let t = u.replace('https://', '').replace('http://', '').replace('www.','').replace('pixiv.net','').replace(/\//ig, '').replace('artworks','').replace('i','')
                    if(!isNaN(t) && t)
                        ids.push(t)
                }
            } catch (error) {
            }
        })
    })
    return ids
}

async function ugoira_to_mp4(id,force = false) {
    if (fs.existsSync(`./tmp/mp4_1/${id}.mp4`)) 
        return `./tmp/mp4_1/${id}.mp4`
    try {
        id = parseInt(id).toString()
        let ud = (await r_p(`/illust/${id}/ugoira_meta`)).data
        if (ud.error)
            return false
        ud = ud.body
        // 确定每一帧出现的时长
        let frame = '# timecode format v2\n0\n'
        let tempframe = 0
        ud.frames.forEach((f) => {
            tempframe += f.delay
            frame += (tempframe + "\n")
        }, this)
        fs.writeFileSync(`./tmp/timecode/${id}`, frame)
        // 下载
        await download_ugoira(id,ud.originalSrc)
        // Windows 自己补全这些软件并且自己改路径之类的 不做兼容
        // 解压没有现成好用的轮子
        // 所以干脆直接 exec 了 以后有好办法再改咯
        // force 为强制更新
        if (fs.existsSync(`./tmp/mp4_0/${id}.mp4`)){
            if (!force)
                fs.unlinkSync(`./tmp/mp4_0/${id}.mp4`)
            else
                return `./tmp/mp4_1/${id}.mp4`
        }
        if (fs.existsSync(`./tmp/mp4_1/${id}.mp4`)){
            if(!force)
                fs.unlinkSync(`./tmp/mp4_1/${id}.mp4`)
            else
                return `./tmp/mp4_1/${id}.mp4`
        }
        await exec(`unzip -n './tmp/zip/${id}.zip' -d './tmp/ugoira/${id}'`)
        // 处理开始！
        // 先用 ffmpeg 转成图片
        await exec(`ffmpeg -i ./tmp/ugoira/${id}/%6d.jpg -c:v libx264 -vf "format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2" ./tmp/mp4_0/${id}.mp4`, { timeout: 60 * 1000 })
        // 然后用 mp4fpsmod 添加时间轴
        await exec(`./mp4fpsmod -o ./tmp/mp4_1/${id}.mp4 -t ./tmp/timecode/${id} ./tmp/mp4_0/${id}.mp4`, { timeout: 60 * 1000 })
        return `./tmp/mp4_1/${id}.mp4`
    } catch (error) {
        console.error(error)
        return false
    }
}
function download_ugoira(id,url) {
    // s t r e a m 没 有 a s y n c
    return new Promise(async (resolve, reject) => {
        let d = (await axios.get(url, {
            responseType: 'stream',
            headers: {
                'User-Agent': config.pixiv.ua,
                'Referer': 'https://www.pixiv.net'
            }
        })).data
        let zipfile = fs.createWriteStream(`./tmp/zip/${id}.zip`)
        d.pipe(zipfile)
        zipfile.on('finish', resolve)
    })
}
/**
 * 从 ./lang 读取 i18n 文件们
 * 这样比较好动态读取 不用重启整个进程（（（
 */
function load_i18n(){
    fs.readdirSync('./lang').map(file_name => {
        l[file_name.replace('.json', '')] = JSON.parse(fs.readFileSync('./lang/' + file_name).toString())
    })
}
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }
}