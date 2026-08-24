import test from 'ava'
import {
    classifyMediaSendError,
    queueLocalMediaRetry,
    selectMediaRetryType
} from '../handlers/telegram/media-send-result.js'

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
