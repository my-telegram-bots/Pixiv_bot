import test from 'ava'
import { createUgoiraConversionScheduler } from '../handlers/pixiv/ugoira-conversion-scheduler.js'

test('shares one in-flight conversion for the same output and releases it after completion', async t => {
    const scheduler = createUgoiraConversionScheduler()
    let calls = 0
    let complete
    const work = () => {
        calls++
        return new Promise(resolve => { complete = resolve })
    }

    const first = scheduler.schedule('42:mp4', work)
    const second = scheduler.schedule('42:mp4', work)
    t.is(first, second)
    t.is(calls, 1)
    complete('done')
    t.is(await first, 'done')
    t.is(scheduler.inFlightCount, 0)

    t.is(await scheduler.schedule('42:mp4', async () => 'again'), 'again')
})

test('keeps GIF qualities independent', async t => {
    const scheduler = createUgoiraConversionScheduler()
    const results = await Promise.all([
        scheduler.schedule('42:gif:small', async () => 'small'),
        scheduler.schedule('42:gif:large', async () => 'large')
    ])
    t.deepEqual(results, ['small', 'large'])
})

test('releases an early false result for a later conversion', async t => {
    const scheduler = createUgoiraConversionScheduler()
    t.false(await scheduler.schedule('42:mp4', async () => false))
    t.is(scheduler.inFlightCount, 0)
    t.is(await scheduler.schedule('42:mp4', async () => 'converted'), 'converted')
})

test('limits active conversion work', async t => {
    const scheduler = createUgoiraConversionScheduler({ maxConcurrent: 2 })
    let active = 0
    let peak = 0
    const releases = []
    const work = () => new Promise(resolve => {
        active++
        peak = Math.max(peak, active)
        releases.push(() => {
            active--
            resolve()
        })
    })
    const jobs = ['a', 'b', 'c'].map(key => scheduler.schedule(key, work))
    t.is(peak, 2)
    releases.shift()()
    await Promise.resolve()
    t.is(peak, 2)
    releases.shift()()
    await Promise.resolve()
    t.is(peak, 2)
    releases.shift()()
    await Promise.all(jobs)
})

test('retries failures a bounded number of times and releases the key', async t => {
    const scheduler = createUgoiraConversionScheduler({ maxRetries: 2 })
    let attempts = 0
    const error = await t.throwsAsync(scheduler.schedule('42:mp4', async () => {
        attempts++
        throw new Error('convert failed')
    }))
    t.is(error.message, 'convert failed')
    t.is(attempts, 3)
    t.is(scheduler.inFlightCount, 0)
})

test('does not retry stale-media errors', async t => {
    const scheduler = createUgoiraConversionScheduler({
        maxRetries: 3,
        shouldRetry: error => !error.stale
    })
    let attempts = 0
    await t.throwsAsync(scheduler.schedule('42:mp4', async () => {
        attempts++
        const error = new Error('stale')
        error.stale = true
        throw error
    }))
    t.is(attempts, 1)
    t.is(scheduler.inFlightCount, 0)
})
