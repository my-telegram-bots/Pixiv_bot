import test from 'ava'
import { createBot } from '../bot.js'
import { createUpdateDeduplicator } from '../handlers/telegram/update-deduplication.js'

function deferred() {
    let resolve
    const promise = new Promise(done => { resolve = done })
    return { promise, resolve }
}

function update(id, kind = 'message') {
    return {
        update_id: id,
        [kind]: { message_id: id + 1, date: 1, text: '12345678',
            chat: { id: -1001, type: kind === 'channel_post' ? 'channel' : 'supergroup' } }
    }
}

for (const kind of ['message', 'channel_post']) {
    test(`real bot ingress coalesces ${kind} replays and accepts new identical requests`, async t => {
        const bot = createBot({ tg: { token: '123456:test-token' } })
        bot.botInfo = { id: 123456, is_bot: true, first_name: 'Test', username: 'test_bot' }
        const entered = deferred()
        const work = deferred()
        const calls = []
        bot.use(async ctx => {
            calls.push(ctx.update.update_id)
            entered.resolve()
            await work.promise
        })
        const first = bot.handleUpdate(update(1, kind))
        await entered.promise
        let duplicateDone = false
        const duplicate = bot.handleUpdate(update(1, kind)).then(() => { duplicateDone = true })
        await Promise.resolve()
        t.false(duplicateDone)
        work.resolve()
        await Promise.all([first, duplicate])
        await bot.handleUpdate(update(1, kind))
        await bot.handleUpdate(update(2, kind))
        t.deepEqual(calls, [1, 2])
    })
}

test('only the original failed update propagates an error, and replay cannot repeat output', async t => {
    const middleware = createUpdateDeduplicator()
    const barrier = deferred()
    const error = new Error('uncertain output')
    let sends = 0
    const send = async () => { sends++; await barrier.promise; throw error }
    const first = middleware({ update: update(1) }, send)
    const duplicate = middleware({ update: update(1) }, send)
    const outcomes = Promise.allSettled([first, duplicate])
    barrier.resolve()
    t.deepEqual(await outcomes, [
        { status: 'rejected', reason: error }, { status: 'fulfilled', value: undefined }
    ])
    await middleware({ update: update(1) }, send)
    t.is(sends, 1)
})

test('retention expires from settlement, is bounded, and never evicts active ownership', async t => {
    let now = 0
    const middleware = createUpdateDeduplicator({ retentionMs: 10, maxCompleted: 2, clock: () => now })
    const work = deferred()
    let calls = 0
    const visit = id => middleware({ update: update(id) }, () => { calls++ })
    const first = middleware({ update: update(1) }, () => work.promise)
    await visit(2)
    await visit(3)
    await visit(4)
    now = 100
    const duplicate = visit(1)
    t.is(calls, 3)
    work.resolve()
    await Promise.all([first, duplicate])
    await visit(1)
    t.is(calls, 3)
    now = 110
    await visit(1)
    t.is(calls, 4)
    await visit(5)
    await visit(6)
    await visit(1)
    t.is(calls, 7)
})

test('missing update IDs do not collapse unrelated work and bot instances are isolated', async t => {
    const a = createUpdateDeduplicator()
    const b = createUpdateDeduplicator()
    let calls = 0
    for (const ctx of [{}, { update: {} }, { update: { update_id: '1' } }]) {
        await a(ctx, () => { calls++ })
    }
    await a({ update: update(1) }, () => { calls++ })
    await b({ update: update(1) }, () => { calls++ })
    t.is(calls, 5)
})
