import test from 'ava'
import { autoRetry } from '@grammyjs/auto-retry'
import {
    createDeliveryTraceContext,
    createTelegramAttemptTraceTransformer,
    createTelegramQueueTraceTransformer,
    deliveryTraceEvent,
    logTelegramFailure,
    runWithDeliveryTrace,
    runWithDeliveryTraceFields,
    updateDeliveryTraceFields
} from '../handlers/telegram/delivery-telemetry.js'

function captureLogger() {
    const records = []
    return {
        records,
        log(prefix, json) {
            records.push({ level: 'log', prefix, record: JSON.parse(json) })
        },
        warn(prefix, json) {
            records.push({ level: 'warn', prefix, record: JSON.parse(json) })
        }
    }
}

test('delivery trace logs only allowlisted correlation fields', async t => {
    const logger = captureLogger()
    let now = 1_700_000_000_000
    const context = createDeliveryTraceContext({
        chat_id: -1003312324002,
        user_id: 42
    }, logger, {
        requestId: 'request-148795480',
        now: () => now
    })

    await runWithDeliveryTrace(context, async () => {
        now += 25
        deliveryTraceEvent('illustration_resolved', {
            illustIds: [148795480],
            resolvedCount: 1,
            deliveryMode: 'file_only',
            payload: { document: 'https://i.pximg.net/private.png' },
            caption: 'secret caption',
            token: 'bot123:secret'
        })
    })

    t.deepEqual(logger.records[0].record, {
        requestId: 'request-148795480',
        stage: 'illustration_resolved',
        timestamp: '2023-11-14T22:13:20.025Z',
        elapsedMs: 25,
        chatId: -1003312324002,
        userId: 42,
        illustIds: [148795480],
        resolvedCount: 1,
        deliveryMode: 'file_only'
    })
    t.false(JSON.stringify(logger.records).includes('pximg'))
    t.false(JSON.stringify(logger.records).includes('caption'))
    t.false(JSON.stringify(logger.records).includes('secret'))
})

test('Telegram transformers emit queued, started, and finished stages without payloads', async t => {
    const logger = captureLogger()
    let now = 1000
    const context = createDeliveryTraceContext({ chat_id: 12, user_id: 34 }, logger, {
        requestId: 'request-transformer',
        now: () => now
    })
    const attempt = createTelegramAttemptTraceTransformer({ now: () => now })
    const queued = createTelegramQueueTraceTransformer()
    const base = async () => {
        now += 40
        return { ok: true, result: { message_id: 1 } }
    }

    await runWithDeliveryTrace(context, async () => {
        updateDeliveryTraceFields({
            illustIds: [148795480],
            deliveryMode: 'file_only'
        })
        await runWithDeliveryTraceFields({ illustId: 148795480, page: 1 }, () => queued(
            (method, payload, signal) => attempt(base, method, payload, signal),
            'sendDocument',
            { chat_id: 12, document: 'https://i.pximg.net/private.png' }
        ))
    })

    t.deepEqual(logger.records.map(item => item.record.stage), [
        'telegram_queued',
        'api_started',
        'api_finished'
    ])
    t.is(logger.records[2].record.durationMs, 40)
    t.true(logger.records.every(item => item.record.deliveryMode === 'file_only'))
    t.true(logger.records.every(item => item.record.illustId === 148795480))
    t.true(logger.records.every(item => item.record.page === 1))
    t.is(logger.records[1].record.transportAttempt, 1)
    t.is(logger.records[2].record.transportAttempt, 1)
    t.false(JSON.stringify(logger.records).includes('pximg'))
    t.false(JSON.stringify(logger.records).includes('document'))
})

test('automatic retries emit distinct physical transport attempt numbers', async t => {
    const logger = captureLogger()
    const context = createDeliveryTraceContext({ chat_id: -100, user_id: 34 }, logger, {
        requestId: 'request-physical-attempts',
        now: () => 1000
    })
    const attempt = createTelegramAttemptTraceTransformer({ now: () => 1000 })
    const queued = createTelegramQueueTraceTransformer()
    const retry = autoRetry({
        maxDelaySeconds: 1,
        maxRetryAttempts: 1,
        rethrowHttpErrors: true
    })
    let calls = 0
    const raw = async () => {
        calls++
        return calls === 1
            ? { ok: false, error_code: 429, parameters: { retry_after: 0 } }
            : { ok: true, result: [{ message_id: 1 }] }
    }

    await runWithDeliveryTrace(context, () => queued(
        (method, payload, signal) => retry(
            (nextMethod, nextPayload, nextSignal) => attempt(
                raw,
                nextMethod,
                nextPayload,
                nextSignal
            ),
            method,
            payload,
            signal
        ),
        'sendMediaGroup',
        { chat_id: -100, media: [{ type: 'photo', media: 'redacted' }] }
    ))

    t.is(calls, 2)
    t.deepEqual(logger.records.map(item => item.record.stage), [
        'telegram_queued',
        'api_started',
        'api_failed',
        'api_started',
        'api_finished'
    ])
    t.deepEqual(
        logger.records
            .filter(item => item.record.stage === 'api_started')
            .map(item => item.record.transportAttempt),
        [1, 2]
    )
    t.false(JSON.stringify(logger.records).includes('redacted'))
})

test('Telegram failures retain safe codes but never serialize Grammy payloads', t => {
    const logger = captureLogger()
    const record = logTelegramFailure(logger, {
        method: 'sendMediaGroup',
        error_code: 400,
        description: "failed to send message #8 with WEBPAGE_CURL_FAILED",
        payload: {
            media: [{ media: 'https://i.pximg.net/private.jpg', caption: 'secret' }],
            token: 'bot123:secret'
        },
        parameters: { retry_after: 17 }
    }, { failedIndex: 8 })

    t.deepEqual(record, {
        stage: 'telegram_error',
        method: 'sendMediaGroup',
        errorCode: 'TELEGRAM_API_400',
        failedIndex: 8,
        retryAfter: 17
    })
    t.false(JSON.stringify(logger.records).includes('pximg'))
    t.false(JSON.stringify(logger.records).includes('secret'))
})

test('a broken process logger never interrupts user delivery', async t => {
    const logger = {
        log() {
            throw new Error('logger unavailable')
        },
        warn() {
            throw new Error('logger unavailable')
        }
    }
    const context = createDeliveryTraceContext({ chat_id: 1, user_id: 2 }, logger)

    await t.notThrowsAsync(() => runWithDeliveryTrace(context, async () => {
        deliveryTraceEvent('update_received')
        logTelegramFailure(logger, new Error('transport failed'))
    }))
    t.notThrows(() => logTelegramFailure(logger, new Error('transport failed')))
})
