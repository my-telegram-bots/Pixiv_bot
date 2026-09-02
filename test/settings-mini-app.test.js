import test from 'ava'
import { readFileSync } from 'node:fs'
import { Bot } from 'grammy'
import en from '../lang/en.js'
import ja from '../lang/ja.js'
import zhHans from '../lang/zh-hans.js'
import zhHant from '../lang/zh-hant.js'
import {
    createSettingsMiniAppLifecycle,
    registerSettingsMiniAppHandlers
} from '../handlers/telegram/settings-mini-app-lifecycle.js'
import {
    normalizeSettingsMiniAppDependencies,
    parseSettingsMiniAppPayload
} from '../handlers/telegram/settings-mini-app-protocol.js'
import { createSettingsMiniAppSessionStore } from '../handlers/telegram/settings-mini-app-session-store.js'

const VALID_SETTINGS = Object.freeze({
    format: { message: 'message', inline: 'inline' },
    default: { tags: true, album: false }
})

function payload(session, action = 'save', settings = VALID_SETTINGS) {
    return JSON.stringify({
        v: 1,
        action,
        session,
        ...(action === 'save' ? { settings } : {})
    })
}

function decodeFragment(url) {
    const encoded = new URL(url).hash.slice(1)
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
}

function fixture({ updateResults = [true], deleteResults = [true], now = 1000 } = {}) {
    const messages = []
    const prepared = []
    const memberChecks = []
    const updates = []
    const deletes = []
    const chats = new Map()
    const members = new Map()
    const stored = new Map()
    let tokenId = 0
    let requestId = 100
    let updateIndex = 0
    let deleteIndex = 0
    let time = now
    const sessions = createSettingsMiniAppSessionStore({
        clock: () => time,
        tokenFactory: () => `session_token_${String(++tokenId).padStart(4, '0')}`,
        requestIdFactory: () => requestId++
    })
    const bot = {
        api: {
            async sendMessage(chatId, text, extra) {
                const sent = { chatId, text, extra, message_id: messages.length + 1 }
                messages.push(sent)
                return sent
            },
            async savePreparedKeyboardButton(userId, button) {
                prepared.push({ userId, button })
                return { id: `prepared-${button.request_chat.request_id}` }
            },
            async getChat(chatId) {
                const chat = chats.get(Number(chatId))
                if (!chat) throw new Error('chat unavailable')
                return chat
            },
            async getChatMember(chatId, userId) {
                memberChecks.push({ chatId: Number(chatId), userId: Number(userId) })
                return members.get(`${chatId}:${userId}`) || { status: 'left' }
            }
        }
    }
    const store = {
        collection: {
            chat_setting: {
                async findOne({ id }) { return stored.get(Number(id)) || null }
            }
        },
        async update_setting(settings, chatId) {
            updates.push({ settings, chatId })
            return updateResults[Math.min(updateIndex++, updateResults.length - 1)]
        },
        async delete_setting(chatId) {
            deletes.push(chatId)
            return deleteResults[Math.min(deleteIndex++, deleteResults.length - 1)]
        }
    }
    const lifecycle = createSettingsMiniAppLifecycle({
        bot,
        store,
        sessions,
        localize: (_language, key) => key,
        logger: { warn() {} }
    })
    const context = ({ userId = 7, message = {} } = {}) => ({
        l: 'en',
        from: { id: userId },
        chat: { id: userId, type: 'private' },
        chat_id: userId,
        user_id: userId,
        message: { message_id: 5, chat: { id: userId, type: 'private' }, ...message }
    })
    return {
        lifecycle,
        sessions,
        messages,
        prepared,
        memberChecks,
        updates,
        deletes,
        chats,
        members,
        stored,
        context,
        advance(ms) { time += ms }
    }
}

