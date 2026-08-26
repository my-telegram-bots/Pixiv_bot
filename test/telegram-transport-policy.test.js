import test from 'ava'
import { autoRetry } from '@grammyjs/auto-retry'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import { readFileSync } from 'node:fs'
import { createDeliveryThrottler } from '../bot.js'
import {
    TELEGRAM_AUTO_RETRY_OPTIONS,
    TELEGRAM_CLIENT_TIMEOUT_SECONDS,
    TELEGRAM_THROTTLER_OPTIONS,
    TELEGRAM_UPDATE_CONCURRENCY
} from '../handlers/telegram/transport-policy.js'

test('Telegram client and automatic retry budgets are finite', t => {
    t.true(Number.isInteger(TELEGRAM_UPDATE_CONCURRENCY))
    t.true(TELEGRAM_UPDATE_CONCURRENCY > 1)
    t.true(Number.isFinite(TELEGRAM_CLIENT_TIMEOUT_SECONDS))
    t.true(TELEGRAM_CLIENT_TIMEOUT_SECONDS > 0)
    t.true(Number.isFinite(TELEGRAM_AUTO_RETRY_OPTIONS.maxDelaySeconds))
    t.true(Number.isFinite(TELEGRAM_AUTO_RETRY_OPTIONS.maxRetryAttempts))
    t.true(TELEGRAM_AUTO_RETRY_OPTIONS.rethrowHttpErrors)
    t.true(TELEGRAM_THROTTLER_OPTIONS.group.maxConcurrent > 1)
    t.true(TELEGRAM_THROTTLER_OPTIONS.out.maxConcurrent > 1)
    t.is(TELEGRAM_THROTTLER_OPTIONS.group.minTime, 1000)
    t.is(TELEGRAM_THROTTLER_OPTIONS.group.reservoir, 20)
    t.false(Object.isFrozen(TELEGRAM_THROTTLER_OPTIONS))
    t.false(Object.isFrozen(TELEGRAM_THROTTLER_OPTIONS.global))
    t.false(Object.isFrozen(TELEGRAM_THROTTLER_OPTIONS.group))
    t.false(Object.isFrozen(TELEGRAM_THROTTLER_OPTIONS.out))
})

test('application starts the concurrent runner with the explicit update budget', t => {
    const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8')

    t.true(source.includes('grammyjsRun(bot, TELEGRAM_UPDATE_CONCURRENCY)'))
    t.false(source.includes('sequentialize('))
})

test('configured throttler can handle the first Telegram API call', async t => {
    const throttler = apiThrottler(TELEGRAM_THROTTLER_OPTIONS)
    const response = await throttler(
        async () => ({ ok: true }),
        'sendMessage',
        { chat_id: 123, text: 'test' }
    )

    t.true(response.ok)
})

test('status calls cannot queue ahead of user media delivery', async t => {
    const throttler = createDeliveryThrottler({
        global: { maxConcurrent: 1, minTime: 100 },
        group: { maxConcurrent: 1 },
        out: { maxConcurrent: 1 }
    })
    let mediaStartedAt
    const startedAt = Date.now()
    const previous = async method => {
        if (method === 'sendChatAction') {
            await new Promise(resolve => setTimeout(resolve, 100))
        } else if (method === 'sendMediaGroup') {
            mediaStartedAt = Date.now()
        }
        return { ok: true }
    }

    const action = throttler(previous, 'sendChatAction', { chat_id: 123, action: 'upload_photo' })
    await new Promise(resolve => setTimeout(resolve, 5))
    const media = throttler(previous, 'sendMediaGroup', { chat_id: 123, media: [] })
    await Promise.all([media, action])

    t.true(mediaStartedAt - startedAt < 80)
})

test('long Telegram flood waits return immediately to the sender lifecycle', async t => {
    let calls = 0
    const retry = autoRetry(TELEGRAM_AUTO_RETRY_OPTIONS)
    const response = await retry(async () => {
        calls++
        return {
            ok: false,
            error_code: 429,
            parameters: { retry_after: 120 }
        }
    }, 'sendDocument', {})

    t.is(calls, 1)
    t.is(response.error_code, 429)
})
