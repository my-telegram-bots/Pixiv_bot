import test from 'ava'
import {
    ADMIN_ERROR_REPORT_LIMIT,
    formatAdminDeliveryError,
    reportAdminDeliveryError
} from '../handlers/telegram/delivery-error-report.js'
import {
    createDeliveryTraceContext,
    runWithDeliveryTrace
} from '../handlers/telegram/delivery-telemetry.js'
import {
    CatchilyDecision,
    handleTelegramError as catchily
} from '../handlers/telegram/telegram-error-handler.js'

const quietLogger = { log() {}, warn() {} }

test('administrator report is correlated, bounded, and excludes sensitive error text', async t => {
    const context = createDeliveryTraceContext({ chat_id: -42, user_id: 7 }, quietLogger, {
        requestId: 'request-safe-report'
    })
    const error = Object.assign(
        new Error(`caption=https://i.pximg.net/private.jpg payload=secret 123456:${'x'.repeat(40)} ${'a'.repeat(2000)}`),
        { method: 'sendMediaGroup', error_code: 400, payload: { token: 'never-serialize' } }
    )

    context.illustIds = [131538411, 131538412]
    const report = await runWithDeliveryTrace(context, () => formatAdminDeliveryError(error, {
        attempt: 2,
        failedIndex: 7
    }))
    t.true(report.includes('request=request-safe-report'))
    t.true(report.includes('chat=-42'))
    t.true(report.includes('illust=131538411,131538412'))
    t.true(report.includes('method=sendMediaGroup'))
    t.true(report.includes('attempt=2'))
    t.true(report.includes('failedItem=7'))
    t.true(report.length <= ADMIN_ERROR_REPORT_LIMIT)
    t.false(report.includes('pximg'))
    t.false(report.includes('never-serialize'))
    t.false(report.includes('123456:'))
})

test('item-level report prefers the exact illustration and page over request IDs', async t => {
    const context = createDeliveryTraceContext({ chat_id: 42, user_id: 7 }, quietLogger, {
        requestId: 'request-item-report'
    })
    context.illustIds = [131538411, 131538412]
    context.illustId = 131538412
    context.page = 3

    const report = await runWithDeliveryTrace(
        context,
        () => formatAdminDeliveryError(new Error('failed'), { method: 'sendDocument' })
    )
    t.true(report.includes('illust=131538412'))
    t.true(report.includes('page=3'))
    t.true(report.includes('method=sendDocument'))
    t.false(report.includes('131538411,'))
})

test('Grammy-style and ordinary errors each reach the administrator exactly once through catchily', async t => {
    const reports = []
    const bot = {
        api: {
            async sendMessage(chatId, text) {
                reports.push({ chatId, text })
                return { message_id: reports.length }
            }
        }
    }
    const ordinary = await catchily(new Error('ordinary failure'), 10, 'en', {
        bot,
        masterId: 99,
        refetchApi: null,
        logger: quietLogger,
        notifyUser: false
    })
    const grammy = await catchily({
        ok: false,
        method: 'sendPhoto',
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user',
        payload: { photo: 'https://i.pximg.net/private.jpg' }
    }, 11, 'en', {
        bot,
        masterId: 99,
        refetchApi: null,
        logger: quietLogger,
        notifyUser: false
    })

    t.is(ordinary.decision, CatchilyDecision.NEXT_SOURCE)
    t.is(grammy.decision, CatchilyDecision.TERMINAL)
    t.is(reports.length, 2)
    t.true(reports.every(item => item.chatId === 99))
    t.false(reports.some(item => item.text.includes('pximg')))
})

test('administrator report failure is contained and never changes catchily decision', async t => {
    const bot = { api: { sendMessage: async () => { throw new Error('admin blocked') } } }
    const result = await catchily(new Error('transport failed'), 10, 'en', {
        bot,
        masterId: 99,
        refetchApi: null,
        logger: quietLogger,
        notifyUser: false
    })

    t.deepEqual(result, {
        decision: CatchilyDecision.NEXT_SOURCE,
        userNotified: false,
        errorCode: 'TELEGRAM_MEDIA_SEND_FAILED'
    })
})

test('administrator report failure does not change finite flood-wait retry decision', async t => {
    const bot = { api: { sendMessage: async () => { throw new Error('admin blocked') } } }
    const result = await catchily({
        ok: false,
        method: 'sendMediaGroup',
        error_code: 429,
        description: 'Too Many Requests: retry later',
        parameters: { retry_after: 3 }
    }, 10, 'en', {
        bot,
        masterId: 99,
        refetchApi: null,
        logger: quietLogger,
        notifyUser: false,
        illustId: 131538411,
        method: 'sendMediaGroup',
        attempt: 2
    })

    t.is(result.decision, CatchilyDecision.RETRY_TRANSPORT)
    t.is(result.userNotified, false)
})

test('ordinary HTTP failure keeps its status code and requested illustration ID', async t => {
    const reports = []
    const bot = { api: { sendMessage: async (chatId, text) => reports.push({ chatId, text }) } }
    const result = await catchily(Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404 }
    }), 5572294374, 'en', {
        bot,
        masterId: 99,
        refetchApi: null,
        logger: quietLogger,
        notifyUser: false,
        requestId: '2356a5d1-0a00-496e-aa80-2f11b83b5785',
        illustIds: [131538411],
        method: 'resolveIllustration',
        errorCode: 'PIXIV_DETAIL_REQUEST_FAILED'
    })

    t.is(result.errorCode, 'HTTP_404')
    t.is(reports.length, 1)
    t.true(reports[0].text.includes('request=2356a5d1-0a00-496e-aa80-2f11b83b5785'))
    t.true(reports[0].text.includes('illust=131538411'))
    t.true(reports[0].text.includes('method=resolveIllustration'))
    t.true(reports[0].text.includes('code=HTTP_404'))
})

test('standalone administrator reporter never throws when its send fails', async t => {
    await t.notThrowsAsync(() => reportAdminDeliveryError({
        error: new Error('failure'),
        masterId: 99,
        sendMessage: async () => { throw new Error('report failed') },
        logger: quietLogger
    }))
})