test('Mini App parser accepts only the versioned save and reset contracts', t => {
    const token = 'session_token_0001'
    t.deepEqual(parseSettingsMiniAppPayload(payload(token)).value, {
        v: 1,
        action: 'save',
        session: token,
        settings: VALID_SETTINGS
    })
    t.true(parseSettingsMiniAppPayload(payload(token, 'reset')).ok)

    const rejected = [
        null,
        '{',
        JSON.stringify([]),
        JSON.stringify({ v: 2, action: 'reset', session: token }),
        JSON.stringify({ v: 1, action: 'delete', session: token }),
        JSON.stringify({ v: 1, action: 'reset', session: token, settings: {} }),
        JSON.stringify({ v: 1, action: 'save', session: token, chat_id: 9, settings: VALID_SETTINGS }),
        JSON.stringify({ v: 1, action: 'save', session: token, settings: { format: {} } }),
        JSON.stringify({ v: 1, action: 'save', session: token, settings: {
            format: { message: false }, default: {}
        } }),
        JSON.stringify({ v: 1, action: 'save', session: token, settings: {
            format: {}, default: { unknown: true }
        } })
    ]
    for (const value of rejected) t.false(parseSettingsMiniAppPayload(value).ok)
})

test('Mini App parser enforces the UTF-8 byte limit rather than character count', t => {
    const token = 'session_token_0001'
    const base = {
        v: 1,
        action: 'save',
        session: token,
        settings: { format: { message: '' }, default: {} }
    }
    const empty = JSON.stringify(base)
    base.settings.format.message = 'a'.repeat(4096 - Buffer.byteLength(empty, 'utf8'))
    const exact = JSON.stringify(base)
    t.is(Buffer.byteLength(exact, 'utf8'), 4096)
    t.true(parseSettingsMiniAppPayload(exact).ok)

    base.settings.format.message += '界'
    const oversized = JSON.stringify(base)
    t.true(oversized.length < Buffer.byteLength(oversized, 'utf8'))
    t.is(parseSettingsMiniAppPayload(oversized).reason, 'too_large')
})

test('Mini App parser rejects prototype-pollution keys at every depth', t => {
    const token = 'session_token_0001'
    const dangerous = [
        `{"v":1,"action":"reset","session":"${token}","__proto__":{}}`,
        `{"v":1,"action":"save","session":"${token}","settings":{"format":{},"default":{"constructor":false}}}`,
        `{"v":1,"action":"save","session":"${token}","settings":{"format":{"prototype":"x"},"default":{}}}`
    ]
    for (const value of dangerous) t.false(parseSettingsMiniAppPayload(value).ok)
})

test('Mini App parser enforces existing Telegraph metadata validation', t => {
    const token = 'session_token_0001'
    const data = defaultValue => payload(token, 'save', { format: {}, default: defaultValue })
    t.true(parseSettingsMiniAppPayload(data({ telegraph_title: 'x'.repeat(255) })).ok)
    t.false(parseSettingsMiniAppPayload(data({ telegraph_title: 'x'.repeat(256) })).ok)
    t.true(parseSettingsMiniAppPayload(data({ telegraph_author_name: 'x'.repeat(127) })).ok)
    t.false(parseSettingsMiniAppPayload(data({ telegraph_author_name: 'x'.repeat(128) })).ok)
    t.true(parseSettingsMiniAppPayload(data({ telegraph_author_url: 'https://example.com' })).ok)
    t.true(parseSettingsMiniAppPayload(data({ telegraph_author_url: '' })).ok)
    t.false(parseSettingsMiniAppPayload(data({ telegraph_author_url: 'not a URL' })).ok)
})

test('session store binds actors, expires entries, consumes once, and evicts at its bound', t => {
    let now = 0
    let token = 0
    let requestId = 1
    const sessions = createSettingsMiniAppSessionStore({
        clock: () => now,
        ttlMs: 100,
        maxSessions: 2,
        tokenFactory: () => `bounded_session_${++token}`,
        requestIdFactory: () => requestId++
    })
    const first = sessions.createEditSession({ userId: 7, targetId: 7, targetType: 'private' })
    t.is(sessions.getEditSession(first.token, 8), null)
    t.truthy(sessions.getEditSession(first.token, 7))
    const selection = sessions.createSelectionSession({ userId: 7, expectedType: 'group' })
    sessions.createEditSession({ userId: 8, targetId: 8, targetType: 'private' })
    t.is(sessions.getEditSession(first.token, 7), null)
    t.truthy(sessions.consumeSelectionSession(selection.requestId, 7))
    t.is(sessions.consumeSelectionSession(selection.requestId, 7), null)

    const expiring = sessions.createEditSession({ userId: 7, targetId: 7, targetType: 'private' })
    now = 101
    t.is(sessions.getEditSession(expiring.token, 7), null)
})

