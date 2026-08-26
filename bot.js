import { Bot } from 'grammy'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import { autoRetry } from '@grammyjs/auto-retry'
import {
    createTelegramAttemptTraceTransformer,
    createTelegramQueueTraceTransformer
} from '#handlers/telegram/delivery-telemetry'
import {
    TELEGRAM_AUTO_RETRY_OPTIONS,
    TELEGRAM_CLIENT_TIMEOUT_SECONDS,
    TELEGRAM_THROTTLER_OPTIONS
} from '#handlers/telegram/transport-policy'

let botInstance = null
const nonDeliveryMethods = new Set(['sendChatAction', 'setMessageReaction'])

export function createDeliveryThrottler(options) {
    const throttler = apiThrottler(options)
    return (previous, method, payload, signal) => nonDeliveryMethods.has(method)
        ? previous(method, payload, signal)
        : throttler(previous, method, payload, signal)
}

/**
 * Create and configure Telegram bot with given configuration
 */
export function createBot(config) {
    if (!config.tg || !config.tg.token) {
        throw new Error('Telegram bot token is required')
    }

    const botConfig = {
        client: {
            timeoutSeconds: TELEGRAM_CLIENT_TIMEOUT_SECONDS,
            ...(process.env.TELEGRAM_API_SERVER
                ? { apiRoot: process.env.TELEGRAM_API_SERVER }
                : {})
        }
    }

    const bot = new Bot(config.tg.token, botConfig)

    // Trace only actual request stages; payloads and media URLs are never logged.
    bot.api.config.use(createTelegramAttemptTraceTransformer())

    // Configure API throttling and finite automatic retries.
    const throttler = createDeliveryThrottler(TELEGRAM_THROTTLER_OPTIONS)
    bot.api.config.use(throttler)
    bot.api.config.use(autoRetry(TELEGRAM_AUTO_RETRY_OPTIONS))
    bot.api.config.use(createTelegramQueueTraceTransformer())

    // Handle channel posts
    bot.on('channel_post', (ctx, next) => {
        ctx.update.message = ctx.update.channel_post
        next()
    })

    botInstance = bot
    return bot
}

/**
 * Get bot instance (must call createBot first)
 */
export function getBot() {
    if (!botInstance) {
        throw new Error('Bot not initialized. Call createBot first.')
    }
    return botInstance
}
