import test from 'ava'
import { createSourceMessageDispatcher } from '../handlers/telegram/source-message-dispatch.js'
import { createBot } from '../bot.js'

function deferred() {
    let resolve
    const promise = new Promise(done => { resolve = done })
    return { promise, resolve }
}

test('private delivery stays pending until its sender settles', async t => {
    const sending = deferred()
    const events = []
    const ctx = { ids: { illust: [123], novel: [] }, default_extra: { message_thread_id: 8 } }
    const dispatch = createSourceMessageDispatcher({
        bot: { api: { sendChatAction: async (...args) => events.push(args) } },
        send: async value => { t.is(value, ctx); return sending.promise }
    })
    let completed = false
    const result = dispatch(ctx, 1).then(value => { completed = true; return value })
    await Promise.resolve()
    t.false(completed)
    t.deepEqual(events, [[1, 'upload_photo', { message_thread_id: 8 }]])
    sending.resolve({ ok: true, errorCode: null })
    t.deepEqual(await result, { ok: true, errorCode: null })
})

test('failed delivery awaits one existing error notice before releasing the update', async t => {
    const noticeStarted = deferred()
    const notice = deferred()
    const events = []
    const failure = new Error('send failed')
    const extra = { reply_to_message_id: 12 }
    const dispatch = createSourceMessageDispatcher({
        bot: { api: {
            sendChatAction: async () => {},
            sendMessage: async (...args) => {
                events.push(args)
                noticeStarted.resolve()
                await notice.promise
            }
        } },
        send: async () => { throw failure },
        reportError: async error => { t.is(error, failure); events.push('report') },
        renderError: (_language, error) => { t.is(error, failure); return 'existing notice' }
    })
    let completed = false
    const pending = dispatch({
        ids: { illust: [], novel: [123] }, l: 'en', default_extra: extra
    }, 1).then(() => { completed = true })
    await noticeStarted.promise
    t.false(completed)
    t.deepEqual(events, ['report', [1, 'existing notice', extra]])
    notice.resolve()
    await pending
    t.true(completed)
})

function channelBot() {
    const bot = createBot({ tg: { token: '123456:test-token' } })
    bot.botInfo = { id: 123456, is_bot: true, first_name: 'Test', username: 'test_bot' }
    return bot
}

function channelUpdate() {
    return {
        update_id: 1,
        channel_post: { message_id: 2, date: 1, chat: { id: -1001, type: 'channel', title: 'Test' }, text: '12345678' }
    }
}

test('real grammY channel middleware retains ownership of downstream work', async t => {
    const bot = channelBot()
    const entered = deferred()
    const work = deferred()
    bot.use(async ctx => {
        t.is(ctx.message, ctx.channelPost)
        entered.resolve()
        await work.promise
    })
    let completed = false
    const pending = bot.handleUpdate(channelUpdate()).then(() => { completed = true })
    await entered.promise
    await Promise.resolve()
    t.false(completed)
    work.resolve()
    await pending
    t.true(completed)
})

test('real grammY channel middleware propagates asynchronous failure to the runner', async t => {
    const bot = channelBot()
    const failure = new Error('downstream failed')
    bot.use(async () => { await Promise.resolve(); throw failure })
    const error = await t.throwsAsync(() => bot.handleUpdate(channelUpdate()))
    t.is(error.error, failure)
})
