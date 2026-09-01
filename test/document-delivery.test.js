import test from 'ava'
import en from '../lang/en.js'
import ja from '../lang/ja.js'
import zhHans from '../lang/zh-hans.js'
import zhHant from '../lang/zh-hant.js'
import {
    classifyDocumentFailure,
    documentFailureMessage,
    deliverDocument,
    publicDocumentRecoveryUrl
} from '../handlers/telegram/document-delivery.js'
import {
    deliverConfiguredDocument,
    deliverDocumentWithRefresh,
    immediateDocumentMode,
    staticDeliveryPlan
} from '../handlers/telegram/static-document-delivery.js'
import { extractPixivIds } from '../handlers/telegram/input-parser.js'
import { parseSettingsInput } from '../handlers/telegram/settings-command-parser.js'
import {
    createDefaultUserSettings,
    resolveRequestSettings
} from '../handlers/telegram/settings-resolver.js'

function deliveryFixture(overrides = {}) {
    const fetches = []
    const files = []
    const sends = []
    const extra = {
        caption: 'caption',
        reply_to_message_id: 10,
        message_thread_id: 20,
        disable_content_type_detection: true
    }
    const fixture = {
        mediaUrl: 'https://i.pximg.net/img-original/42_p0.png',
        extra,
        createLocalInputFile(path, filename) {
            const file = { source: path, filename }
            files.push(file)
            return file
        },
        async fetchRemoteFile(url) {
            fetches.push(url)
            return new Uint8Array([1, 2, 3])
        },
        createBufferedInputFile(data, filename) {
            const file = { source: data, filename }
            files.push(file)
            return file
        },
        async sendDocument(file, sendExtra) {
            sends.push({ file, extra: { ...sendExtra } })
            return { message_id: 99 }
        },
        ...overrides
    }
    return { fixture, fetches, files, sends, extra }
}

test('+file reaches document delivery and never selects photo mode', async t => {
    const text = 'https://www.pixiv.net/en/artworks/131538411+file'
    const base = createDefaultUserSettings()
    base.setting.default.telegraph = true
    base.setting.default.append_file = true
    base.setting.default.append_file_immediate = true
    const settings = resolveRequestSettings(
        base,
        parseSettingsInput(text),
        'private',
        { id: 7 }
    )
    const f = deliveryFixture()
    const ids = extractPixivIds(text)
    const plan = staticDeliveryPlan(settings)

    const configured = await deliverConfiguredDocument({
        settings,
        sendDocument: () => deliverDocument(f.fixture)
    })

    t.deepEqual(ids.illust, [131538411])
    t.is(configured.mode, 'file_only')
    t.is(configured.result.kind, 'sent')
    t.false(plan.sendPhoto)
    t.is(plan.immediateDocumentMode, 'file_only')
    t.false(plan.queueDocument)
    t.false(plan.appendAlbumDocuments)
    t.false(settings.telegraph)
    t.false(settings.append_file)
    t.false(settings.append_file_immediate)
    t.is(f.fetches.length, 1)
    t.is(f.sends.length, 1)
})

test('document upload retries once with a fresh InputFile and invariant options', async t => {
    let attempts = 0
    const f = deliveryFixture({
        async sendDocument(file, sendExtra) {
            f.sends.push({ file, extra: { ...sendExtra } })
            attempts++
            if (attempts === 1) {
                const error = new Error('connection reset')
                error.code = 'ECONNRESET'
                throw error
            }
            return { message_id: 100 }
        }
    })

    const result = await deliverDocument(f.fixture)

    t.is(result.kind, 'sent')
    t.is(result.attempts, 2)
    t.is(f.fetches.length, 1)
    t.is(f.files.length, 2)
    t.not(f.files[0], f.files[1])
    t.deepEqual(f.sends[0].extra, f.extra)
    t.deepEqual(f.sends[1].extra, f.extra)
})

test('stale download is returned to the illustration lifecycle without a send retry', async t => {
    const error = new Error('stale')
    error.code = 'PIXIV_MEDIA_STALE'
    const f = deliveryFixture({ async fetchRemoteFile() { throw error } })

    const result = await deliverDocument(f.fixture)

    t.is(result.kind, 'stale_media')
    t.is(result.code, 'PIXIV_MEDIA_STALE')
    t.is(result.attempts, 0)
    t.is(f.sends.length, 0)
})

test('stale document refreshes once and retries with the replacement URL', async t => {
    const sends = []
    let currentUrl = 'stale'
    let refreshes = 0
    const result = await deliverDocumentWithRefresh({
        async sendDocument() {
            sends.push(currentUrl)
            return currentUrl === 'stale'
                ? { kind: 'stale_media', code: 'PIXIV_MEDIA_STALE' }
                : { kind: 'sent', result: { message_id: 7 } }
        },
        async refresh() {
            refreshes++
            currentUrl = 'fresh'
            return true
        }
    })

    t.is(result.kind, 'sent')
    t.deepEqual(sends, ['stale', 'fresh'])
    t.is(refreshes, 1)
})

test('failed stale refresh never retries the old document URL', async t => {
    let sends = 0
    const result = await deliverDocumentWithRefresh({
        async sendDocument() {
            sends++
            return { kind: 'stale_media', code: 'PIXIV_MEDIA_STALE' }
        },
        async refresh() { return false }
    })

    t.is(result.kind, 'stale_media')
    t.is(sends, 1)
})

