import test from 'ava'
import {
    addResolvedIllustration,
    reportIndependentFailure,
    runIndependentDeliveryItems
} from '../handlers/telegram/tg-sender-continuation.js'

test('one independent delivery failure does not block later work', async t => {
    const attempted = []
    const failures = []
    await runIndependentDeliveryItems([101, 102, 103], async id => {
        attempted.push(id)
        if (id === 102) throw Object.assign(new Error('permission denied'), {
            code: 'TELEGRAM_PERMISSION_DENIED'
        })
    }, async (error, id, index) => {
        failures.push({ id, index, code: error.code })
    })

    t.deepEqual(attempted, [101, 102, 103])
    t.deepEqual(failures, [{ id: 102, index: 1, code: 'TELEGRAM_PERMISSION_DENIED' }])
})

test('a failed error reporter preserves delivery failure and subsequent items', async t => {
    const logs = []
    const runtime = {
        deliveryErrors: [], chatId: 1, ctx: { l: 'en' },
        logger: { warn: (...args) => logs.push(args) },
        reportError: async () => { throw new Error('report unavailable') }
    }
    const attempted = []
    await runIndependentDeliveryItems([1, 2], async id => {
        attempted.push(id)
        if (id === 1) throw Object.assign(new Error('send unavailable'), { code: 'TELEGRAM_FORBIDDEN' })
    }, error => reportIndependentFailure(runtime, error, { method: 'sendNovel' }))
    t.deepEqual(attempted, [1, 2])
    t.deepEqual(runtime.deliveryErrors, ['TELEGRAM_FORBIDDEN'])
    t.is(logs.length, 2)
})

test('the classified error code is retained for final result and absent reports are safe', async t => {
    const runtime = {
        deliveryErrors: [], chatId: 1, ctx: { l: 'en' },
        reportError: async () => ({ errorCode: 'TELEGRAM_RATE_LIMITED' })
    }
    t.is(await reportIndependentFailure(runtime, new Error('rate limit'), {
        errorCode: 'TELEGRAM_NOVEL_SEND_FAILED'
    }), 'TELEGRAM_RATE_LIMITED')
    t.deepEqual(runtime.deliveryErrors, ['TELEGRAM_RATE_LIMITED'])
    runtime.reportError = async () => undefined
    t.is(await reportIndependentFailure(runtime, new Error('failed')), 'UNEXPECTED_PROCESSING_FAILURE')
})

test('overlapping author and explicit IDs retain one lifecycle and its progress', t => {
    const runtime = { lifecycles: new Map(), illusts: [] }
    addResolvedIllustration(runtime, { id: '123', mediagroup: [{ p: 0 }] })
    const lifecycle = runtime.lifecycles.get(123)
    lifecycle.sentPages.add(0)
    addResolvedIllustration(runtime, { id: 123, mediagroup: [{ p: 0 }] })
    addResolvedIllustration(runtime, { id: 456, mediagroup: [{ p: 0 }] })
    t.deepEqual(runtime.illusts.map(item => item.id), [123, 456])
    t.is(runtime.lifecycles.get(123), lifecycle)
    t.true(lifecycle.sentPages.has(0))
})
