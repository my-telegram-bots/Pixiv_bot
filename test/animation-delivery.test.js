import test from 'ava'
import { deliverAnimation } from '../handlers/telegram/animation-delivery.js'

test('explicit Telegram remote-fetch rejection permits one local upload', async t => {
    const sources = []
    const message = { message_id: 42 }
    const result = await deliverAnimation({
        media: 'remote', allowLocalFallback: true,
        send: async source => {
            sources.push(source)
            if (source === 'remote') throw { error_code: 400, description: 'Bad Request: WEBPAGE_CURL_FAILED' }
            return message
        },
        download: async source => { t.is(source, 'remote'); return 'local' },
        reportError: async () => t.fail('recovered error must not notify')
    })
    t.deepEqual(sources, ['remote', 'local'])
    t.deepEqual(result, { kind: 'sent', result: message })
})

test('uncertain sends, flood limits, and permission errors never trigger local upload', async t => {
    const errors = [
        new Error('Request timed out'),
        { error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 30 } },
        { error_code: 403, description: 'Forbidden: bot was blocked by the user' },
        { error_code: 500, description: 'Internal Server Error' },
        { code: 'TELEGRAM_FLOOD_GATE_ACTIVE' },
        new Error('WEBPAGE_CURL_FAILED')
    ]
    for (const error of errors) {
        let attempts = 0
        const result = await deliverAnimation({
            media: 'remote', allowLocalFallback: true,
            send: async () => { attempts++; throw error },
            download: async () => t.fail('must not download after uncertain or terminal send'),
            reportError: async received => { t.is(received, error); return { errorCode: 'TEST_SEND_FAILED', userNotified: true } }
        })
        t.is(attempts, 1)
        t.is(result.kind, 'failed')
        t.is(result.code, 'TEST_SEND_FAILED')
        t.true(result.userNotified)
    }
})

test('fallback failure is reported once and preserves notification and classification', async t => {
    let attempts = 0
    let reports = 0
    const failure = { error_code: 400, description: 'Bad Request: not enough rights to send' }
    const result = await deliverAnimation({
        media: 'remote', allowLocalFallback: true,
        send: async () => {
            if (++attempts === 1) throw { error_code: 400, description: 'WEBPAGE_MEDIA_EMPTY' }
            throw failure
        },
        download: async () => 'local',
        reportError: async error => {
            reports++
            t.is(error, failure)
            return { errorCode: 'TELEGRAM_PERMISSION_DENIED', userNotified: true }
        }
    })
    t.is(attempts, 2)
    t.is(reports, 1)
    t.is(result.code, 'TELEGRAM_PERMISSION_DENIED')
    t.true(result.userNotified)
})

test('stale downloaded media returns to the owning refresh lifecycle', async t => {
    const result = await deliverAnimation({
        media: 'remote', allowLocalFallback: true,
        send: async () => { throw { error_code: 400, description: 'WEBPAGE_MEDIA_EMPTY' } },
        download: async () => { throw { code: 'PIXIV_MEDIA_STALE' } },
        reportError: async () => t.fail('stale media is handled by the refresh lifecycle')
    })
    t.is(result.kind, 'stale_media')
    t.is(result.code, 'PIXIV_MEDIA_STALE')
})

test('reporter rejection cannot replace the original animation failure', async t => {
    const error = { error_code: 403, description: 'Forbidden: bot blocked' }
    const logs = []
    const result = await deliverAnimation({
        media: 'cached-file-id', allowLocalFallback: false,
        send: async () => { throw error },
        reportError: async () => { throw new Error('report failed') },
        logger: { warn: (...args) => logs.push(args) }
    })
    t.is(result.error, error)
    t.is(result.code, 'TELEGRAM_FORBIDDEN')
    t.false(result.userNotified)
    t.is(logs.length, 2)
})
