import { InlineKeyboard } from 'grammy'
import { _l } from '#handlers/telegram/i18n'
import { reescape_strings } from '#handlers/telegram/format'

const ANONYMOUS_ADMIN_ID = 1087968824
const PROMPT_MARKER = '#link-session'
const CALLBACK_PREFIX = 'lnk'
const CALLBACK_VERSION = '1'
const OPTION_CODES = Object.freeze({ s: 'sync', a: 'administrator_only', r: 'repeat' })
const OPTION_VALUES = Object.freeze({ sync: [0, 1], administrator_only: [0, 1], repeat: [0, 1, 2] })

function sessionKey(chatId, userId) {
    return `${chatId}:${userId}`
}

function plain(localize, language, key, ...values) {
    return reescape_strings(localize(language, key, ...values))
}

function plainExtra(extra = {}) {
    const result = { ...extra }
    delete result.parse_mode
    return result
}

function optionValue(link, field) {
    return field === 'administrator_only' ? link.administratorOnly : link[field]
}

function nextOptionValue(field, value) {
    const values = OPTION_VALUES[field]
    return values[(values.indexOf(value) + 1) % values.length]
}

export function parseLinkCallback(data) {
    if (typeof data !== 'string' || !data.startsWith(`${CALLBACK_PREFIX}|`)) return null
    const parts = data.split('|')
    if (parts[0] !== CALLBACK_PREFIX || parts[1] !== CALLBACK_VERSION) {
        return { kind: 'invalid' }
    }
    if (parts.length === 3 && parts[2] === 'a') return { kind: 'add' }
    if (parts.length === 4 && parts[2] === 'd' && /^-?\d+$/.test(parts[3])) {
        return { kind: 'delete', linkedChatId: Number(parts[3]) }
    }
    if (parts.length === 7 && parts[2] === 'u' && /^-?\d+$/.test(parts[3])) {
        const field = OPTION_CODES[parts[4]]
        const expectedValue = Number(parts[5])
        const nextValue = Number(parts[6])
        if (field && OPTION_VALUES[field].includes(expectedValue) &&
            OPTION_VALUES[field].includes(nextValue) &&
            nextOptionValue(field, expectedValue) === nextValue) {
            return { kind: 'update', linkedChatId: Number(parts[3]), field, expectedValue, nextValue }
        }
    }
    return { kind: 'invalid' }
}

export function renderLinkKeyboard(language, link, localize = _l, Keyboard = InlineKeyboard) {
    const keyboard = new Keyboard()
    for (const [code, field] of Object.entries(OPTION_CODES)) {
        const value = optionValue(link, field)
        const nextValue = nextOptionValue(field, value)
        keyboard.text(
            `${plain(localize, language, `link_${field}`)} | ${plain(localize, language, `link_${field}_${value}`)}`,
            `${CALLBACK_PREFIX}|${CALLBACK_VERSION}|u|${link.linkedChatId}|${code}|${value}|${nextValue}`
        )
    }
    keyboard.row().text(
        plain(localize, language, 'link_unlink'),
        `${CALLBACK_PREFIX}|${CALLBACK_VERSION}|d|${link.linkedChatId}`
    )
    return keyboard
}

export function shouldDispatchLink(ctx, link, sourceIsAdmin) {
    const sourceChatId = Number(ctx.chat_id ?? ctx.chat?.id)
    if (ctx.message?.sender_chat && Number(ctx.message.sender_chat.id) === link.linkedChatId) {
        return false
    }
    if (ctx.type === 'channel' || ctx.chat?.type === 'channel') return false
    if (sourceChatId < 0 && link.sync === 1) {
        const text = ctx.message?.text || ctx.text || ''
        if (!text.includes(`@${ctx.me?.username || ''}`) &&
            !text.includes(`@${ctx.botUsername || ''}`)) return false
    }
    return sourceChatId > 0 || link.administratorOnly === 0 || sourceIsAdmin
}

export function createLinkedContext(ctx, link) {
    const targetChat = { id: link.linkedChatId, type: link.chatType }
    const message = { ...ctx.message, chat: targetChat }
    delete message.message_id
    delete message.reply_to_message
    delete message.message_thread_id
    delete message.sender_chat
    const target = {
        chat_id: link.linkedChatId,
        user_id: ctx.user_id ?? ctx.from?.id,
        text: ctx.text || '',
        ids: ctx.ids,
        l: ctx.l,
        type: link.chatType,
        chat: targetChat,
        from: ctx.from,
        message,
        match: ctx.match,
        default_extra: {
            parse_mode: 'MarkdownV2',
            allow_sending_without_reply: true
        }
    }
    return target
}

