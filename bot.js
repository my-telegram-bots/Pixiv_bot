import { Bot } from 'grammy'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import { autoRetry } from '@grammyjs/auto-retry'

/**
 * Create and configure Telegram bot with given configuration
 */
export function createBot(config) {
    if (!config.tg || !config.tg.token) {
        throw new Error('Telegram bot token is required')
    }
    
    const botConfig = {
        // Only add client config if needed
        ...(process.env.TELEGRAM_API_SERVER ? {
            client: {
                apiRoot: process.env.TELEGRAM_API_SERVER
            }
        } : {})
    }
    
    const bot = new Bot(config.tg.token, botConfig)
    
    // Configure API throttling and auto-retry
    const throttler = apiThrottler()
    bot.api.config.use(throttler)
    bot.api.config.use(autoRetry())
    
    // Handle channel posts
    bot.on('channel_post', (ctx, next) => {
        ctx.update.message = ctx.update.channel_post
        next()
    })
    
    return bot
}