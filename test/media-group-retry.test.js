import test from 'ava'
import { InputFile } from 'grammy'
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
    const diagnostics = []
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
        reportError: async () => true,
        logAttempt: items => diagnostics.push(items)
    })

    t.is(result.kind, 'sent')
    t.is(result.attempts, 2)
    t.true(attempts[0].every(item => typeof item.media === 'string'))
    t.true(attempts[1].every((item, index) =>
        index === 6 ? item.media instanceof InputFile : typeof item.media === 'string'
    ))
    t.deepEqual(diagnostics[1][6], {
        albumIndex: 7,
        illustId: 148841251,
        page: 0,
        retry: 2,
        mediaType: 'dlr',
        mode: 'local'
    })
    t.true(diagnostics[1].every((item, index) =>
        item.mode === (index === 6 ? 'local' : 'remote')
    ))
    t.false(JSON.stringify(diagnostics).includes('https://'))
})

test('ordinary Error descriptions are safe to classify', t => {
    const error = new Error('ordinary processing failure')

    t.is(telegramErrorDescription(error), 'ordinary processing failure')
    t.deepEqual(classifyMediaSendError(error), {
        stale: false,
        retryLocal: false,
        failedIndex: null,
        code: 'TELEGRAM_MEDIA_SEND_FAILED'
    })
})

test('Telegram flood wait reads parameters.retry_after', t => {
    t.is(telegramRetryAfter({ parameters: { retry_after: 17 } }), 17)
    t.is(telegramRetryAfter({
        description: { parameters: { retry_after: 99 } }
    }), null)
})
