import { Bot } from 'grammy'
import config from './config.js'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import { autoRetry } from '@grammyjs/auto-retry'
// import http from 'http'
export const tgBot = new Bot(config.tg.token, {
    // client: {
    //     apiRoot: 'http://127.0.0.1:8081'
    // }
})

const throttler = apiThrottler()
tgBot.api.config.use(throttler)
tgBot.api.config.use(autoRetry())
tgBot.on('channel_post', (ctx, next) => {
    ctx.update.message = ctx.update.channel_post
    next()
})