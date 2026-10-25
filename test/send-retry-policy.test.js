import test from 'ava'
import { autoRetry } from '@grammyjs/auto-retry'
import { TELEGRAM_AUTO_RETRY_OPTIONS } from '../handlers/telegram/transport-policy.js'
import { deliverPhoto } from '../handlers/telegram/photo-delivery.js'
import { deliverDocument } from '../handlers/telegram/document-delivery.js'
import { runMediaGroupAttempts } from '../handlers/telegram/media-group-retry.js'
import { classifyMediaSendError } from '../handlers/telegram/media-send-result.js'

const candidates = [{ type: 'r', source: 'regular' }, { type: 'o', source: 'original' }]
const reportError = async (_error, fields) => ({ errorCode: fields.errorCode, userNotified: true })
function photo(send, prepare = item => item.source) {
    return deliverPhoto({ candidates, prepare, send, reportError })
}
function album(send) {
    return runMediaGroupAttempts({
        mediaGroup: [{ type: 'photo', media_r: 'regular', media_o: 'original' }],
        mediaTypes: ['r', 'o', 'dlr'], buildMedia: async items => items,
        sendMedia: send, classifyError: classifyMediaSendError, reportError
    })
}
function document(send) {
    return deliverDocument({
        mediaUrl: 'https://example.test/document', extra: {}, fetchRemoteFile: async () => new Uint8Array([1]),
        createBufferedInputFile: data => data, sendDocument: send, reportError
    })
}

for (const [name, deliver] of [['photo', photo], ['album', album], ['document', document]]) {
    test(`${name} never replays an uncertain send or an exhausted flood response`, async t => {
        for (const error of [new Error('timeout'), { code: 'ECONNRESET' }, { error_code: 503 }, { error_code: 429 }]) {
            let sends = 0
            const result = await deliver(async () => { sends++; throw error })
            t.is(result.kind, 'failed')
            t.is(sends, 1)
        }
    })
    test(`${name} shares the transport retry budget instead of multiplying it`, async t => {
        let physicalCalls = 0
        const retry = autoRetry(TELEGRAM_AUTO_RETRY_OPTIONS)
        const result = await deliver(async () => {
            const response = await retry(async () => {
                physicalCalls++
                return { ok: false, error_code: 429, parameters: { retry_after: 0 } }
            }, 'sendPhoto', {})
            throw response
        })
        t.is(result.kind, 'failed')
        t.is(physicalCalls, 2)
    })
}

test('transport server failure returns immediately without replay', async t => {
    let sends = 0
    const retry = autoRetry(TELEGRAM_AUTO_RETRY_OPTIONS)
    const result = await retry(async () => { sends++; return { ok: false, error_code: 500 } }, 'sendMediaGroup', {})
    t.is(result.error_code, 500)
    t.is(sends, 1)
})

test('photo preparation failure can switch source before sending', async t => {
    const sends = []
    const result = await photo(async value => { sends.push(value); return { message_id: 1 } }, async item => {
        if (item.type === 'r') throw new Error('download timeout')
        return item.source
    })
    t.is(result.kind, 'sent')
    t.deepEqual(sends, ['original'])
})

test('photo source fallback requires an explicit Telegram media rejection', async t => {
    let sends = 0
    const result = await photo(async () => {
        if (++sends === 1) throw { error_code: 400, description: 'WEBPAGE_CURL_FAILED' }
        return { message_id: 1 }
    })
    t.is(result.kind, 'sent')
    t.is(sends, 2)
})

test('terminal album failure preserves successful specific notification', async t => {
    const result = await album(async () => {
        throw { error_code: 400, description: 'not enough rights to send' }
    })
    t.true(result.userNotified)
    t.is(result.code, 'TELEGRAM_PERMISSION_DENIED')
})
