// import { Telegraf } from 'telegraf'
import { Bot } from 'grammy'
import config from './config.js'
import { apiThrottler } from '@grammyjs/transformer-throttler'
// import http from 'http'
export const tgBot = new Bot(config.tg.token, {
    client: {
        // apiRoot: 
    }
})

const throttler = apiThrottler()
tgBot.api.config.use(throttler)