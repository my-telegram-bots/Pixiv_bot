import test from 'ava'
import { readFileSync } from 'node:fs'
import {
    createLinkLifecycle,
    createLinkedContext,
    parseLinkCallback,
    shouldDispatchLink
} from '../handlers/telegram/link-lifecycle.js'
import en from '../lang/en.js'
import ja from '../lang/ja.js'
import zhHans from '../lang/zh-hans.js'
import zhHant from '../lang/zh-hant.js'

const localize = (language, key, ...values) => `${key}${values.length ? `:${values.join(',')}` : ''}`

function fixture({ now = 1000, links = [], sendResult } = {}) {
    const messages = []
    const callbacks = []
    const edits = []
    const created = []
    const deleted = []
    const sentContexts = []
    let messageId = 100
    let time = now
    const members = new Map()
    const chats = new Map()
    const bot = {
        botInfo: { id: 99, username: 'Pixiv_bot' },
        api: {
            async sendMessage(chatId, text, extra) {
                const message = { message_id: messageId++, chat: { id: chatId }, text }
                messages.push({ chatId, text, extra, message })
                return message
            },
            async getChat(target) {
                const chat = chats.get(String(target))
                if (!chat) throw new Error('not found')
                return chat
            },
            async getChatMember(chatId, userId) {
                return members.get(`${chatId}:${userId}`) || { status: 'left' }
            }
        }
    }
    const linkStore = {
        async listLinks() { return links },
        async createLink(sourceChatId, target) {
            const link = {
                sourceChatId,
                linkedChatId: target.id,
                sync: 0,
                administratorOnly: 0,
                repeat: 0,
                chatType: target.type,
                mediaGroupCount: 1
            }
            created.push(link)
            return { created: true, link }
        },
        async deleteLink(sourceChatId, linkedChatId) {
            deleted.push({ sourceChatId, linkedChatId })
            return { sourceChatId, linkedChatId }
        },
        async updateOption() { return { status: 'missing', link: null } }
    }
    const lifecycle = createLinkLifecycle({
        bot,
        linkStore,
        tgSender: async ctx => {
            sentContexts.push(ctx)
            return sendResult
        },
        localize,
        logger: { warn() {}, error() {} },
        clock: () => time,
        scheduleExpiry: () => ({ unref() {} }),
        cancelExpiry() {}
    })
    const context = ({ userId = 7, chatId = -10, text = '', reply = null } = {}) => ({
        chat_id: chatId,
        user_id: userId,
        chat: { id: chatId, type: chatId > 0 ? 'private' : 'supergroup' },
        from: { id: userId },
        message: { message_id: 5, text, chat: { id: chatId }, reply_to_message: reply },
        text,
        l: 'en',
        default_extra: {},
        callbackQuery: { data: '', message: { message_id: 6, chat: { id: chatId } } },
        async answerCallbackQuery(options) { callbacks.push(options) },
        async editMessageText(...args) { edits.push(args) },
        async editMessageReplyMarkup(...args) { edits.push(args) }
    })
    return {
        bot, lifecycle, linkStore, messages, callbacks, edits, created, deleted,
        sentContexts, members, chats, context,
        advance(ms) { time += ms }
    }
}

async function startSession(f, userId = 7) {
    f.members.set(`-10:${userId}`, { status: 'administrator' })
    const ctx = f.context({ userId })
    ctx.callbackQuery.data = 'lnk|1|a'
    await f.lifecycle.handleCallback(ctx)
    return f.messages.at(-1).message
}

test('link callbacks are versioned and strictly validated', t => {
    t.deepEqual(parseLinkCallback('lnk|1|a'), { kind: 'add' })
    t.deepEqual(parseLinkCallback('lnk|1|d|-20'), { kind: 'delete', linkedChatId: -20 })
    t.deepEqual(parseLinkCallback('lnk|1|u|-20|r|0|1'), {
        kind: 'update', linkedChatId: -20, field: 'repeat', expectedValue: 0, nextValue: 1
    })
    t.deepEqual(parseLinkCallback('lnk|1|u|-20|r|0|2'), { kind: 'invalid' })
    t.deepEqual(parseLinkCallback('lnk|2|a'), { kind: 'invalid' })
    t.is(parseLinkCallback('unrelated'), null)
})

test('all supported languages expose the same link lifecycle messages', t => {
    const linkKeys = language => Object.keys(language).filter(key => key.startsWith('link_')).sort()
    t.deepEqual(linkKeys(ja), linkKeys(en))
    t.deepEqual(linkKeys(zhHans), linkKeys(en))
    t.deepEqual(linkKeys(zhHant), linkKeys(en))
})

