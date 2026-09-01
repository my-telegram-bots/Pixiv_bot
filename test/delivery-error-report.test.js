import test from 'ava'
import {
    ADMIN_ERROR_REPORT_LIMIT,
    ADMIN_FLOOD_OCCURRENCE_LIMIT,
    createAdminFloodReportAggregator,
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

test('request-level report keeps every requested illustration ahead of a long reason', async t => {
    const illustIds = Array.from({ length: 40 }, (_, index) => 121000000 + index)
    const report = formatAdminDeliveryError(new Error('x'.repeat(2000)), {
        requestId: 'request-many-illustrations',
        chatId: -1003312324002,
        method: 'sendMediaGroup',
        errorCode: 'TELEGRAM_RATE_LIMITED',
        illustIds
    })

    t.true(report.includes(`illust=${illustIds.join(',')}`))
    t.true(report.indexOf('illust=') < report.indexOf('reason='))
    t.true(report.length <= ADMIN_ERROR_REPORT_LIMIT)
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

test('oversized regular photo stays terminal after administrator reporting', async t => {
    const reports = []
    const bot = {
        api: {
            async sendMessage(chatId, text) {
                reports.push({ chatId, text })
                return { message_id: 1 }
            }
        }
    }
    const result = await catchily({
        ok: false,
        method: 'sendPhoto',
        error_code: 400,
        description: 'Bad Request: file of size 18247428 bytes is too big for a photo; the maximum size is 10485760 bytes'
    }, 10, 'en', {
        bot,
        masterId: 99,
        refetchApi: null,
        logger: quietLogger,
        notifyUser: false,
        mediaType: 'r',
        errorCode: 'TELEGRAM_PHOTO_TOO_LARGE'
    })

    t.deepEqual(result, {
        decision: CatchilyDecision.TERMINAL,
        userNotified: false,
        errorCode: 'TELEGRAM_PHOTO_TOO_LARGE'
    })
    t.is(reports.length, 1)
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
        floodAggregator: { queue() {} },
        illustId: 131538411,
        method: 'sendMediaGroup',
        attempt: 2
    })

    t.is(result.decision, CatchilyDecision.RETRY_TRANSPORT)
    t.is(result.userNotified, false)
    t.is(result.errorCode, 'TELEGRAM_RATE_LIMITED')
})

test('an active shared flood gate is terminal for the current item without another retry', async t => {
    const bot = { api: { sendMessage: async () => ({ message_id: 1 }) } }
    const result = await catchily({
        ok: false,
        method: 'sendMediaGroup',
        error_code: 429,
        description: 'Too Many Requests: shared flood gate is active',
        parameters: { retry_after: 120, flood_gate: true }
    }, -100, 'en', {
        bot,
        masterId: 99,
        refetchApi: null,
        logger: quietLogger,
        notifyUser: false,
        floodAggregator: { queue() {} },
        errorCode: 'TELEGRAM_MEDIA_SEND_FAILED'
    })

    t.deepEqual(result, {
        decision: CatchilyDecision.TERMINAL,
        userNotified: false,
        errorCode: 'TELEGRAM_FLOOD_GATE_ACTIVE'
    })
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

test('same-chat flood reports are coalesced with a bounded occurrence count', async t => {
    const scheduled = []
    const reports = []
    let now = 0
    const aggregator = createAdminFloodReportAggregator({
        now: () => now,
        schedule: (callback, delayMs) => scheduled.push({ callback, delayMs })
    })
    const options = {
        error: {
            ok: false,
            error_code: 429,
            method: 'sendMediaGroup',
            description: 'Too Many Requests: retry after 5',
            parameters: { retry_after: 5 }
        },
        masterId: 99,
        sendMessage: async (_chatId, report) => reports.push(report),
        logger: quietLogger,
        floodAggregator: aggregator,
        chatId: -100,
        method: 'sendMediaGroup',
        illustIds: [131538411]
    }

    await reportAdminDeliveryError(options)
    await reportAdminDeliveryError(options)
    await reportAdminDeliveryError(options)
    t.is(scheduled.length, 1)
    t.is(reports.length, 0)

    now = 5000
    await scheduled[0].callback()
    t.is(reports.length, 1)
    t.true(reports[0].includes('occurrences=3'))
    t.true(reports[0].includes('retryAfter=5'))
    t.false(reports[0].includes('payload'))

    await reportAdminDeliveryError(options)
    t.is(reports.length, 1)
    t.is(scheduled.length, 2)
})

test('flood report occurrence count is capped and report delivery failure is contained', async t => {
    const scheduled = []
    const warnings = []
    let now = 0
    const aggregator = createAdminFloodReportAggregator({
        now: () => now,
        schedule: (callback, delayMs) => scheduled.push({ callback, delayMs })
    })
    const options = {
        error: {
            ok: false,
            error_code: 429,
            method: 'sendMediaGroup',
            description: 'Too Many Requests: retry after 1',
            parameters: { retry_after: 1 }
        },
        masterId: 99,
        sendMessage: async () => { throw new Error('admin blocked') },
        logger: { log() {}, warn: (...args) => warnings.push(args) },
        floodAggregator: aggregator,
        chatId: -100,
        method: 'sendMediaGroup'
    }

    for (let index = 0; index < ADMIN_FLOOD_OCCURRENCE_LIMIT + 2; index++) {
        await reportAdminDeliveryError(options)
    }
    t.is(scheduled.length, 1)

    now = 1000
    await t.notThrowsAsync(() => scheduled[0].callback())
    t.is(warnings.length, 1)
    t.true(warnings[0].join(' ').includes('ADMIN_ERROR_REPORT_FAILED'))
})
