import { InlineKeyboard } from 'grammy'
import { _l } from '#handlers/telegram/i18n'
import defaults from '#handlers/telegram/df'
import { extractInputValues } from '#handlers/telegram/input-parser'
import {
    SettingsCommand,
    classifySettingsCommand,
    hasPositiveDirective,
    parseSettingsInput
} from '#handlers/telegram/settings-command-parser'
import {
    applyTelegraphValues,
    createDefaultUserSettings,
    mergeStoredSetting,
    resolveRequestSettings,
    sanitizeSettingObject,
    selectStoredSetting,
    shouldQueryUserSetting
} from '#handlers/telegram/settings-resolver'

const validationExtra = {
    parse_mode: 'MarkdownV2',
    allow_sending_without_reply: true
}

async function sendMetadataError(bot, ctx, chatId, key, localize, logger) {
    await bot.api.sendMessage(chatId, localize(ctx.l, key), {
        ...validationExtra,
        reply_to_message_id: ctx.message.message_id
    }).catch(error => {
        logger.warn('Failed to send Telegraph metadata error:', error.description || error.message)
    })
}

async function resolveUserSettings(store, bot, ctx, localize, logger) {
    let chatId = ctx.chat_id
    const userId = ctx.user_id || ctx.from.id
    if (!ctx.type) {
        ctx.type = ctx.chat ? ctx.chat.type : 'inline'
    }
    if (!chatId) {
        chatId = ctx.message ? ctx.message.chat.id : userId
    }

    const parsedInput = ctx.settingsInput || parseSettingsInput(ctx.text)
    ctx.settingsInput = parsedInput

    let chatSetting = null
    if (ctx.chat || ctx.inlineQuery || ctx.callbackQuery) {
        chatSetting = await store.collection.chat_setting.findOne({ id: chatId })
    }

    let selectedSetting = chatSetting
    if (shouldQueryUserSetting(ctx.chat_id, parsedInput, chatSetting)) {
        const userSetting = await store.collection.chat_setting.findOne({ id: userId })
        selectedSetting = selectStoredSetting(chatSetting, userSetting)
    }

    let settings = mergeStoredSetting(createDefaultUserSettings(), selectedSetting)
    if (!settings.setting.format) {
        settings.setting.format = {}
    }
    if (!settings.setting.default) {
        settings.setting.default = {}
    }
    settings = resolveRequestSettings(settings, parsedInput, ctx.type, ctx.chat)

    if (ctx.message) {
        const result = applyTelegraphValues(settings, extractInputValues(parsedInput.body))
        if (result.error === 'title_too_long') {
            await sendMetadataError(bot, ctx, chatId, 'error_tlegraph_title_too_long', localize, logger)
            return 'error'
        }
        if (result.error === 'author_invalid') {
            await sendMetadataError(bot, ctx, chatId, 'error_tlegraph_author', localize, logger)
            return 'error'
        }
        settings = result.settings
    }

    ctx.us = settings
    return settings
}

async function authorizeSettingsCommand(bot, ctx, defaultExtra, localize, logger) {
    if (ctx.chat?.type === 'channel') {
        return true
    }
    if (ctx.message.sender_chat) {
        return false
    }
    if (ctx.chat.id >= 0 || ctx.from.id === 1087968824) {
        return true
    }

    let isAdmin = false
    try {
        const { status } = await bot.api.getChatMember(ctx.chat.id, ctx.from.id)
        isAdmin = status === 'administrator' || status === 'creator'
    } catch (error) {
        // Preserve the existing authorization failure behavior.
    }
    if (!isAdmin) {
        await bot.api.sendMessage(
            ctx.chat.id,
            localize(ctx.l, 'error_not_a_gc_administrator'),
            defaultExtra
        ).catch(error => {
            logger.warn('Failed to send admin check error message:', error.description || error.message)
        })
    }
    return isAdmin
}

async function exportSettings(bot, ctx, defaultExtra, localize, logger, Keyboard) {
    ctx.us.setting = {
        format: {
            message: ctx.us.setting.format.message || defaults.format.message,
            mediagroup_message: ctx.us.setting.format.mediagroup_message || defaults.format.mediagroup_message,
            inline: ctx.us.setting.format.inline || defaults.format.inline
        },
        default: ctx.us.setting.default
    }
    ctx.us.setting.time = +new Date()
    delete ctx.us.setting.dbless

    const payload = Buffer.from(JSON.stringify(ctx.us.setting), 'utf8').toString('base64')
    const url = `https://pixiv-bot.pages.dev/${localize(ctx.l)}/s#${payload}`
        .replace('/en', '')
        .replace('/undefined', '')
    await bot.api.sendMessage(ctx.chat.id, localize(ctx.l, 'setting_open_link'), {
        ...defaultExtra,
        reply_markup: new Keyboard().url('open', url),
        reply_to_message_id: ctx.message.message_id
    }).catch(error => {
        logger.warn(error)
    })
}

