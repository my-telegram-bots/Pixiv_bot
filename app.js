import { run as grammyjsRun } from '@grammyjs/runner'
import { loadAndValidateConfig, checkSystemDependencies } from '#handlers/utils/config-validator'
import db, { db_close, getPool } from '#db'
import { checkAndApplyMigrations } from './db-migration-check.js'

// Load and validate configuration at startup
let config
try {
    config = await loadAndValidateConfig()
    console.log('✓ Configuration loaded and validated successfully')
} catch (error) {
    console.error('✗ Configuration validation failed:', error.message)
    process.exit(1)
}
import { handle_ranking, _l, k_os, honsole, format, memoryMonitor } from '#handlers/index'
import { extractPixivIds } from '#handlers/telegram/input-parser'
import { createSettingsLifecycle } from '#handlers/telegram/settings-lifecycle'
import { createChatLinkStore } from '#handlers/telegram/chat-link-store'
import { createLinkLifecycle } from '#handlers/telegram/link-lifecycle'
import { detect_ugpira_url } from '#handlers/pixiv/tools'
import { createTgSender } from '#handlers/telegram/tg-sender'
import { catchily } from '#handlers/telegram/sender'
import { renderUserFacingError } from '#handlers/telegram/user-facing-error'
import {
    createInlineDeadline,
    createInlineQueryHandler,
    createInlineSettingsResolver
} from '#handlers/telegram/inline-query'
import {
    createGuestQueryHandler,
    createGuestSettingsResolver,
    formatGuestAdminReport,
    guestModeStartupMessage,
    registerGuestQueryHandler
} from '#handlers/telegram/guest-query'
import { createBot, getBot } from './bot.js'
import { FileCleaner } from '#handlers/utils/file-cleaner'
import illustService from '#handlers/pixiv/illust-service'
import { rankingScheduler } from '#handlers/pixiv/ranking-scheduler'
import { TELEGRAM_UPDATE_CONCURRENCY } from '#handlers/telegram/transport-policy'

// Create bot instance with validated configuration
createBot(config)
const bot = getBot()
const settingsLifecycle = createSettingsLifecycle({ bot, store: db, logger: honsole })
const { resolveUserSettings, handleSettingsCommand } = settingsLifecycle
const resolveInlineSettings = createInlineSettingsResolver({ resolveUserSettings, logger: honsole })
const tg_sender = createTgSender({ bot, config, resolveUserSettings, logger: honsole })
const linkStore = createChatLinkStore({ getPool })
const linkLifecycle = createLinkLifecycle({ bot, linkStore, tgSender: tg_sender, logger: honsole })
const inlineQueryHandler = createInlineQueryHandler({
    illustService,
    detectUgoiraUrl: detect_ugpira_url,
    handleRanking: handle_ranking,
    db,
    format,
    keyboard: k_os,
    localize: _l,
    logger: honsole,
    reportError: error => reportApplicationError(error, { method: 'inlineQuery' })
})
const resolveGuestSettings = createGuestSettingsResolver({
    getUserSettings: userId => process.env.DBLESS
        ? null
        : db.collection.chat_setting.findOne({ id: userId }),
    logger: honsole
})
const guestQueryHandler = createGuestQueryHandler({
    resolveGuestSettings,
    illustService,
    detectUgoiraUrl: detect_ugpira_url,
    format,
    keyboard: k_os,
    localize: _l,
    logger: honsole,
    reportError: fields => bot.api.sendMessage(
        config.tg.master_id,
        formatGuestAdminReport(fields)
    ).catch(() => { })
})
console.log('✓ Telegram bot instance created')

async function reportApplicationError(error, fields = {}) {
    await catchily(error, fields.chatId, fields.languageCode || 'en', {
        config,
        notifyUser: false,
        illustIds: fields.illustIds,
        illustId: fields.illustId,
        page: fields.page,
        method: fields.method || 'tgSender',
        errorCode: fields.errorCode
    })
}

// Initialize file cleaner for temporary files only
const fileCleaner = new FileCleaner({
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 2 * 1024 * 1024 * 1024, // 2GB
    cleanupInterval: 2 * 60 * 60 * 1000, // 2 hours
    directories: ['./tmp/file', './tmp/ugoira', './tmp/timecode'] // 仅临时文件，不清理 MP4
})
fileCleaner.start()
console.log('✓ File cleanup scheduler started (temp files only, MP4 files preserved)')