test('personal settings always bind to the Telegram actor and expose fragment-only state', async t => {
    const f = fixture()
    f.stored.set(7, { id: 7, default: { tags: true }, format: { message: 'stored' } })

    t.true(await f.lifecycle.openPersonalSettings(f.context()))
    t.is(f.prepared.length, 2)
    t.deepEqual(f.prepared.map(item => item.button.request_chat.chat_is_channel), [false, true])
    t.deepEqual(f.prepared.map(item => item.userId), [7, 7])

    const keyboardButton = f.messages[0].extra.reply_markup.keyboard[0][0]
    t.false(Boolean(f.messages[0].extra.reply_markup.one_time_keyboard))
    const url = new URL(keyboardButton.web_app.url)
    t.is(url.origin + url.pathname, 'https://pixiv-bot.pages.dev/mini-app')
    t.is(url.search, '')
    const fragment = decodeFragment(url)
    t.true(fragment.settings.default.tags)
    t.false(fragment.settings.default.auto_spoiler)
    t.is(fragment.settings.format.message, 'stored')
    t.is(fragment.request_chat.group, 'prepared-100')
    t.is(fragment.request_chat.channel, 'prepared-101')

    await f.lifecycle.handleWebAppData(f.context({
        message: { web_app_data: { data: payload(fragment.session) } }
    }))
    t.is(f.updates.length, 1)
    t.is(f.updates[0].chatId, 7)
    t.false(Object.hasOwn(f.updates[0].settings, 'chat_id'))
    t.is(f.messages.at(-1).text, 'setting_mini_app_saved')
    t.true(f.messages.at(-1).extra.reply_markup.remove_keyboard)
})

test('public /miniapp opens only in private chat and explains the same-chat recovery elsewhere', async t => {
    const privateChat = fixture()
    t.true(await privateChat.lifecycle.handleCommand(privateChat.context()))
    t.is(privateChat.prepared.length, 2)
    t.is(new URL(
        privateChat.messages[0].extra.reply_markup.keyboard[0][0].web_app.url
    ).pathname, '/mini-app')

    const group = fixture()
    const groupContext = group.context()
    groupContext.chat = { id: -20, type: 'supergroup' }
    groupContext.chat_id = -20
    groupContext.message.chat = groupContext.chat
    t.true(await group.lifecycle.handleCommand(groupContext))
    t.is(group.prepared.length, 0)
    t.is(group.messages.length, 1)
    t.is(group.messages[0].chatId, -20)
    t.is(group.messages[0].text, 'setting_mini_app_private_only')
})

test('localized Mini App URLs use the permanent route in every language', async t => {
    const expected = new Map([
        ['en', '/mini-app'],
        ['ja', '/ja/mini-app'],
        ['zh-cn', '/zh-hans/mini-app'],
        ['zh-tw', '/zh-hant/mini-app']
    ])
    for (const [language, pathname] of expected) {
        const f = fixture()
        const ctx = f.context()
        ctx.l = language
        await f.lifecycle.handleCommand(ctx)
        t.is(new URL(f.messages[0].extra.reply_markup.keyboard[0][0].web_app.url).pathname,
            pathname)
    }
})