async function decodeImportedSettings(bot, ctx, localize, logger) {
    try {
        return sanitizeSettingObject(
            JSON.parse(Buffer.from(ctx.text, 'base64').toString('utf8'))
        )
    } catch (error) {
        await bot.api.sendMessage(ctx.chat.id, localize(ctx.l, 'error')).catch(sendError => {
            logger.warn('Failed to send parse error message:', sendError.description || sendError.message)
        })
        logger.warn('parse base64 configuration failed', ctx.text, error)
        return null
    }
}

async function persistSettings(store, bot, ctx, defaultExtra, newSetting, localize, logger) {
    if (newSetting === null || newSetting === undefined) {
        return
    }
    const serializedSetting = JSON.stringify(newSetting)
    if (!serializedSetting || serializedSetting.length <= 2) {
        return
    }
    logger.dev(newSetting)
    const saved = await store.update_setting(newSetting, ctx.chat.id, ctx.us)
    const messageKey = saved ? 'setting_saved' : 'error'
    await bot.api.sendMessage(ctx.chat.id, localize(ctx.l, messageKey), defaultExtra).catch(error => {
        logger.warn('Failed to send setting persistence result:', error.description || error.message)
    })
}

async function handleSettingsCommand(store, bot, ctx, defaultExtra, dependencies) {
    const { localize, logger, Keyboard } = dependencies
    if (!await authorizeSettingsCommand(bot, ctx, defaultExtra, localize, logger)) {
        return
    }

    const parsedInput = ctx.settingsInput || parseSettingsInput(ctx.text)
    ctx.settingsInput = parsedInput
    if (parsedInput.isSettingsCommand && parsedInput.unknownDirectives.length > 0) {
        await bot.api.sendMessage(
            ctx.chat.id,
            localize(ctx.l, 'setting_unknown_directive', parsedInput.unknownDirectives.join(', ')),
            defaultExtra
        ).catch(error => {
            logger.warn('Failed to send unknown setting flag message:', error.description || error.message)
        })
        return
    }
    const command = classifySettingsCommand(parsedInput, {
        hasMetadata: ctx.us.value_update_flag === true
    })
    if (command === SettingsCommand.EXPORT) {
        await exportSettings(bot, ctx, defaultExtra, localize, logger, Keyboard)
        return
    }
    if (command === SettingsCommand.RESET) {
        await store.delete_setting(ctx.chat.id)
        await bot.api.sendMessage(ctx.chat.id, localize(ctx.l, 'setting_reset'), defaultExtra).catch(error => {
            logger.warn('Failed to send setting reset message:', error.description || error.message)
        })
        return
    }
    if (ctx.chat_id < 0 && parsedInput.isSettingsCommand &&
        hasPositiveDirective(parsedInput, 'god')) {
        await bot.api.sendMessage(ctx.chat.id, localize(ctx.l, 'error'), defaultExtra).catch(error => {
            logger.warn('Failed to send god mode error message:', error.description || error.message)
        })
        return
    }
    if (command === SettingsCommand.IMPORT) {
        await persistSettings(
            store,
            bot,
            ctx,
            defaultExtra,
            await decodeImportedSettings(bot, ctx, localize, logger),
            localize,
            logger
        )
        return
    }
    if (command === SettingsCommand.SAVE) {
        await persistSettings(store, bot, ctx, defaultExtra, { default: ctx.us }, localize, logger)
    }
}

export function createSettingsLifecycle({
    bot,
    store,
    logger = console,
    localize = _l,
    Keyboard = InlineKeyboard
}) {
    if (!bot || !store) {
        throw new Error('createSettingsLifecycle requires bot and store')
    }
    return {
        resolveUserSettings: ctx => resolveUserSettings(store, bot, ctx, localize, logger),
        handleSettingsCommand: (ctx, defaultExtra) =>
            handleSettingsCommand(store, bot, ctx, defaultExtra, { localize, logger, Keyboard })
    }
}