test('link lifecycle has no legacy app or generic-settings write path', t => {
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
    const database = readFileSync(new URL('../db.js', import.meta.url), 'utf8')
    const resolver = readFileSync(
        new URL('../handlers/telegram/settings-resolver.js', import.meta.url),
        'utf8'
    )

    t.true(app.includes("createLinkLifecycle"))
    t.true(app.includes('linkLifecycle.dispatchLinkedMessage(ctx)'))
    t.false(app.includes('add_link_chat'))
    t.false(app.includes('k_link_setting'))
    t.false(database.includes('link_chat_list.'))
    t.false(database.includes("['link_chat']"))
    t.false(resolver.includes('link_chat_list'))
})

test('pending sessions bind the exact actor and prompt, then expire across restart', async t => {
    const f = fixture()
    const prompt = await startSession(f, 7)

    const other = f.context({ userId: 8, text: '-20', reply: { ...prompt, from: { id: 99 } } })
    t.true(await f.lifecycle.handleReplyCandidate(other))
    t.true(f.messages.at(-1).text.startsWith('link_session_owner'))

    const restarted = fixture()
    const stale = restarted.context({ userId: 7, text: '-20', reply: { ...prompt, from: { id: 99 } } })
    t.true(await restarted.lifecycle.handleReplyCandidate(stale))
    t.true(restarted.messages.at(-1).text.startsWith('link_session_expired'))

    f.advance(10 * 60 * 1000 + 1)
    const expired = f.context({ userId: 7, text: '-20', reply: { ...prompt, from: { id: 99 } } })
    t.true(await f.lifecycle.handleReplyCandidate(expired))
    t.true(f.messages.at(-1).text.startsWith('link_session_expired'))
})

test('a newer prompt replaces only the same administrator session', async t => {
    const f = fixture()
    const first = await startSession(f, 7)
    await startSession(f, 8)
    const replacement = await startSession(f, 7)

    const oldReply = f.context({
        userId: 7,
        text: '-20',
        reply: { ...first, from: { id: 99 } }
    })
    await f.lifecycle.handleReplyCandidate(oldReply)
    t.true(f.messages.at(-1).text.startsWith('link_session_expired'))

    const activeReply = f.context({
        userId: 7,
        text: '/cancel',
        reply: { ...replacement, from: { id: 99 } }
    })
    await f.lifecycle.handleReplyCandidate(activeReply)
    t.true(f.messages.at(-1).text.startsWith('link_cancelled'))
})

test('/link lists every target and always exposes a separate add action', async t => {
    const f = fixture({
        links: [
            { linkedChatId: -20, sync: 0, administratorOnly: 0, repeat: 0, chatType: 'channel' },
            { linkedChatId: -30, sync: 1, administratorOnly: 1, repeat: 2, chatType: 'supergroup' }
        ]
    })
    f.members.set('-10:7', { status: 'administrator' })
    f.chats.set('-20', { id: -20, type: 'channel', title: 'One' })
    f.chats.set('-30', { id: -30, type: 'supergroup', title: 'Two' })

    await f.lifecycle.handleCommand(f.context())

    t.is(f.messages.length, 3)
    t.true(f.messages[0].text.startsWith('link_list'))
    t.is(f.messages[0].extra.reply_markup.inline_keyboard[0][0].callback_data, 'lnk|1|a')
    t.true(f.messages[1].text.includes('One'))
    t.true(f.messages[2].text.includes('Two'))
})

test('invalid target is retryable, cancellation is terminal, and creation checks bot capability', async t => {
    const f = fixture()
    const prompt = await startSession(f)
    const reply = value => f.context({ text: value, reply: { ...prompt, from: { id: 99 } } })

    await f.lifecycle.handleReplyCandidate(reply('missing'))
    t.true(f.messages.at(-1).text.startsWith('link_target_invalid'))

    f.chats.set('-20', { id: -20, type: 'channel', title: 'Target' })
    f.members.set('-20:7', { status: 'administrator' })
    f.members.set('-20:99', { status: 'left' })
    await f.lifecycle.handleReplyCandidate(reply('-20'))
    t.true(f.messages.at(-1).text.startsWith('link_bot_permission_required'))
    t.is(f.created.length, 0)

    f.members.set('-20:99', { status: 'administrator', can_post_messages: true })
    await f.lifecycle.handleReplyCandidate(reply('-20'))
    t.is(f.created.length, 1)
    t.true(f.messages.at(-1).text.startsWith('link_done'))

    const cancelPrompt = await startSession(f)
    await f.lifecycle.handleReplyCandidate(f.context({
        text: '/cancel', reply: { ...cancelPrompt, from: { id: 99 } }
    }))
    t.true(f.messages.at(-1).text.startsWith('link_cancelled'))
})