test('Mini App dependency normalization matches command settings before persistence', async t => {
    const f = fixture()
    await f.lifecycle.openPersonalSettings(f.context())
    const session = decodeFragment(
        f.messages[0].extra.reply_markup.keyboard[0][0].web_app.url
    ).session
    const submitted = {
        format: {},
        default: {
            single_caption: true,
            album: false,
            remove_keyboard: true,
            open: true,
            share: true,
            append_file_immediate: true,
            append_file: false,
            asfile: true
        }
    }
    await f.lifecycle.handleWebAppData(f.context({
        message: { web_app_data: { data: payload(session, 'save', submitted) } }
    }))
    const normalized = f.updates[0].settings.default
    t.true(normalized.album)
    t.false(normalized.open)
    t.false(normalized.share)
    t.true(normalized.append_file)
    t.false(normalized.asfile)

    const fileOnly = normalizeSettingsMiniAppDependencies({
        format: {},
        default: { asfile: true, album: true, album_one: true, single_caption: true }
    })
    t.false(fileOnly.default.album)
    t.false(fileOnly.default.album_one)
    t.false(fileOnly.default.single_caption)
})

test('unknown, other-user, expired, and consumed edit sessions never write', async t => {
    const f = fixture()
    await f.lifecycle.openPersonalSettings(f.context())
    const session = decodeFragment(f.messages[0].extra.reply_markup.keyboard[0][0].web_app.url).session

    await f.lifecycle.handleWebAppData(f.context({
        userId: 8,
        message: { web_app_data: { data: payload(session) } }
    }))
    t.is(f.updates.length, 0)
    t.is(f.messages.at(-1).text, 'setting_mini_app_expired')

    f.advance(15 * 60 * 1000 + 1)
    await f.lifecycle.handleWebAppData(f.context({
        message: { web_app_data: { data: payload(session) } }
    }))
    t.is(f.updates.length, 0)
    t.is(f.messages.at(-1).text, 'setting_mini_app_expired')

    const fresh = fixture()
    await fresh.lifecycle.openPersonalSettings(fresh.context())
    const freshToken = decodeFragment(
        fresh.messages[0].extra.reply_markup.keyboard[0][0].web_app.url
    ).session
    const saveContext = fresh.context({
        message: { web_app_data: { data: payload(freshToken) } }
    })
    await fresh.lifecycle.handleWebAppData(saveContext)
    await fresh.lifecycle.handleWebAppData(saveContext)
    t.is(fresh.updates.length, 1)
    t.deepEqual(fresh.messages.slice(-2).map(message => message.text), [
        'setting_mini_app_saved',
        'setting_mini_app_expired'
    ])
})

test('database failure retains a session for retry and successful reset consumes it', async t => {
    const save = fixture({ updateResults: [false, true] })
    await save.lifecycle.openPersonalSettings(save.context())
    const token = decodeFragment(save.messages[0].extra.reply_markup.keyboard[0][0].web_app.url).session
    const ctx = save.context({ message: { web_app_data: { data: payload(token) } } })
    await save.lifecycle.handleWebAppData(ctx)
    await save.lifecycle.handleWebAppData(ctx)
    t.is(save.updates.length, 2)
    t.deepEqual(save.messages.slice(-2).map(message => message.text), [
        'setting_mini_app_save_failed',
        'setting_mini_app_saved'
    ])
    t.true(save.messages.at(-1).extra.reply_markup.remove_keyboard)

    const reset = fixture()
    await reset.lifecycle.openPersonalSettings(reset.context())
    const resetToken = decodeFragment(
        reset.messages[0].extra.reply_markup.keyboard[0][0].web_app.url
    ).session
    await reset.lifecycle.handleWebAppData(reset.context({
        message: { web_app_data: { data: payload(resetToken, 'reset') } }
    }))
    t.deepEqual(reset.deletes, [7])
    t.is(reset.messages.at(-1).text, 'setting_mini_app_reset')
})

