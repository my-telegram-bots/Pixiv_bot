import test from 'ava'
import { readFileSync } from 'fs'
import {
    cacheRegularIllustrationPageFileIds,
    collectRegularIllustrationPageFileIds,
    REGULAR_ILLUSTRATION_FILE_ID_CACHE_FAILED,
    runRegularIllustrationFileIdHook
} from '../handlers/telegram/regular-illustration-file-id-cache.js'

function message(fileId, width = 1000, height = 1000) {
    return {
        photo: [
            { file_id: `small-${fileId}`, width: 100, height: 100 },
            { file_id: fileId, width, height }
        ]
    }
}

test('regular photo responses retain their original illust and page alignment', t => {
    const grouped = collectRegularIllustrationPageFileIds([
        { type: 'photo', id: 101, p: 1 },
        { type: 'photo', id: 202, p: 0 },
        { type: 'photo', id: 101, p: 0 }
    ], [
        message('101-page-1'),
        message('202-page-0'),
        message('101-page-0')
    ])

    t.deepEqual(grouped, [
        { illustId: 101, pages: [
            { pageIndex: 1, fileId: '101-page-1' },
            { pageIndex: 0, fileId: '101-page-0' }
        ] },
        { illustId: 202, pages: [{ pageIndex: 0, fileId: '202-page-0' }] }
    ])
})

test('existing page cache, documents, malformed responses, and mismatches are silent no-ops', t => {
    t.deepEqual(collectRegularIllustrationPageFileIds([
        { type: 'photo', id: 101, p: 0, media_t: 'already-cached' },
        { type: 'document', id: 101, p: 1 },
        { type: 'photo', id: 101, p: 2 }
    ], [message('new'), message('document'), {}]), [])
    t.deepEqual(
        collectRegularIllustrationPageFileIds([{ type: 'photo', id: 101, p: 0 }], []),
        []
    )
})

test('cache writes use explicit page pairs and cache failure cannot change delivered output', async t => {
    const writes = []
    const cached = await cacheRegularIllustrationPageFileIds({
        mediaItems: [
            { type: 'photo', id: 101, p: 0 },
            { type: 'photo', id: 101, p: 2 }
        ],
        sentMessages: [message('page-0'), message('page-2')],
        writeFileIds: async (...args) => writes.push(args),
        reportError: async () => t.fail('successful cache write must not report'),
        chatId: 7,
        languageCode: 'en'
    })
    t.deepEqual(cached, { attempted: true, cached: true })
    t.deepEqual(writes, [[101, [
        { pageIndex: 0, fileId: 'page-0' },
        { pageIndex: 2, fileId: 'page-2' }
    ]]])

    const reports = []
    const databaseError = new Error('database unavailable')
    const failed = await cacheRegularIllustrationPageFileIds({
        mediaItems: [{ type: 'photo', id: 101, p: 0 }],
        sentMessages: [message('page-0')],
        writeFileIds: async () => { throw databaseError },
        reportError: async (...args) => reports.push(args),
        chatId: 7,
        languageCode: 'en'
    })
    t.deepEqual(failed, { attempted: true, cached: false })
    t.is(reports.length, 1)
    t.is(reports[0][0], databaseError)
    t.is(reports[0][3].notifyUser, false)
    t.is(reports[0][3].illustId, 101)
    t.is(reports[0][3].errorCode, REGULAR_ILLUSTRATION_FILE_ID_CACHE_FAILED)
})

test('post-send hook binds the sender runtime without producing another Telegram action', async t => {
    const writes = []
    const runtime = {
        writeFileIds: async (...args) => writes.push(args),
        reportError: async () => t.fail('successful hook must not report'),
        chatId: 7,
        ctx: { l: 'ja' }
    }

    const result = await runRegularIllustrationFileIdHook(
        runtime,
        [{ type: 'photo', id: 303, p: 4 }],
        [message('303-page-4')]
    )

    t.deepEqual(result, { attempted: true, cached: true })
    t.deepEqual(writes, [[303, [{ pageIndex: 4, fileId: '303-page-4' }]]])
})

test('the production sender installs the hook at both regular photo success boundaries', t => {
    const sender = readFileSync(
        new URL('../handlers/telegram/tg-sender.js', import.meta.url),
        'utf8'
    )
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')

    t.is((sender.match(/await runRegularIllustrationFileIdHook\(/g) || []).length, 2)
    t.true(app.includes('writeFileIds: process.env.DBLESS ? undefined : ' +
        'persistRegularIllustrationFileIds'))
})