test('unlink requires only source administration', async t => {
    const f = fixture()
    f.members.set('-10:7', { status: 'administrator' })
    const ctx = f.context()
    ctx.callbackQuery.data = 'lnk|1|d|-20'

    t.true(await f.lifecycle.handleCallback(ctx))
    t.deepEqual(f.deleted, [{ sourceChatId: -10, linkedChatId: -20 }])
    t.true(f.edits[0][0].startsWith('link_unlink_done'))
})

test('linked dispatch builds isolated target contexts and suppresses source only after success', async t => {
    const links = [{
        sourceChatId: -10,
        linkedChatId: -20,
        sync: 0,
        administratorOnly: 0,
        repeat: 0,
        chatType: 'channel'
    }]
    const f = fixture({ links })
    const ctx = f.context({ text: 'https://pixiv.net/artworks/1' })
    ctx.ids = { illust: ['1'], novel: [], author: [] }
    ctx.type = 'supergroup'
    ctx.message.message_thread_id = 88
    ctx.message.sender_chat = { id: -10 }
    ctx.message.reply_to_message = { message_id: 4 }
    ctx.default_extra = { parse_mode: 'MarkdownV2', reply_to_message_id: 5, message_thread_id: 88 }

    const result = await f.lifecycle.dispatchLinkedMessage(ctx)

    t.false(result.sendSource)
    t.is(f.sentContexts.length, 1)
    const target = f.sentContexts[0]
    t.is(target.chat_id, -20)
    t.deepEqual(target.chat, { id: -20, type: 'channel' })
    t.deepEqual(target.message.chat, target.chat)
    t.false(Object.hasOwn(target.message, 'message_id'))
    t.false(Object.hasOwn(target.message, 'reply_to_message'))
    t.false(Object.hasOwn(target.message, 'message_thread_id'))
    t.false(Object.hasOwn(target.message, 'sender_chat'))
    t.false(Object.hasOwn(target.default_extra, 'reply_to_message_id'))
    t.false(Object.hasOwn(target, 'us'))
})

test('a failed target remains visible and does not suppress the source send', async t => {
    const links = [{
        linkedChatId: -20,
        sync: 0,
        administratorOnly: 0,
        repeat: 0,
        chatType: 'channel'
    }]
    const f = fixture({ links, sendResult: { ok: false, errorCode: 'PIXIV_SEND_FAILED' } })
    const ctx = f.context({ text: 'https://pixiv.net/artworks/1' })
    ctx.ids = { illust: ['1'], novel: [], author: [] }

    const result = await f.lifecycle.dispatchLinkedMessage(ctx)

    t.true(result.sendSource)
    t.false(result.results[0].ok)
    t.true(f.messages.at(-1).text.startsWith('link_dispatch_failed'))
})

test('dispatch filtering preserves mention, administrator, sender-chat, and repeat rules', t => {
    const base = {
        chat_id: -10,
        type: 'supergroup',
        message: { text: 'plain' },
        botUsername: 'Pixiv_bot'
    }
    const link = { linkedChatId: -20, sync: 1, administratorOnly: 1, repeat: 2 }

    t.false(shouldDispatchLink(base, link, true))
    t.true(shouldDispatchLink({ ...base, message: { text: '@Pixiv_bot work' } }, link, true))
    t.false(shouldDispatchLink({ ...base, message: { text: '@Pixiv_bot work' } }, link, false))
    t.false(shouldDispatchLink({ ...base, message: { text: '@Pixiv_bot', sender_chat: { id: -20 } } }, link, true))
})

test('createLinkedContext does not mutate the source context', t => {
    const source = {
        chat_id: -10,
        user_id: 7,
        text: 'work',
        l: 'en',
        from: { id: 7 },
        message: { chat: { id: -10 }, message_thread_id: 9, reply_to_message: { message_id: 1 } }
    }
    const target = createLinkedContext(source, { linkedChatId: -20, chatType: 'channel' })
    t.is(source.message.message_thread_id, 9)
    t.is(target.message.message_thread_id, undefined)
})