test('oversized and permission failures are actionable and are not retried', async t => {
    const oversized = new Error('request entity too large')
    oversized.response = { status: 413 }
    const large = deliveryFixture({ async fetchRemoteFile() { throw oversized } })
    const largeResult = await deliverDocument(large.fixture)

    t.is(largeResult.kind, 'failed')
    t.is(largeResult.code, 'TELEGRAM_DOCUMENT_TOO_LARGE')
    t.is(largeResult.recoveryUrl, large.fixture.mediaUrl)
    t.is(large.sends.length, 0)

    const denied = deliveryFixture({
        async sendDocument() {
            const error = new Error('Forbidden: bot cannot send documents')
            error.error_code = 400
            throw error
        }
    })
    const deniedResult = await deliverDocument(denied.fixture)
    t.is(deniedResult.code, 'TELEGRAM_DOCUMENT_PERMISSION_DENIED')
    t.is(deniedResult.attempts, 1)
})

test('exhausted transient upload returns a stable retry code', async t => {
    const f = deliveryFixture({
        async sendDocument() {
            const error = new Error('service unavailable')
            error.error_code = 503
            throw error
        }
    })

    const result = await deliverDocument(f.fixture)

    t.is(result.kind, 'failed')
    t.is(result.code, 'TELEGRAM_DOCUMENT_RETRY_EXHAUSTED')
    t.is(result.attempts, 2)
})

test('active flood gate stops document retry immediately', async t => {
    const f = deliveryFixture({
        async sendDocument() {
            throw {
                error_code: 429,
                description: 'Too Many Requests: shared flood gate is active',
                parameters: { retry_after: 120, flood_gate: true }
            }
        }
    })

    const result = await deliverDocument(f.fixture)

    t.is(result.kind, 'failed')
    t.is(result.code, 'TELEGRAM_FLOOD_GATE_ACTIVE')
    t.is(result.attempts, 1)
})

test('document mode distinguishes file-only, delayed append, and immediate append', t => {
    const resolve = text => resolveRequestSettings(
        createDefaultUserSettings(),
        parseSettingsInput(text),
        'private',
        { id: 7 }
    )

    const fileOnly = resolve('+file')
    const immediate = resolve('+afi')
    const delayed = resolve('+af')
    t.is(immediateDocumentMode(fileOnly), 'file_only')
    t.is(immediateDocumentMode(immediate), 'append_immediate')
    t.is(immediateDocumentMode(delayed), null)
    t.true(delayed.append_file)
    t.false(staticDeliveryPlan(immediate).appendAlbumDocuments)
    t.true(staticDeliveryPlan(delayed).appendAlbumDocuments)
    t.true(staticDeliveryPlan({
        ...immediate,
        telegraph: true
    }).appendAlbumDocuments)
})

test('+file overrides stored Telegraph and append output modes', t => {
    const base = createDefaultUserSettings()
    base.setting.default.telegraph = true
    base.setting.default.append_file = true
    base.setting.default.append_file_immediate = true
    const settings = resolveRequestSettings(
        base,
        parseSettingsInput('+file'),
        'private',
        { id: 7 }
    )

    t.true(settings.asfile)
    t.false(settings.telegraph)
    t.false(settings.album)
    t.false(settings.append_file)
    t.false(settings.append_file_immediate)
})

test('document failure localization stays synchronized and exposes stable codes', t => {
    const languages = [en, ja, zhHans, zhHant]
    const keys = [
        'document_too_large',
        'document_download_failed',
        'document_permission_failed',
        'document_format_failed',
        'document_topic_failed',
        'document_retry_exhausted',
        'document_delivery_failed'
    ]
    for (const language of languages) {
        for (const key of keys) t.truthy(language[key])
        t.regex(language.document_too_large, /TELEGRAM_DOCUMENT_TOO_LARGE/)
        t.regex(language.illust_404, /PIXIV_ILLUSTRATION_NOT_FOUND/)
        t.false(Object.hasOwn(language, 'file_too_large'))
    }
})

test('internal flood gate does not produce a user-facing recovery message', t => {
    t.is(documentFailureMessage({
        code: 'TELEGRAM_FLOOD_GATE_ACTIVE'
    }), null)
})

test('document classifier never treats a CDN stale response as confirmed deletion', t => {
    t.deepEqual(classifyDocumentFailure({ code: 'PIXIV_MEDIA_STALE' }), {
        kind: 'stale_media',
        code: 'PIXIV_MEDIA_STALE',
        retryable: false
    })
})

test('document failure message preserves the manual recovery URL', t => {
    t.deepEqual(documentFailureMessage({
        code: 'TELEGRAM_DOCUMENT_TOO_LARGE',
        recoveryUrl: 'https://proxy.example/42.png'
    }), [
        'document_too_large',
        'https://proxy.example/42.png'
    ])
})

test('unexpected document group failures retain a document-specific code', t => {
    t.deepEqual(documentFailureMessage({
        code: 'TELEGRAM_DOCUMENT_GROUP_SEND_FAILED'
    }), [
        'document_delivery_failed',
        'TELEGRAM_DOCUMENT_GROUP_SEND_FAILED'
    ])
})

test('manual recovery rewrites Pixiv image hosts through the configured proxy', t => {
    t.is(
        publicDocumentRecoveryUrl(
            'https://i.pximg.net/img-original/42.png',
            'pximg.example'
        ),
        'https://pximg.example/img-original/42.png'
    )
})
