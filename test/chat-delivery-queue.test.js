import test from 'ava'
import { createChatDeliveryQueue } from '../handlers/telegram/chat-delivery-queue.js'
import { createQueuedContentDispatcher } from '../handlers/telegram/source-message-dispatch.js'
import { createLinkLifecycle } from '../handlers/telegram/link-lifecycle.js'

function deferred() {
    let resolve
    const promise = new Promise(done => { resolve = done })
    return { promise, resolve }
}

test('same destination stays FIFO through appended documents, while another chat proceeds', async t => {
    const queue = createChatDeliveryQueue()
    const append = deferred()
    const started = deferred()
    const events = []
    const first = queue.run(-10, async () => {
        events.push('album')
        started.resolve()
        await append.promise
        events.push('documents')
    })
    await started.promise
    const second = queue.run('-10', () => events.push('next album'))
    await queue.run(-20, () => events.push('other chat'))
    t.deepEqual(events, ['album', 'other chat'])
    append.resolve()
    await Promise.all([first, second])
    t.deepEqual(events, ['album', 'other chat', 'documents', 'next album'])
    t.is(queue.chatCount, 0)
})

test('sync and async failures release the destination and preserve the original error', async t => {
    const queue = createChatDeliveryQueue()
    const error = new Error('failed')
    const first = queue.run(1, () => { throw error })
    const second = queue.run(1, async () => { throw error })
    const third = queue.run(1, () => 'sent')
    t.deepEqual(await Promise.allSettled([first, second, third]), [
        { status: 'rejected', reason: error }, { status: 'rejected', reason: error },
        { status: 'fulfilled', value: 'sent' }
    ])
    t.is(queue.chatCount, 0)
})

const context = (chatId, name, topic) => ({
    chat_id: chatId, chat: { id: chatId, type: 'supergroup' },
    message: { message_id: 1, text: name, chat: { id: chatId } },
    text: name, l: 'en', from: { id: 7 }, user_id: 7,
    ids: { illust: [12345678], novel: [] }, default_extra: { message_thread_id: topic }
})

test('source error notice owns its slot and linked deliveries share that same destination queue', async t => {
    const notice = deferred()
    const entered = deferred()
    const events = []
    const dispatcher = createQueuedContentDispatcher({
        bot: { api: { sendMessage: async () => {
            events.push('notice'); entered.resolve(); await notice.promise
        } } },
        send: async ctx => {
            events.push(ctx.text)
            if (ctx.text === 'failed source') throw new Error('failed')
            return { ok: true }
        },
        reportError: async () => {}, renderError: () => 'existing notice'
    })
    const source = dispatcher.dispatchSource(context(-10, 'failed source', 1), -10)
    await entered.promise
    const linked = dispatcher.sendLinked(context(-10, 'linked'))
    const topic = dispatcher.dispatchSource(context(-10, 'other topic', 2), -10)
    await dispatcher.sendLinked(context(-20, 'independent'))
    t.deepEqual(events, ['failed source', 'notice', 'independent'])
    notice.resolve()
    await Promise.all([source, linked, topic])
    t.deepEqual(events, ['failed source', 'notice', 'independent', 'linked', 'other topic'])
})

test('reciprocal linked dispatches complete without holding a source lock', async t => {
    const events = []
    const bot = { botInfo: { username: 'test_bot' }, api: { sendMessage: async () => {} } }
    const dispatcher = createQueuedContentDispatcher({
        bot, send: async ctx => { events.push([ctx.chat_id, ctx.text]); return { ok: true } }
    })
    const lifecycle = createLinkLifecycle({
        bot, tgSender: dispatcher.sendLinked,
        linkStore: { listLinks: async sourceChatId => [{
            sourceChatId, linkedChatId: sourceChatId === -10 ? -20 : -10,
            sync: 0, administratorOnly: 0, repeat: 2, chatType: 'supergroup'
        }] },
        logger: { warn() {}, error() {} }
    })
    try {
        const results = await Promise.all([-10, -20].map(id => {
            const ctx = context(id, String(id))
            return lifecycle.dispatchLinkedMessage(ctx, {
                dispatchSource: () => dispatcher.dispatchSource(ctx, id)
            })
        }))
        t.true(results.every(result => result.sourceDispatched && result.results[0].ok))
        // Linked target submission may precede the deferred source callback.
        t.deepEqual(events.filter(([id]) => id === -10).map(([, text]) => text).sort(), ['-10', '-20'])
        t.deepEqual(events.filter(([id]) => id === -20).map(([, text]) => text).sort(), ['-10', '-20'])
    } finally {
        lifecycle.dispose()
    }
})