// step 0 initial some necessary variables
bot.use(async (ctx, next) => {
    if (ctx.inlineQuery) {
        ctx.inlineDeadline = createInlineDeadline(Date.now())
    }
    if (ctx.guestMessage) {
        ctx.guestDeadline = createInlineDeadline(Date.now())
    }
    // simple i18n
    ctx.l = (!ctx.from || !ctx.from.language_code) ? 'en' : ctx.from.language_code
    ctx.text = ''
    ctx.default_extra = {
        parse_mode: 'MarkdownV2'
    }
    if (!!ctx.message) {
        if (ctx.text = ctx.message.text || ctx.message.caption || '') {
            // remove command[@username] : /start@Pixiv_bot -> /start
            if (ctx.message.entities && ctx.text.startsWith('/')) {
                ctx.command = ctx.message.text.substring(1, ctx.message.entities[0].length)
                if (ctx.command.includes(`@${bot.botInfo.username}`)) {
                    ctx.command = ctx.command.replace(`@${bot.botInfo.username}`, '')
                    ctx.text = ctx.text.replace(`@${bot.botInfo.username}`, '')
                }
            }
        }
        ctx.default_extra.reply_to_message_id = ctx.message.message_id
        if (ctx.message.message_thread_id) {
            ctx.default_extra.message_thread_id = ctx.message.message_thread_id
        }
        ctx.default_extra.allow_sending_without_reply = true
        if (!!ctx.update.channel_post) {
            ctx.chat_id = ctx.channelPost.chat.id
            // channel post is anonymous
            ctx.user_id = 1087968824
        } else {
            ctx.chat_id = ctx.message.chat.id
            ctx.user_id = ctx.from.id
        }
    } else if (!!ctx.inlineQuery) {
        ctx.text = ctx.inlineQuery.query
        ctx.chat_id = ctx.inlineQuery.from.id
        ctx.user_id = ctx.inlineQuery.from.id
    } else if (!!ctx.callbackQuery) {
        ctx.chat_id = ctx.callbackQuery.message.chat.id
        ctx.user_id = ctx.callbackQuery.from.id
    }
    next()
})

// Guest messages must terminate here: grammY also includes them in :text/:caption.
registerGuestQueryHandler(bot, guestQueryHandler)

bot.command('start', async (ctx, next) => {
    // match = deeplink
    // see more https://core.telegram.org/bots#deep-linking
    if (!ctx.match.trim() || ctx.match === 's') {
        // reply start help command
        await bot.api.sendMessage(ctx.chat.id, _l(ctx.l, 'start'), {
            ...ctx.default_extra
        }).catch(e => {
            honsole.warn('Failed to send start message:', e.description || e.message)
        })
    } else {
        // callback to next bot.on handler
        return await next()
    }
})

bot.command('help', async (ctx) => {
    await bot.api.sendMessage(ctx.chat.id, 'https://pixiv-bot.pages.dev', {
        ...ctx.default_extra,
        parse_mode: ''
    }).catch(e => {
        honsole.warn('Failed to send help message:', e.description || e.message)
    })
})
bot.command('privacy', async (ctx) => {
    await bot.api.sendMessage(ctx.chat.id, 'https://pixiv-bot.pages.dev/privacy', {
        ...ctx.default_extra,
        parse_mode: ''
    }).catch(e => {
        honsole.warn('Failed to send privacy message:', e.description || e.message)
    })
})


// gift: get id even if channel
bot.command('id', async (ctx) => {
    let text = ctx.chat.id < 0 ? `#chatid: \`${ctx.chat.id}\`\n` : ''
    // channel post maybe didn't have .from
    text += ctx.from ? `#userid: \`${ctx.from.id}\`` : ''
    await bot.api.sendMessage(ctx.chat.id, text, {
        ...ctx.default_extra,
        parse_mode: 'Markdown'
    }).catch(e => {
        honsole.warn('Failed to send id message:', e.description || e.message)
    })
})

bot.command('link', ctx => linkLifecycle.handleCommand(ctx))

bot.on('callback_query', async (ctx, next) => {
    if (!await linkLifecycle.handleCallback(ctx)) return next()
})

bot.on([':text', ':caption'], async (ctx, next) => {
    if (!await linkLifecycle.handleReplyCandidate(ctx)) return next()
})

// step1 initial config
bot.use(async (ctx, next) => {
    if (ctx.command === 's' || ctx.text.substring(0, 3) === 'eyJ') {
    } else {
        ctx.ids = extractPixivIds(ctx.text)
        if (!ctx.callbackQuery && !ctx.inlineQuery
            && JSON.stringify(ctx.ids).length === 36 // have horrible bug in the feature LOL.
            && !ctx.text.includes('fanbox.cc')) {
            // bot have nothing to do.
            return
        }
    }
    // read configuration
    ctx.us = ctx.inlineQuery
        ? await resolveInlineSettings(ctx)
        : await resolveUserSettings(ctx)
    honsole.dev('input ->', ctx.chat, ctx.text, ctx.us)
    if (ctx.us === 'error') {
        honsole.warn('Get user setting error', ctx.text)
        return
    } else {
        return await next()
    }
})