export function createLinkLifecycle({
    bot,
    linkStore,
    tgSender,
    logger = console,
    localize = _l,
    Keyboard = InlineKeyboard,
    clock = () => Date.now(),
    ttlMs = 10 * 60 * 1000,
    scheduleExpiry = (callback, delay) => setTimeout(callback, delay),
    cancelExpiry = timer => clearTimeout(timer)
}) {
    if (!bot || !linkStore || !tgSender) {
        throw new Error('createLinkLifecycle requires bot, linkStore, and tgSender')
    }
    const sessions = new Map()

    function deleteSession(key) {
        const current = sessions.get(key)
        if (current?.timer) cancelExpiry(current.timer)
        sessions.delete(key)
    }

    async function send(ctx, key, ...values) {
        return bot.api.sendMessage(
            ctx.chat_id ?? ctx.chat.id,
            plain(localize, ctx.l, key, ...values),
            plainExtra(ctx.default_extra)
        ).catch(error => logger.warn(`Failed to send ${key}:`, error.description || error.message))
    }

    async function isAdmin(chatId, userId) {
        if (Number(chatId) > 0 && Number(chatId) === Number(userId)) return true
        try {
            const { status } = await bot.api.getChatMember(chatId, userId)
            return status === 'administrator' || status === 'creator'
        } catch (error) {
            return false
        }
    }

    async function authorizeSource(ctx, notify = true) {
        const userId = ctx.user_id ?? ctx.from?.id
        const chatId = ctx.chat_id ?? ctx.chat?.id
        if (!userId || userId === ANONYMOUS_ADMIN_ID) {
            if (notify) await send(ctx, 'error_anonymous')
            return false
        }
        if (!await isAdmin(chatId, userId)) {
            if (notify) await send(ctx, 'error_not_a_gc_administrator')
            return false
        }
        return true
    }

    async function answer(ctx, key, showAlert = false) {
        await ctx.answerCallbackQuery({
            text: plain(localize, ctx.l, key),
            show_alert: showAlert
        }).catch(() => {})
    }

    async function startSession(ctx, authorized = false) {
        if (!authorized && !await authorizeSource(ctx, false)) return false
        const chatId = ctx.chat_id ?? ctx.chat.id
        const userId = ctx.user_id ?? ctx.from.id
        const key = sessionKey(chatId, userId)
        deleteSession(key)
        const prompt = await bot.api.sendMessage(
            chatId,
            `${PROMPT_MARKER}\n${plain(localize, ctx.l, 'link_start')}`,
            {
                ...plainExtra(ctx.default_extra),
                reply_markup: { force_reply: true, selective: true }
            }
        ).catch(error => {
            logger.warn('Failed to send link prompt:', error.description || error.message)
            return null
        })
        if (!prompt) return false
        const session = {
            chatId: Number(chatId),
            userId: Number(userId),
            promptMessageId: Number(prompt.message_id),
            expiresAt: clock() + ttlMs,
            timer: null
        }
        session.timer = scheduleExpiry(() => {
            if (sessions.get(key) === session) sessions.delete(key)
        }, ttlMs)
        session.timer?.unref?.()
        sessions.set(key, session)
        return true
    }

    async function handleCommand(ctx) {
        if (!await authorizeSource(ctx)) return true
        let links
        try {
            links = await linkStore.listLinks(ctx.chat_id ?? ctx.chat.id)
        } catch (error) {
            await send(ctx, error.code === 'LINK_DB_UNAVAILABLE' ? 'link_db_unavailable' : 'link_db_failed')
            return true
        }
        const addKeyboard = new Keyboard().text(
            plain(localize, ctx.l, 'link_add'),
            `${CALLBACK_PREFIX}|${CALLBACK_VERSION}|a`
        )
        await bot.api.sendMessage(
            ctx.chat_id ?? ctx.chat.id,
            plain(localize, ctx.l, links.length ? 'link_list' : 'link_list_empty'),
            { ...plainExtra(ctx.default_extra), reply_markup: addKeyboard }
        ).catch(error => logger.warn('Failed to send link list:', error.description || error.message))
        for (const link of links) {
            let targetName = String(link.linkedChatId)
            try {
                const target = await bot.api.getChat(link.linkedChatId)
                targetName = target.title || target.username || targetName
            } catch (error) {
                // A stale target remains visible so the source administrator can unlink it.
            }
            await bot.api.sendMessage(
                ctx.chat_id ?? ctx.chat.id,
                plain(localize, ctx.l, 'link_entry', targetName, link.linkedChatId),
                {
                    ...plainExtra(ctx.default_extra),
                    reply_markup: renderLinkKeyboard(ctx.l, link, localize, Keyboard)
                }
            ).catch(error => logger.warn('Failed to send link entry:', error.description || error.message))
        }
        return true
    }

    function isReplyCandidate(ctx) {
        const reply = ctx.message?.reply_to_message
        return Boolean(reply?.from?.id === bot.botInfo.id && reply.text?.startsWith(PROMPT_MARKER))
    }

    async function targetIsUsable(target) {
        let member
        try {
            member = await bot.api.getChatMember(target.id, bot.botInfo.id)
        } catch (error) {
            return false
        }
        if (['left', 'kicked'].includes(member.status)) return false
        if (member.status === 'restricted') {
            return member.is_member !== false && member.can_send_photos !== false
        }
        if (target.type === 'channel') {
            return member.status === 'creator' ||
                (member.status === 'administrator' && member.can_post_messages !== false)
        }
        if (member.status === 'creator' || member.status === 'administrator') return true
        const permissions = target.permissions || {}
        return permissions.can_send_photos !== false && permissions.can_send_other_messages !== false
    }

    async function handleReplyCandidate(ctx) {
        if (!isReplyCandidate(ctx)) return false
        const chatId = Number(ctx.chat_id ?? ctx.chat.id)
        const userId = Number(ctx.user_id ?? ctx.from?.id)
        if (userId === ANONYMOUS_ADMIN_ID) {
            await send(ctx, 'error_anonymous')
            return true
        }
        const replyId = Number(ctx.message.reply_to_message.message_id)
        const owner = [...sessions.values()].find(session =>
            session.chatId === chatId && session.promptMessageId === replyId)
        if (owner && owner.userId !== userId) {
            await send(ctx, 'link_session_owner')
            return true
        }
        const key = sessionKey(chatId, userId)
        const session = sessions.get(key)
        if (!session || session.promptMessageId !== replyId) {
            await send(ctx, 'link_session_expired')
            return true
        }
        if (session.expiresAt <= clock()) {
            deleteSession(key)
            await send(ctx, 'link_session_expired')
            return true
        }
        if (ctx.text.trim() === '/cancel') {
            deleteSession(key)
            await send(ctx, 'link_cancelled')
            return true
        }
        if (!await authorizeSource(ctx)) return true

        let target
        try {
            target = await bot.api.getChat(ctx.text.trim())
        } catch (error) {
            await send(ctx, 'link_target_invalid')
            return true
        }
        if (!['group', 'supergroup', 'channel'].includes(target.type)) {
            await send(ctx, 'link_target_invalid')
            return true
        }
        if (Number(target.id) === chatId) {
            await send(ctx, 'link_target_self')
            return true
        }
        if (!await isAdmin(target.id, userId)) {
            await send(ctx, 'link_target_admin_required')
            return true
        }
        if (!await targetIsUsable(target)) {
            await send(ctx, 'link_bot_permission_required')
            return true
        }
        let result
        try {
            result = await linkStore.createLink(chatId, target)
        } catch (error) {
            await send(ctx, error.code === 'LINK_DB_UNAVAILABLE' ? 'link_db_unavailable' : 'link_db_failed')
            return true
        }
        deleteSession(key)
        await bot.api.sendMessage(
            chatId,
            plain(localize, ctx.l, result.created ? 'link_done' : 'link_already_exists', target.title || target.username || target.id, target.id),
            {
                ...plainExtra(ctx.default_extra),
                reply_markup: renderLinkKeyboard(ctx.l, result.link, localize, Keyboard)
            }
        ).catch(error => logger.warn('Failed to send link result:', error.description || error.message))
        return true
    }

    async function handleCallback(ctx) {
        const action = parseLinkCallback(ctx.callbackQuery?.data)
        if (!action) return false
        if (action.kind === 'invalid') {
            await answer(ctx, 'link_callback_invalid', true)
            return true
        }
        if (action.kind === 'add') {
            if (!await authorizeSource(ctx, false)) {
                await answer(ctx,
                    (ctx.user_id ?? ctx.from?.id) === ANONYMOUS_ADMIN_ID
                        ? 'error_anonymous'
                        : 'error_not_a_gc_administrator',
                    true
                )
                return true
            }
            const started = await startSession(ctx, true)
            await answer(ctx, started ? 'link_prompt_started' : 'link_prompt_failed', !started)
            return true
        }
        if (!await authorizeSource(ctx, false)) {
            await answer(ctx,
                (ctx.user_id ?? ctx.from?.id) === ANONYMOUS_ADMIN_ID
                    ? 'error_anonymous'
                    : 'error_not_a_gc_administrator',
                true
            )
            return true
        }
        const sourceChatId = ctx.chat_id ?? ctx.chat.id
        if (action.kind === 'delete') {
            try {
                const deleted = await linkStore.deleteLink(sourceChatId, action.linkedChatId)
                if (!deleted) {
                    await answer(ctx, 'link_callback_stale', true)
                    return true
                }
                await ctx.editMessageText(plain(localize, ctx.l, 'link_unlink_done'), {
                    reply_markup: new Keyboard()
                }).catch(() => {})
                await answer(ctx, 'link_unlink_done')
            } catch (error) {
                await answer(ctx, error.code === 'LINK_DB_UNAVAILABLE' ? 'link_db_unavailable' : 'link_db_failed', true)
            }
            return true
        }
        if (!await isAdmin(action.linkedChatId, ctx.user_id ?? ctx.from.id)) {
            await answer(ctx, 'link_target_admin_required', true)
            return true
        }
        try {
            const result = await linkStore.updateOption(
                sourceChatId,
                action.linkedChatId,
                action.field,
                action.expectedValue,
                action.nextValue
            )
            if (result.status !== 'updated') {
                if (result.link) {
                    await ctx.editMessageReplyMarkup({
                        reply_markup: renderLinkKeyboard(ctx.l, result.link, localize, Keyboard)
                    }).catch(() => {})
                }
                await answer(ctx, 'link_callback_stale', true)
                return true
            }
            await ctx.editMessageReplyMarkup({
                reply_markup: renderLinkKeyboard(ctx.l, result.link, localize, Keyboard)
            }).catch(() => {})
            await answer(ctx, 'saved')
        } catch (error) {
            await answer(ctx, error.code === 'LINK_DB_UNAVAILABLE' ? 'link_db_unavailable' : 'link_db_failed', true)
        }
        return true
    }

    async function dispatchLinkedMessage(ctx, options = {}) {
        let links
        try {
            links = await linkStore.listLinks(ctx.chat_id ?? ctx.chat.id)
        } catch (error) {
            if (error.code !== 'LINK_DB_UNAVAILABLE') logger.warn('Failed to list linked chats:', error)
            return { sendSource: true, results: [] }
        }
        if (links.length === 0 || ctx.type === 'channel' || ctx.chat?.type === 'channel') {
            return { sendSource: true, results: [] }
        }
        if (ctx.message?.sender_chat && links.some(link =>
            Number(ctx.message.sender_chat.id) === link.linkedChatId)) {
            return { sendSource: false, results: [] }
        }
        const needsAdmin = links.some(link => link.administratorOnly === 1)
        const sourceIsAdmin = needsAdmin
            ? await isAdmin(ctx.chat_id ?? ctx.chat.id, ctx.user_id ?? ctx.from?.id)
            : false
        const dispatchable = links.filter(link => shouldDispatchLink({
            ...ctx,
            me: bot.botInfo,
            botUsername: bot.botInfo.username
        }, link, sourceIsAdmin))
        const sourcePromise = dispatchable.length > 0 &&
            dispatchable.every(link => link.repeat === 2) &&
            typeof options.dispatchSource === 'function'
            ? Promise.resolve().then(options.dispatchSource)
            : null
        const targetResultsPromise = Promise.all(dispatchable.map(async link => {
            try {
                const sendResult = await tgSender(createLinkedContext(ctx, link))
                if (sendResult?.ok === false) {
                    const error = new Error('Linked target did not complete successfully')
                    error.code = sendResult.errorCode || 'LINK_SEND_FAILED'
                    throw error
                }
                return { link, ok: true }
            } catch (error) {
                logger.error?.(
                    'Error processing linked chat message:',
                    error.code || 'LINK_SEND_FAILED'
                )
                await bot.api.sendMessage(
                    ctx.chat_id ?? ctx.chat.id,
                    plain(localize, ctx.l, 'link_dispatch_failed', link.linkedChatId, error.code || 'LINK_SEND_FAILED'),
                    plainExtra(ctx.default_extra)
                ).catch(() => {})
                return { link, ok: false, error }
            }
        }))
        const results = sourcePromise
            ? (await Promise.all([targetResultsPromise, sourcePromise]))[0]
            : await targetResultsPromise
        const notifyTargets = results
            .filter(result => result.ok && result.link.repeat === 1)
            .map(result => result.link.linkedChatId)
        if (notifyTargets.length > 0) {
            await bot.api.sendMessage(
                ctx.chat_id ?? ctx.chat.id,
                plain(localize, ctx.l, 'link_dispatch_sent', notifyTargets.join(', ')),
                plainExtra(ctx.default_extra)
            ).catch(() => {})
        }
        const suppressSource = results.some(result => result.ok && result.link.repeat < 2)
        return {
            sendSource: !sourcePromise && !suppressSource,
            sourceDispatched: Boolean(sourcePromise),
            results
        }
    }

    return {
        handleCommand,
        handleReplyCandidate,
        handleCallback,
        dispatchLinkedMessage,
        isReplyCandidate,
        dispose() {
            for (const key of sessions.keys()) deleteSession(key)
        }
    }
}
