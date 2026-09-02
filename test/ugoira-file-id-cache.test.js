import test from 'ava'
import {
    cacheUgoiraFileId,
    UGOIRA_FILE_ID_CACHE_FAILED
} from '../handlers/telegram/ugoira-file-id-cache.js'

test('successful Ugoira delivery caches its file ID with a partial non-upsert update', async t => {
    const updates = []
    const result = await cacheUgoiraFileId({
        store: {
            collection: {
                illust: {
                    updateOne: async (...args) => updates.push(args)
                }
            }
        },
        illustration: { id: 148931948, type: 2 },
        sentMessage: { animation: { file_id: 'telegram-animation-file' } },
        reportError: async () => t.fail('successful cache write must not report an error'),
        chatId: 743061238,
        languageCode: 'en'
    })

    t.deepEqual(result, { attempted: true, cached: true })
    t.deepEqual(updates, [[
        { id: 148931948 },
        { $set: { type: 2, tg_file_id: 'telegram-animation-file' } }
    ]])
})

test('Ugoira file-ID cache failure is reported without rejecting delivered media', async t => {
    const reports = []
    const databaseError = new Error('title violates not-null constraint')
    const result = await cacheUgoiraFileId({
        store: {
            collection: {
                illust: {
                    updateOne: async () => { throw databaseError }
                }
            }
        },
        illustration: { id: 148931948, type: 2 },
        sentMessage: { animation: { file_id: 'telegram-animation-file' } },
        reportError: async (...args) => reports.push(args),
        chatId: 743061238,
        languageCode: 'en'
    })

    t.deepEqual(result, { attempted: true, cached: false })
    t.is(reports.length, 1)
    t.is(reports[0][0], databaseError)
    t.is(reports[0][1], 743061238)
    t.is(reports[0][3].illustId, 148931948)
    t.is(reports[0][3].method, 'cacheUgoiraFileId')
    t.is(reports[0][3].errorCode, UGOIRA_FILE_ID_CACHE_FAILED)
})

test('existing or absent Telegram file IDs do not touch PostgreSQL', async t => {
    let updates = 0
    const dependency = {
        store: {
            collection: {
                illust: {
                    updateOne: async () => { updates++ }
                }
            }
        },
        reportError: async () => t.fail('skipped cache write must not report'),
        chatId: 1,
        languageCode: 'en'
    }

    t.deepEqual(await cacheUgoiraFileId({
        ...dependency,
        illustration: { id: 1, tg_file_id: 'cached' },
        sentMessage: { animation: { file_id: 'new' } }
    }), { attempted: false, cached: false })
    t.deepEqual(await cacheUgoiraFileId({
        ...dependency,
        illustration: { id: 1 },
        sentMessage: { animation: {} }
    }), { attempted: false, cached: false })
    t.is(updates, 0)
})
