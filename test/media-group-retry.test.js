import test from 'ava'
import { InputFile } from 'grammy'
import { readFileSync } from 'node:fs'
import {
    classifyMediaSendError,
    selectMediaRetryType,
    telegramErrorDescription,
    telegramRetryAfter
} from '../handlers/telegram/media-send-result.js'
import {
    runMediaGroupAttempts
} from '../handlers/telegram/media-group-retry.js'

test('album item #7 curl failure retries only item #7 as a local upload', async t => {
    const mediaGroup = Array.from({ length: 10 }, (_, index) => ({
        type: 'photo',
        id: index === 6 ? 148841251 : 148841245 + index,
        p: 0,
        media_r: `https://i.pximg.net/example-${index + 1}.jpg`
    }))
    const attempts = []
    let sendCount = 0

    const result = await runMediaGroupAttempts({
        mediaGroup,
        mediaTypes: ['r'],
        buildMedia: async (items, requestedType) => items.map(item => {
            const selectedType = selectMediaRetryType(item, requestedType)
            return {
                id: item.id,
                media: selectedType.startsWith('dl')
                    ? new InputFile(Buffer.from(item.media_r), `${item.id}.jpg`)
                    : item.media_r
            }
        }),
        sendMedia: async media => {
            attempts.push(media)
            sendCount += 1
            if (sendCount === 1) {
                throw {
                    description: "Bad Request: failed to send message #7 with the error message 'WEBPAGE_CURL_FAILED'"
                }
            }
            return [{ message_id: 1 }]
        },
        classifyError: classifyMediaSendError,
        reportError: async () => true
    })

    t.is(result.kind, 'sent')
    t.is(result.attempts, 2)
    t.true(attempts[0].every(item => typeof item.media === 'string'))
    t.true(attempts[1].every((item, index) =>
        index === 6 ? item.media instanceof InputFile : typeof item.media === 'string'
    ))
})

test('successful album attempts do not emit the removed multi-line attempt log', t => {
    const senderSource = readFileSync(
        new URL('../handlers/telegram/sender.js', import.meta.url),
        'utf8'
    )
    const retrySource = readFileSync(
        new URL('../handlers/telegram/media-group-retry.js', import.meta.url),
        'utf8'
    )

    t.false(senderSource.includes('[media-group-attempt]'))
    t.false(retrySource.includes('[media-group-attempt]'))
    t.false(retrySource.includes('logAttempt'))
})

test('ordinary Error descriptions are safe to classify', t => {
    const error = new Error('ordinary processing failure')

    t.is(telegramErrorDescription(error), 'ordinary processing failure')
    t.deepEqual(classifyMediaSendError(error), {
        stale: false,
        retryLocal: false,
        terminal: false,
        failedIndex: null,
        code: 'TELEGRAM_MEDIA_SEND_FAILED'
    })
})

test('reporting failure cannot block local retry of the failed album item', async t => {
    const mediaGroup = [{ type: 'photo', id: 1, p: 0, media_r: 'https://example.test/1.jpg' }]
    let sends = 0
    const result = await runMediaGroupAttempts({
        mediaGroup,
        mediaTypes: ['r'],
        buildMedia: async items => items,
        sendMedia: async () => {
            sends++
            if (sends === 1) {
                throw { description: 'failed to send message #1 with WEBPAGE_CURL_FAILED' }
            }
            return [{ message_id: 1 }]
        },
        classifyError: classifyMediaSendError,
        reportError: async () => {
            throw new Error('administrator unavailable')
        }
    })

    t.is(result.kind, 'sent')
    t.is(result.attempts, 2)
})

test('exhausted retry preserves actual attempts, code, and failed item', async t => {
    const result = await runMediaGroupAttempts({
        mediaGroup: [{ type: 'photo', id: 1, p: 0, media_r: 'https://example.test/1.jpg' }],
        mediaTypes: ['r'],
        maxAttempts: 1,
        buildMedia: async items => items,
        sendMedia: async () => {
            throw { description: 'failed to send message #1 with WEBPAGE_CURL_FAILED' }
        },
        classifyError: classifyMediaSendError,
        reportError: async () => ({
            decision: 'next_source',
            userNotified: false,
            errorCode: 'TELEGRAM_MEDIA_FETCH_FAILED'
        })
    })

    t.is(result.kind, 'failed')
    t.is(result.code, 'TELEGRAM_MEDIA_RETRY_EXHAUSTED')
    t.is(result.attempts, 1)
    t.is(result.failedIndex, 0)
})

test('Telegram flood wait reads parameters.retry_after', t => {
    t.is(telegramRetryAfter({ parameters: { retry_after: 17 } }), 17)
    t.is(telegramRetryAfter({
        description: { parameters: { retry_after: 99 } }
    }), null)
})