test('concurrent duplicate submissions produce one write and one confirmation', async t => {
    const f = fixture()
    let release
    const blocked = new Promise(resolve => { release = resolve })
    f.lifecycle = createSettingsMiniAppLifecycle({
        bot: {
            api: {
                async sendMessage(chatId, text, extra) {
                    const sent = { chatId, text, extra, message_id: f.messages.length + 1 }
                    f.messages.push(sent)
                    return sent
                },
                async savePreparedKeyboardButton(_userId, button) {
                    return { id: `prepared-${button.request_chat.request_id}` }
                },
                async getChatMember() { return { status: 'administrator' } }
            }
        },
        store: {
            collection: { chat_setting: { async findOne() { return null } } },
            async update_setting(settings, chatId) {
                f.updates.push({ settings, chatId })
                await blocked
                return true
            },
            async delete_setting() { return true }
        },
        sessions: f.sessions,
        localize: (_language, key) => key,
        logger: { warn() {} }
    })
    await f.lifecycle.openPersonalSettings(f.context())
    const token = decodeFragment(f.messages[0].extra.reply_markup.keyboard[0][0].web_app.url).session
    const ctx = f.context({ message: { web_app_data: { data: payload(token) } } })
    const first = f.lifecycle.handleWebAppData(ctx)
    const duplicate = f.lifecycle.handleWebAppData(ctx)
    await duplicate
    t.is(f.updates.length, 1)
    release()
    await first
    t.is(f.messages.filter(message => message.text === 'setting_mini_app_saved').length, 1)
})

test('group selection binds request and actor, validates type, and checks admin again on save', async t => {
    const f = fixture()
    f.chats.set(-20, { id: -20, type: 'supergroup', title: 'Target' })
    f.members.set('-20:7', { status: 'administrator' })
    f.stored.set(-20, { id: -20, default: { album: false }, format: { inline: 'target' } })
    await f.lifecycle.openPersonalSettings(f.context())
    const groupRequestId = f.prepared[0].button.request_chat.request_id

    await f.lifecycle.handleChatShared(f.context({
        message: { chat_shared: { request_id: groupRequestId, chat_id: -20 } }
    }))
    t.deepEqual(f.memberChecks, [{ chatId: -20, userId: 7 }])
    const targetFragment = decodeFragment(
        f.messages.at(-1).extra.reply_markup.keyboard[0][0].web_app.url
    )
    t.false(targetFragment.settings.default.album)
    t.is(targetFragment.settings.format.inline, 'target')

    await f.lifecycle.handleWebAppData(f.context({
        message: { web_app_data: { data: payload(targetFragment.session) } }
    }))
    t.deepEqual(f.memberChecks, [
        { chatId: -20, userId: 7 },
        { chatId: -20, userId: 7 }
    ])
    t.is(f.updates[0].chatId, -20)

    const denied = fixture()
    denied.chats.set(-30, { id: -30, type: 'channel', title: 'Channel' })
    await denied.lifecycle.openPersonalSettings(denied.context())
    const channelRequestId = denied.prepared[1].button.request_chat.request_id
    await denied.lifecycle.handleChatShared(denied.context({
        message: { chat_shared: { request_id: channelRequestId, chat_id: -30 } }
    }))
    t.is(denied.messages.at(-1).text, 'setting_mini_app_admin_required')
    t.is(denied.updates.length, 0)
})

test('chat selection rejects unknown actors and mismatched chat types', async t => {
    const f = fixture()
    f.chats.set(-20, { id: -20, type: 'channel', title: 'Wrong type' })
    f.members.set('-20:7', { status: 'creator' })
    await f.lifecycle.openPersonalSettings(f.context())
    const groupRequestId = f.prepared[0].button.request_chat.request_id

    await f.lifecycle.handleChatShared(f.context({
        userId: 8,
        message: { chat_shared: { request_id: groupRequestId, chat_id: -20 } }
    }))
    t.is(f.messages.at(-1).text, 'setting_mini_app_expired')

    await f.lifecycle.handleChatShared(f.context({
        message: { chat_shared: { request_id: groupRequestId, chat_id: -20 } }
    }))
    t.is(f.messages.at(-1).text, 'setting_mini_app_target_unavailable')
    t.is(f.memberChecks.length, 0)
})