async function dispatchSourceMessage(ctx, chatId) {
    if (ctx.ids && (ctx.ids.illust.length > 0 || ctx.ids.novel.length > 0)) {
        if (chatId > 0) {
            const action = ctx.ids.illust.length > 0 ? 'upload_photo' : 'typing'
            bot.api.sendChatAction(chatId, action, ctx.default_extra.message_thread_id ? {
                message_thread_id: ctx.default_extra.message_thread_id
            } : {}).catch(() => { })
            tg_sender(ctx).catch(error => {
                reportApplicationError(error, {
                    chatId,
                    languageCode: ctx.l,
                    illustIds: ctx.ids?.illust
                }).catch(() => { })
                bot.api.sendMessage(chatId, renderUserFacingError(ctx.l, error), ctx.default_extra).catch(() => { })
            })
            return
        }
        try {
            await tg_sender(ctx)
        } catch (error) {
            await reportApplicationError(error, {
                chatId,
                languageCode: ctx.l,
                illustIds: ctx.ids?.illust
            })
            bot.api.sendMessage(chatId, renderUserFacingError(ctx.l, error), ctx.default_extra).catch(() => { })
        }
        return
    }
    try {
        await tg_sender(ctx)
    } catch (error) {
        await reportApplicationError(error, {
            chatId,
            languageCode: ctx.l,
            illustIds: ctx.ids?.illust
        })
        bot.api.sendMessage(chatId, renderUserFacingError(ctx.l, error), ctx.default_extra).catch(() => { })
    }
}

bot.on([':text', ':caption'], async (ctx) => {
    const chatId = ctx.chat_id
    if (ctx.command === 's' || ctx.text.substring(0, 3) === 'eyJ') {
        await handleSettingsCommand(ctx, ctx.default_extra)
        return
    }
    if (chatId > 0) {
        (async () => {
            await ctx.react('👀').catch(() => { })
            setTimeout(async () => {
                await ctx.api.setMessageReaction(chatId, ctx.message.message_id, []).catch(() => { })
            }, 5000)
        })()
    }
    const sendSource = !(ctx.message.caption && !ctx.us.caption_extraction)
    const linkDispatch = await linkLifecycle.dispatchLinkedMessage(ctx, {
        dispatchSource: sendSource ? () => dispatchSourceMessage(ctx, chatId) : undefined
    })
    if (sendSource && linkDispatch.sendSource) {
        await dispatchSourceMessage(ctx, chatId)
    }
    return
})
bot.on('inline_query', inlineQueryHandler)

bot.catch(async (e) => {
    await reportApplicationError(e?.error || e, {
        chatId: e?.ctx?.chat?.id,
        languageCode: e?.ctx?.l,
        illustIds: e?.ctx?.ids?.illust,
        method: 'botUpdate'
    })
})

db.db_initial().then(async () => {
    // Check and apply database migrations
    if (!process.env.DBLESS) {
        const pool = getPool()
        const autoApply = process.env.AUTO_APPLY_PATCHES !== '0'  // Default: enabled (set =0 to disable)
        const migrationOk = await checkAndApplyMigrations(pool, autoApply)
        if (!migrationOk) {
            console.error('✗ Database migration check failed. Exiting.')
            process.exit(1)
        }
    }

    // Check system dependencies
    if (!process.env.DEPENDIONLESS && !process.env.dev) {
        try {
            const depCheck = await checkSystemDependencies()
            if (!depCheck.allPresent) {
                console.error('✗ Missing system dependencies for ugoira to MP4 conversion:')
                depCheck.missing.forEach(dep => console.error(`  - ${dep}`))
                console.error('Install missing dependencies or run with: DEPENDIONLESS=1 node app.js')
                process.exit(1)
            } else {
                console.log('✓ All system dependencies are installed')
            }
        } catch (error) {
            console.error('✗ Error checking system dependencies:', error)
            process.exit(1)
        }
    } else {
        console.log('⚠ Running without dependency check (DEPENDIONLESS mode)')
    }
    if (process.argv[1].includes('cron')) {
        return
    }
    bot.init().then(async () => {
        const guestMode = guestModeStartupMessage(bot.botInfo)
        console[guestMode.enabled ? 'log' : 'warn'](guestMode.message)
        // Initialize memory monitor with bot instance
        memoryMonitor.init(bot, config.tg.master_id)
        console.log('✓ Memory monitor initialized')

        // Initialize ranking scheduler (skip in dbless mode)
        if (!process.env.DBLESS) {
            rankingScheduler.start()
            console.log('✓ Ranking scheduler initialized')
        } else {
            console.log('⚠ Ranking scheduler skipped (DBLESS mode)')
        }

        grammyjsRun(bot, TELEGRAM_UPDATE_CONCURRENCY)

        console.log(new Date(), `bot @${bot.botInfo.username} started!`)
        bot.api.sendMessage(config.tg.master_id, `${new Date().toString()} bot started!`).catch(() => { })
    }).catch((e) => {
        console.error('You are offline or bad bot token', e)
        process.exit()
    })
    if (config.web.enabled && !process.env.WEBLESS) {
        import('./web.js')
    }
})

// Graceful shutdown
async function shutdown(signal) {
    console.log(`${signal} received, shutting down gracefully...`)
    linkLifecycle.dispose()
    bot.stop(signal)
    await db_close()
    process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
