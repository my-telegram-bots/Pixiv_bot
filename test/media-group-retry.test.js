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
        reportError: async () => ({
            decision: 'next_source',
            userNotified: false,
            errorCode: 'TELEGRAM_MEDIA_FETCH_FAILED'
        })
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
        retryRegular: false,
        terminal: false,
        failedIndex: null,
        code: 'TELEGRAM_MEDIA_SEND_FAILED'
    })
})

test('oversized local original retries the same album with Pixiv regular without an admin report', async t => {
    const mediaGroup = [134096350, 145292793, 148658870, 145135071].map((id, index) => ({
        type: 'photo',
        id,
        p: 0,
        media_o: `https://i.pximg.net/original-${index}.jpg`,
        media_r: `https://i.pximg.net/regular-${index}.jpg`
    }))
    const attemptedTypes = []
    const reports = []

    const result = await runMediaGroupAttempts({
        mediaGroup,
        mediaTypes: ['dlo'],
        buildMedia: async (items, requestedType) => {
            attemptedTypes.push(requestedType)
            return items.map((item, index) => ({
                media: requestedType === 'dlo'
                    ? new InputFile(Buffer.alloc(index + 1), `${item.id}.jpg`)
                    : item.media_r
            }))
        },
        sendMedia: async media => {
            if (attemptedTypes.at(-1) === 'dlo') {
                throw {
                    description: 'Bad Request: file of size 3 bytes is too big for a photo; the maximum size is 10485760 bytes',
                    payload: { media }
                }
            }
            return [{ message_id: 1 }]
        },
        classifyError: classifyMediaSendError,
        reportError: async (...args) => {
            reports.push(args)
            return { decision: 'next_source', userNotified: false }
        }
    })

    t.is(result.kind, 'sent')
    t.is(result.attempts, 2)
    t.deepEqual(attemptedTypes, ['dlo', 'r'])
    t.is(reports.length, 0)
})

test('oversized regular preserves the original failed album item and reports only the terminal attempt', async t => {
    const mediaGroup = [134096350, 145292793, 148658870, 145135071].map((id, index) => ({
        type: 'photo',
        id,
        p: index,
        media_o: `https://i.pximg.net/original-${index}.jpg`,
        media_r: `https://i.pximg.net/regular-${index}.jpg`
    }))
    const attemptedTypes = []
    const reports = []

    const result = await runMediaGroupAttempts({
        mediaGroup,
        mediaTypes: ['dlo'],
        buildMedia: async (items, requestedType) => {
            attemptedTypes.push(requestedType)
            return items.map((item, index) => ({
                media: requestedType === 'dlo'
                    ? new InputFile(Buffer.alloc(index + 1), `${item.id}.jpg`)
                    : item.media_r
            }))
        },
        sendMedia: async media => {
            if (attemptedTypes.at(-1) === 'dlo') {
                throw {
                    description: 'Bad Request: file of size 3 bytes is too big for a photo; the maximum size is 10485760 bytes',
                    payload: { media }
                }
            }
            throw {
                description: 'Bad Request: file of size 3 bytes is too big for a photo; the maximum size is 10485760 bytes'
            }
        },
        classifyError: classifyMediaSendError,
        reportError: async (error, fields) => {
            reports.push({ error, fields })
            return { decision: 'terminal', userNotified: false, errorCode: fields.errorCode }
        }
    })

    t.is(result.kind, 'failed')
    t.is(result.code, 'TELEGRAM_PHOTO_TOO_LARGE')
    t.is(result.attempts, 2)
    t.is(result.failedIndex, 2)
    t.deepEqual(attemptedTypes, ['dlo', 'r'])
    t.is(reports.length, 1)
    t.like(reports[0].fields, {
        attempt: 2,
        mediaType: 'r',
        failedIndex: 3,
        errorCode: 'TELEGRAM_PHOTO_TOO_LARGE'
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
