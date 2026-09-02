import { Keyboard } from 'grammy'
import defaults from '#handlers/telegram/df'
import { _l } from '#handlers/telegram/i18n'
import { reescape_strings } from '#handlers/telegram/format'
import { createDefaultUserSettings } from '#handlers/telegram/settings-resolver'
import {
    normalizeSettingsMiniAppDependencies,
    parseSettingsMiniAppPayload,
    projectStoredSettings
} from '#handlers/telegram/settings-mini-app-protocol'
import { createSettingsMiniAppSessionStore } from '#handlers/telegram/settings-mini-app-session-store'

const DEFAULT_WEB_APP_URL = 'https://pixiv-bot.pages.dev'
const ADMIN_STATUSES = new Set(['administrator', 'creator'])

function plain(localize, language, key) {
    return reescape_strings(localize(language, key))
}

function localePath(language = 'en') {
    const normalized = String(language).toLowerCase()
    if (normalized.startsWith('ja')) return '/ja'
    if (normalized === 'zh-hant' || normalized === 'zh-tw' || normalized === 'zh-hk') {
        return '/zh-hant'
    }
    if (normalized.startsWith('zh')) return '/zh-hans'
    return ''
}

function encodeFragment(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function targetTypeMatches(expectedType, actualType) {
    return expectedType === 'channel'
        ? actualType === 'channel'
        : actualType === 'group' || actualType === 'supergroup'
}

function isPrivateUserContext(ctx) {
    return Number.isSafeInteger(ctx.from?.id) && ctx.chat?.type === 'private' &&
        Number(ctx.chat.id) === Number(ctx.from.id)
}

function cloneSettings(settings) {
    return JSON.parse(JSON.stringify(settings))
}

export function createSettingsMiniAppLifecycle({
    bot,
    store,
    logger = console,
    localize = _l,
    ReplyKeyboard = Keyboard,
    sessions = createSettingsMiniAppSessionStore(),
    webAppBaseUrl = DEFAULT_WEB_APP_URL
}) {
    if (!bot || !store) throw new Error('createSettingsMiniAppLifecycle requires bot and store')

    const inFlightSessions = new Set()
    const defaultValues = createDefaultUserSettings().setting.default
    const baseUrl = String(webAppBaseUrl).replace(/\/$/, '')

    async function send(userId, language, key, extra = {}) {
        return bot.api.sendMessage(userId, plain(localize, language, key), {
            ...extra,
            parse_mode: undefined
        }).catch(error => {
            logger.warn(`Failed to send ${key}:`, error.description || error.message)
            return null
        })
    }

    async function isAdministrator(chatId, userId) {
        try {
            const member = await bot.api.getChatMember(chatId, userId)
            return ADMIN_STATUSES.has(member.status)
        } catch (error) {
            return false
        }
    }

    function createChatRequest(userId, expectedType) {
        return sessions.createSelectionSession({ userId, expectedType })
    }

    async function prepareChatSelectors(userId, language) {
        const group = createChatRequest(userId, 'group')
        const channel = createChatRequest(userId, 'channel')
        try {
            const [preparedGroup, preparedChannel] = await Promise.all([
                bot.api.savePreparedKeyboardButton(userId, {
                    text: plain(localize, language, 'setting_mini_app_select_group'),
                    request_chat: {
                        request_id: group.requestId,
                        chat_is_channel: false,
                        request_title: true,
                        request_username: true
                    }
                }),
                bot.api.savePreparedKeyboardButton(userId, {
                    text: plain(localize, language, 'setting_mini_app_select_channel'),
                    request_chat: {
                        request_id: channel.requestId,
                        chat_is_channel: true,
                        request_title: true,
                        request_username: true
                    }
                })
            ])
            if (typeof preparedGroup?.id !== 'string' || typeof preparedChannel?.id !== 'string') {
                throw new Error('Telegram returned an invalid prepared keyboard button')
            }
            return {
                group: preparedGroup.id,
                channel: preparedChannel.id,
                requests: [group, channel]
            }
        } catch (error) {
            sessions.revokeSelectionSession(group.requestId, userId)
            sessions.revokeSelectionSession(channel.requestId, userId)
            throw error
        }
    }

    async function readInitialSettings(targetId) {
        const stored = await store.collection.chat_setting.findOne({ id: targetId })
        return projectStoredSettings(stored, defaults.format, defaultValues)
    }

    async function openTargetSettings(ctx, target) {
        const userId = Number(ctx.from.id)
        let selectors
        let initialSettings
        try {
            initialSettings = await readInitialSettings(target.id)
            selectors = await prepareChatSelectors(userId, ctx.l)
        } catch (error) {
            logger.warn('Failed to prepare Mini App settings:', error.description || error.message)
            await send(userId, ctx.l, 'setting_mini_app_target_unavailable')
            return false
        }

        let session
        try {
            session = sessions.createEditSession({
                userId,
                targetId: target.id,
                targetType: target.type
            })
        } catch (error) {
            for (const request of selectors.requests) {
                sessions.revokeSelectionSession(request.requestId, userId)
            }
            logger.warn('Failed to create Mini App edit session:', error.message)
            await send(userId, ctx.l, 'setting_mini_app_target_unavailable')
            return false
        }
        const url = `${baseUrl}${localePath(ctx.l)}/mini-app#${encodeFragment({
            v: 1,
            session: session.token,
            settings: initialSettings,
            request_chat: {
                group: selectors.group,
                channel: selectors.channel
            }
        })}`
        const keyboard = new ReplyKeyboard()
            .webApp(plain(localize, ctx.l, 'setting_mini_app_open_button'), url)
            .resized()
        const sent = await send(userId, ctx.l, 'setting_mini_app_open', {
            reply_markup: keyboard
        })
        if (sent) return true

        sessions.revokeEditSession(session.token)
        for (const request of selectors.requests) {
            sessions.revokeSelectionSession(request.requestId, userId)
        }
        return false
    }

    async function openPersonalSettings(ctx) {
        if (!isPrivateUserContext(ctx)) {
            if (ctx.from?.id) await send(ctx.from.id, ctx.l, 'setting_mini_app_invalid')
            return false
        }
        return openTargetSettings(ctx, { id: Number(ctx.from.id), type: 'private' })
    }

    async function handleCommand(ctx) {
        if (!isPrivateUserContext(ctx)) {
            await send(ctx.chat.id, ctx.l, 'setting_mini_app_private_only')
            return true
        }
        await openPersonalSettings(ctx)
        return true
    }

    async function handleChatShared(ctx) {
        if (!isPrivateUserContext(ctx)) {
            if (ctx.from?.id) await send(ctx.from.id, ctx.l, 'setting_mini_app_invalid')
            return true
        }
        const shared = ctx.message?.chat_shared
        const userId = Number(ctx.from.id)
        const selection = Number.isInteger(shared?.request_id)
            ? sessions.consumeSelectionSession(shared.request_id, userId)
            : null
        if (!selection) {
            await send(userId, ctx.l, 'setting_mini_app_expired')
            return true
        }

        let target
        try {
            target = await bot.api.getChat(shared.chat_id)
        } catch (error) {
            await send(userId, ctx.l, 'setting_mini_app_target_unavailable')
            return true
        }
        if (!targetTypeMatches(selection.expectedType, target.type)) {
            await send(userId, ctx.l, 'setting_mini_app_target_unavailable')
            return true
        }
        if (!await isAdministrator(target.id, userId)) {
            await send(userId, ctx.l, 'setting_mini_app_admin_required')
            return true
        }
        await openTargetSettings(ctx, { id: Number(target.id), type: target.type })
        return true
    }

    async function handleWebAppData(ctx) {
        if (!isPrivateUserContext(ctx)) {
            if (ctx.from?.id) await send(ctx.from.id, ctx.l, 'setting_mini_app_invalid')
            return true
        }
        const parsed = parseSettingsMiniAppPayload(ctx.message?.web_app_data?.data)
        if (!parsed.ok) {
            await send(ctx.from.id, ctx.l, 'setting_mini_app_invalid')
            return true
        }

        const { action, session: token } = parsed.value
        const userId = Number(ctx.from.id)
        const session = sessions.getEditSession(token, userId)
        if (!session) {
            await send(userId, ctx.l, 'setting_mini_app_expired')
            return true
        }
        if (inFlightSessions.has(token)) return true
        inFlightSessions.add(token)
        let saved = false
        try {
            if (session.targetType === 'private') {
                if (session.targetId !== userId) {
                    sessions.revokeEditSession(token)
                    await send(userId, ctx.l, 'setting_mini_app_invalid')
                    return true
                }
            } else if (!await isAdministrator(session.targetId, userId)) {
                await send(userId, ctx.l, 'setting_mini_app_admin_required')
                return true
            }
            saved = action === 'reset'
                ? await store.delete_setting(session.targetId)
                : await store.update_setting(
                    normalizeSettingsMiniAppDependencies(
                        cloneSettings(parsed.value.settings),
                        session.targetType
                    ),
                    session.targetId
                )
        } catch (error) {
            logger.warn('Mini App settings persistence failed:', error.description || error.message)
        } finally {
            inFlightSessions.delete(token)
        }

        if (!saved) {
            await send(userId, ctx.l, 'setting_mini_app_save_failed')
            return true
        }
        sessions.consumeEditSession(token, userId)
        await send(
            userId,
            ctx.l,
            action === 'reset' ? 'setting_mini_app_reset' : 'setting_mini_app_saved',
            { reply_markup: { remove_keyboard: true } }
        )
        return true
    }

    return {
        handleCommand,
        openPersonalSettings,
        handleChatShared,
        handleWebAppData
    }
}

export function registerSettingsMiniAppHandlers(bot, lifecycle) {
    if (!bot || !lifecycle?.handleCommand || !lifecycle?.handleWebAppData ||
        !lifecycle?.handleChatShared) {
        throw new Error('registerSettingsMiniAppHandlers requires bot and lifecycle')
    }
    bot.command('miniapp', ctx => lifecycle.handleCommand(ctx))
    bot.on('message:web_app_data', ctx => lifecycle.handleWebAppData(ctx))
    bot.on('message:chat_shared', ctx => lifecycle.handleChatShared(ctx))
}
