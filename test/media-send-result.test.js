import test from 'ava'
import { classifyMediaSendError } from '../handlers/telegram/media-send-result.js'

test('media error classifier identifies stale Telegram media and failed index', t => {
    const result = classifyMediaSendError({
        description: "Bad Request: failed to send message #3 with the error message 'WEBPAGE_MEDIA_EMPTY'"
    })

    t.true(result.stale)
    t.is(result.failedIndex, 2)
    t.is(result.code, 'PIXIV_MEDIA_STALE')
})

test('media error classifier does not refresh generic Telegram failures', t => {
    const result = classifyMediaSendError({ description: 'Bad Request: caption is too long' })

    t.false(result.stale)
    t.is(result.failedIndex, null)
    t.is(result.code, 'TELEGRAM_MEDIA_SEND_FAILED')
})

test('media fetch error code is stale without relying on message text', t => {
    const result = classifyMediaSendError({ code: 'PIXIV_MEDIA_STALE', message: 'not found' })
    t.true(result.stale)
})
