const http = require('http')
const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const Router = require('koa-router')
const app = new Koa()
const config = require('./config.json')
const { db_initial } = require('./db')
const { get_pixiv_ids, ugoira_to_mp4, ugoira_to_gif, asyncForEach, honsole } = require('./handlers')
const { get_illust } = require('./handlers/pixiv/illust')
const router = new Router()

app.use(bodyParser())
// cors
app.use(async (ctx, next) => {
    let referer = new URL(ctx.header.referer || "https://ugoira.huggy.moe")
    if (['ugoira.eu.org', 'ugoira.huggy.moe', 'localhost', '127.0.0.1',].includes(referer.hostname) || (referer.hostname === 'huggy.moe' || referer.hostname.substr(-10) === '.huggy.moe')) {
        ctx.set('Access-Control-Allow-Origin', `${referer.protocol}//${referer.host}`)
        ctx.set('Access-Control-Allow-Headers', 'origin, content-type, accept')
        ctx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        ctx.set('Access-Control-Max-Age', 1728000)
    } // else {
    //     ctx.body = {
    //         ok: false
    //     }
    //     return
    // }
    if (ctx.method === 'OPTIONS') {
        ctx.body = 'ok'
        return
    } else {
        await next()
    }
})
// need recaptcha / hcaptcha
// there no csrf token need I think
router.post('/api/illusts', async (ctx) => {
    let body = {
        ok: true
    }
    let ids = get_pixiv_ids(ctx.request.body.id).illust
    body.ids = []
    if (ids.length > 0) {
        ids = ids.filter((v, i, s) => {
            return s.indexOf(v) === i
        })
        honsole.log('web_get_illusts', ids)
        body.data = []
        await asyncForEach(ids, async (id) => {
            let data = await get_illust(id)
            delete data.tg_file_id
            if (data.type == 2) {
                // single thread
                await ugoira_to_mp4(id)
                // pre handle mp4 to gif
                ugoira_to_gif(id, 'large')
                ugoira_to_gif(id, 'medium')
                ugoira_to_gif(id, 'small')
                body.ids.push(data.id)
                data.url = `${config.pixiv.ugoiraurl}/${id}.mp4`
                body.data.push(data)
            }
        })
        body.ok = true
    }
    ctx.body = body
})

router.get('/api/gif/:id/:quality', async (ctx) => {
    let body = {
        ok: false
    }
    let data = await get_illust(ctx.params.id)
    if (data) {
        let url = await ugoira_to_gif(data.id, ctx.params.quality, data.imgs_.size[0].width, data.imgs_.size[0].height)
        body = {
            ok: true
        }
        ctx.redirect(url)
    }
    ctx.body = body
})

router.get('/api/mp4/:id', async (ctx) => {
    let body = {
        ok: false
    }
    let data = await get_illust(ctx.params.id)
    if (data) {
        let url = await ugoira_to_mp4(data.id)
        body = {
            ok: true
        }
        ctx.redirect(url)
    }
    ctx.body = body
})
app.use(router.routes()).use(router.allowedMethods())
if (process.argv[1].includes('web.js')) {
    db_initial().then(() => {
        http.createServer(app.callback()).listen(config.web.port, config.web.host)
    })
} else {
    http.createServer(app.callback()).listen(config.web.port, config.web.host)
}
console.log(new Date(), 'web started!')