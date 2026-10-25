import test from 'ava'
import { createWeightedGate } from '../handlers/utils/media-buffer-budget.js'
import { mediaGroupBufferWeight, prepareMediaBatch } from '../handlers/telegram/media-buffer-weight.js'

function deferred() {
    let resolve
    const promise = new Promise(done => { resolve = done })
    return { promise, resolve }
}

test('buffer reservation spans upload completion, with atomic FIFO albums', async t => {
    const gate = createWeightedGate({ capacity: 3 })
    const upload = deferred()
    const entered = deferred()
    const calls = []
    const first = gate(2, async () => {
        calls.push('first-download')
        entered.resolve()
        await upload.promise
        calls.push('first-upload-finished')
    })
    await entered.promise
    const album = gate(3, async () => calls.push('album'))
    const single = gate(1, async () => calls.push('single'))
    await Promise.resolve()
    t.deepEqual(calls, ['first-download'])
    upload.resolve()
    await Promise.all([first, album, single])
    t.deepEqual(calls, ['first-download', 'first-upload-finished', 'album', 'single'])
})

test('rejected work releases every permit and queue overflow is bounded', async t => {
    const gate = createWeightedGate({ capacity: 1, maxQueued: 1 })
    const entered = deferred()
    const release = deferred()
    const first = gate(1, async () => { entered.resolve(); await release.promise; throw new Error('download failed') })
    const rejected = t.throwsAsync(first, { message: 'download failed' })
    await entered.promise
    const waiting = gate(1, async () => 'next')
    await t.throwsAsync(gate(1, async () => t.fail()), { code: 'MEDIA_QUEUE_FULL' })
    release.resolve()
    await rejected
    t.is(await waiting, 'next')
    t.is(await gate(1, async () => 'released'), 'released')
})

test('expired waiters are removed without consuming permits', async t => {
    const gate = createWeightedGate({ capacity: 1, waitMs: 10 })
    const release = deferred()
    const entered = deferred()
    const first = gate(1, async () => { entered.resolve(); await release.promise })
    await entered.promise
    await t.throwsAsync(gate(1, async () => t.fail()), { code: 'MEDIA_QUEUE_TIMEOUT' })
    release.resolve()
    await first
    t.is(await gate(1, async () => 'next'), 'next')
})

test('batch failure waits for sibling preparation before releasing its reservation', async t => {
    const gate = createWeightedGate({ capacity: 2 })
    const slow = deferred()
    const entered = deferred()
    let nextStarted = false
    const first = gate(2, () => prepareMediaBatch([0, 1], async index => {
        if (index === 0) throw new Error('missing media')
        entered.resolve()
        await slow.promise
    }))
    const failure = t.throwsAsync(first, { message: 'missing media' })
    await entered.promise
    const next = gate(1, async () => { nextStarted = true })
    await Promise.resolve()
    t.false(nextStarted)
    slow.resolve()
    await Promise.all([failure, next])
    t.true(nextStarted)
})

test('budget weights include actual in-memory photo, document, and video preparations', t => {
    t.is(mediaGroupBufferWeight([{ type: 'photo', media_r: 'url' }], 'r'), 0)
    t.is(mediaGroupBufferWeight([{ type: 'photo', media_r: 'url' }], 'dlr'), 1)
    t.is(mediaGroupBufferWeight([{ type: 'photo', media_t: 'id' }], 'dlr'), 0)
    t.is(mediaGroupBufferWeight([{ type: 'document', media_t: 'id' }], 'dlo'), 1)
    t.is(mediaGroupBufferWeight([{ type: 'video', media: 'https://example.test/video' }], 'r'), 1)
    t.is(mediaGroupBufferWeight([{ type: 'video', media_o: 'tmp/mp4/1.mp4' }], 'r'), 0)
    t.is(mediaGroupBufferWeight([{ type: 'photo', invaild: ['r'] }], 'r'), 1)
})
