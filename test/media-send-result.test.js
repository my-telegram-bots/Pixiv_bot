import test from 'ava'
import { InputFile } from 'grammy'
import {
    buildPhotoCandidates,
    classifyMediaSendError,
    queueLocalMediaRetry,
    selectMediaRetryType
} from '../handlers/telegram/media-send-result.js'

test('photo candidates never use square-cropped Pixiv thumbnails', t => {
    const candidates = buildPhotoCandidates({
        media_r: 'https://i.pximg.net/regular.jpg',
        media_o: 'https://i.pximg.net/original.jpg',
        media_s: 'https://i.pximg.net/square-thumb.jpg'
    })

    t.deepEqual(candidates.map(candidate => candidate.type), ['r', 'o', 'dlr', 'dlo'])
    t.false(candidates.some(candidate => candidate.source.includes('square-thumb')))
})

test('Telegram remote fetch failures use local upload before any stale-media refresh', t => {
    const result = classifyMediaSendError({
        description: "Bad Request: failed to send message #7 with the error message 'WEBPAGE_CURL_FAILED'"
    })

    t.false(result.stale)
    t.true(result.retryLocal)
    t.is(result.failedIndex, 6)
    t.is(result.code, 'TELEGRAM_MEDIA_FETCH_FAILED')
})

test('Telegram empty remote media also uses local upload before refresh', t => {
    const result = classifyMediaSendError({
        description: "Bad Request: failed to send message #3 with the error message 'WEBPAGE_MEDIA_EMPTY'"
    })

    t.false(result.stale)
    t.true(result.retryLocal)
    t.is(result.failedIndex, 2)
})

test('media error classifier does not refresh generic Telegram failures', t => {
    const result = classifyMediaSendError({ description: 'Bad Request: caption is too long' })

    t.false(result.stale)
    t.false(result.retryLocal)
    t.is(result.failedIndex, null)
    t.is(result.code, 'TELEGRAM_MEDIA_SEND_FAILED')
})

test('oversized local original identifies the exact upload and retries Pixiv regular', t => {
    const result = classifyMediaSendError({
        description: 'Bad Request: file of size 3 bytes is too big for a photo; the maximum size is 10485760 bytes',
        payload: {
            media: [
                { media: new InputFile(Buffer.alloc(1), 'first.jpg') },
                { media: new InputFile(Buffer.alloc(3), 'oversized.jpg') },
                { media: new InputFile(Buffer.alloc(2), 'last.jpg') }
            ]
        }
    }, 'dlo')

    t.false(result.terminal)
    t.true(result.retryRegular)
    t.is(result.failedIndex, 1)
    t.is(result.code, 'TELEGRAM_PHOTO_TOO_LARGE')
})

test('oversized Pixiv regular is terminal and never retries original', t => {
    const result = classifyMediaSendError({
        description: 'Bad Request: file of size 18247428 bytes is too big for a photo; the maximum size is 10485760 bytes'
    }, 'r')

    t.true(result.terminal)
    t.false(result.retryRegular)
    t.is(result.code, 'TELEGRAM_PHOTO_TOO_LARGE')
})

test('active flood gate is terminal and cannot re-enter the sender retry loop', t => {
    const result = classifyMediaSendError({
        error_code: 429,
        description: 'Too Many Requests: shared flood gate is active',
        parameters: { retry_after: 120, flood_gate: true }
    })

    t.true(result.terminal)
    t.false(result.retryLocal)
    t.is(result.code, 'TELEGRAM_FLOOD_GATE_ACTIVE')
})

test('media fetch error code is stale without relying on message text', t => {
    const result = classifyMediaSendError({ code: 'PIXIV_MEDIA_STALE', message: 'not found' })
    t.true(result.stale)
    t.false(result.retryLocal)
})

test('album retry swaps only the failed remote item for a local upload', t => {
    const mediaGroup = [
        { id: 1, p: 0 },
        { id: 2, p: 0 },
        { id: 3, p: 0 }
    ]
    const queue = ['o', 'dlr', 'dlo']

    t.true(queueLocalMediaRetry(mediaGroup, 1, 'r', queue))
    t.deepEqual(queue, ['r', 'o', 'dlr', 'dlo'])
    t.is(selectMediaRetryType(mediaGroup[0], 'r'), 'r')
    t.is(selectMediaRetryType(mediaGroup[1], 'r'), 'dlr')
    t.is(selectMediaRetryType(mediaGroup[2], 'r'), 'r')
})

test('document album remote fetch failure selects only that item for local upload', t => {
    const mediaGroup = [
        { type: 'document', id: 1, media_o: 'https://example/1.jpg' },
        { type: 'document', id: 2, media_o: 'https://example/2.jpg' }
    ]
    const classification = classifyMediaSendError({
        description: "Bad Request: failed to send message #2 with the error message 'WEBPAGE_CURL_FAILED'"
    })
    const queue = ['dlo']

    t.true(classification.retryLocal)
    t.true(queueLocalMediaRetry(mediaGroup, classification.failedIndex, 'o', queue))
    t.deepEqual(queue, ['o', 'dlo'])
    t.is(selectMediaRetryType(mediaGroup[0], 'o'), 'o')
    t.is(selectMediaRetryType(mediaGroup[1], 'o'), 'dlo')
})
