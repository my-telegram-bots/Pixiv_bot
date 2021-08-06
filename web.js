const http = require('http')
const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const Router = require('koa-router')
const app = new Koa()
let config = require('./config.json')
const { db_initial } = require('./db')
const { get_pixiv_ids, ugoira_to_mp4, asyncForEach, honsole } = require('./handlers')
const { get_illust } = require('./handlers/pixiv/illust')
const router = new Router()
app.use(bodyParser())
// cors
app.use(async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*')
    ctx.set('Access-Control-Allow-Headers', 'origin, content-type, accept')
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    ctx.set('Access-Control-Max-Age', 1728000)
    if (ctx.method === 'OPTIONS') {
        ctx.body = '1'
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
        honsole.dev('web_get_illusts', ids)
        body.data = []
        await asyncForEach(ids, async (id) => {
            let data = await get_illust(id)
            delete data.tg_file_id
            if (data.type == 2) {
                await ugoira_to_mp4(id)
                body.ids.push(data.id)
                data.url = `${config.pixiv.ugoiraurl}/${id}.mp4`
                body.data.push(data)
            }
        })
        body.ok = true
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