test('channel selection accepts a creator and binds the channel target', async t => {
    const f = fixture()
    f.chats.set(-30, { id: -30, type: 'channel', title: 'Channel' })
    f.members.set('-30:7', { status: 'creator' })
    await f.lifecycle.openPersonalSettings(f.context())
    const channelRequestId = f.prepared[1].button.request_chat.request_id
    await f.lifecycle.handleChatShared(f.context({
        message: { chat_shared: { request_id: channelRequestId, chat_id: -30 } }
    }))
    const target = decodeFragment(
        f.messages.at(-1).extra.reply_markup.keyboard[0][0].web_app.url
    )
    await f.lifecycle.handleWebAppData(f.context({
        message: { web_app_data: { data: payload(target.session) } }
    }))

    t.deepEqual(f.memberChecks, [
        { chatId: -30, userId: 7 },
        { chatId: -30, userId: 7 }
    ])
    t.is(f.updates[0].chatId, -30)
})

test('loss of target administration before save preserves the edit session but never writes', async t => {
    const f = fixture()
    f.chats.set(-20, { id: -20, type: 'group', title: 'Target' })
    f.members.set('-20:7', { status: 'administrator' })
    await f.lifecycle.openPersonalSettings(f.context())
    const requestId = f.prepared[0].button.request_chat.request_id
    await f.lifecycle.handleChatShared(f.context({
        message: { chat_shared: { request_id: requestId, chat_id: -20 } }
    }))
    const session = decodeFragment(
        f.messages.at(-1).extra.reply_markup.keyboard[0][0].web_app.url
    ).session
    f.members.set('-20:7', { status: 'member' })
    await f.lifecycle.handleWebAppData(f.context({
        message: { web_app_data: { data: payload(session) } }
    }))
    t.is(f.updates.length, 0)
    t.is(f.messages.at(-1).text, 'setting_mini_app_admin_required')
    t.truthy(f.sessions.getEditSession(session, 7))
})

test('Mini App update registration is terminal before Pixiv routing', async t => {
    const bot = new Bot('1:test')
    let commandCalls = 0
    let webAppCalls = 0
    let chatSharedCalls = 0
    let laterCalls = 0
    registerSettingsMiniAppHandlers(bot, {
        async handleCommand() { commandCalls++ },
        async handleWebAppData() { webAppCalls++ },
        async handleChatShared() { chatSharedCalls++ }
    })
    bot.use(async () => { laterCalls++ })
    bot.botInfo = {
        id: 1,
        is_bot: true,
        first_name: 'Pixiv',
        username: 'Pixiv_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: true
    }
    const baseMessage = {
        message_id: 1,
        date: 1,
        chat: { id: 7, type: 'private', first_name: 'Caller' },
        from: { id: 7, is_bot: false, first_name: 'Caller' }
    }
    await bot.handleUpdate({
        update_id: 0,
        message: {
            ...baseMessage,
            text: '/miniapp',
            entities: [{ offset: 0, length: 8, type: 'bot_command' }]
        }
    })
    await bot.handleUpdate({
        update_id: 1,
        message: { ...baseMessage, web_app_data: { data: '{}' } }
    })
    await bot.handleUpdate({
        update_id: 2,
        message: { ...baseMessage, chat_shared: { request_id: 1, chat_id: -20 } }
    })

    t.is(commandCalls, 1)
    t.is(webAppCalls, 1)
    t.is(chatSharedCalls, 1)
    t.is(laterCalls, 0)
})

test('app wires Mini App service messages before general settings and content routing', t => {
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
    const registration = app.indexOf('registerSettingsMiniAppHandlers(bot, settingsMiniAppLifecycle)')
    t.true(registration > 0)
    t.true(registration < app.indexOf('// step1 initial config'))
    t.true(registration < app.indexOf("bot.command('start'"))
    t.true(registration < app.indexOf("bot.on([':text', ':caption']"))
})

test('all supported languages expose the complete Mini App settings messages', t => {
    const keys = language => Object.keys(language)
        .filter(key => key.startsWith('setting_mini_app_'))
        .sort()
    t.true(keys(en).length > 0)
    t.deepEqual(keys(ja), keys(en))
    t.deepEqual(keys(zhHans), keys(en))
    t.deepEqual(keys(zhHant), keys(en))
})
