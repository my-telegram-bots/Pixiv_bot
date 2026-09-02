import test from 'ava'
import {
    GUEST_PREWARM_MAX_WORKS,
    buildGuestPrewarmBatches,
    createGuestMediaPrewarmer,
    guestMediaCacheStartupMessage,
    mapPrewarmResponse
} from '../handlers/telegram/guest-media-prewarmer.js'

function illustration(id, pages, cached = []) {
    return {
        id,
        type: 0,
        imgs_: {
            regular_urls: Array.from(
                { length: pages },
                (_, page) => `https://i.pximg.net/${id}_p${page}.jpg`
            ),
            tg_file_ids: Array.from(
                { length: pages },
                (_, page) => cached[page] || null
            )
        }
    }
}

function photoMessage(page) {
    return {
        photo: [
            { file_id: `small-${page}`, width: 100, height: 100 },
            { file_id: `large-${page}`, width: 1000, height: 1000 }
        ]
    }
}

for (const [pages, sizes] of [
    [1, [1]],
    [2, [2]],
    [10, [10]],
    [11, [10, 1]],
    [20, [10, 10]],
    [21, [10, 10, 1]],
    [50, [10, 10, 10, 10, 10]],
    [63, [10, 10, 10, 10, 10]]
]) {
    test(`guest media batches ${pages} pages as ${sizes.join('+')}`, t => {
        t.deepEqual(
            buildGuestPrewarmBatches(illustration(1000 + pages, pages)).map(batch => batch.length),
            sizes
        )
    })
}

test('prewarm response maps the largest returned photo to the explicit page index', t => {
    const mapped = mapPrewarmResponse(
        [{ pageIndex: 7 }, { pageIndex: 2 }],
        [photoMessage(7), photoMessage(2)]
    )
    t.deepEqual(mapped, [
        { pageIndex: 7, fileId: 'large-7' },
        { pageIndex: 2, fileId: 'large-2' }
    ])
})

test('21-page prewarm uses 10+10+1 and writes each response to its original pages', async t => {
    const calls = []
    const writes = []
    const bot = { api: {
        sendMediaGroup: async (chatId, media) => {
            calls.push({ method: 'group', chatId, size: media.length })
            return media.map(item => photoMessage(Number(item.media.match(/p(\d+)\.jpg$/)[1])))
        },
        sendPhoto: async (chatId, media) => {
            calls.push({ method: 'photo', chatId, size: 1 })
            return photoMessage(Number(media.match(/p(\d+)\.jpg$/)[1]))
        }
    } }
    const prewarmer = createGuestMediaPrewarmer({
        bot,
        cacheChatIds: [-1001],
        writeFileIds: async (illustId, pages) => writes.push({ illustId, pages }),
        logger: { warn() {} }
    })

    t.true(prewarmer.enqueue(illustration(42, 21)))
    await prewarmer.waitForIdle()

    t.deepEqual(calls.map(call => [call.method, call.size]), [
        ['group', 10], ['group', 10], ['photo', 1]
    ])
    t.deepEqual(writes.flatMap(write => write.pages.map(page => page.pageIndex)),
        Array.from({ length: 21 }, (_, page) => page))
    t.deepEqual(writes.flatMap(write => write.pages.map(page => page.fileId)),
        Array.from({ length: 21 }, (_, page) => `large-${page}`))
})

test('production PostgreSQL decimal-string IDs enter and deduplicate in the prewarm queue', async t => {
    let release
    const blocked = new Promise(resolve => { release = resolve })
    const writes = []
    const bot = { api: {
        sendPhoto: async () => {
            await blocked
            return photoMessage(0)
        },
        sendMediaGroup: async () => { throw new Error('not expected') }
    } }
    const prewarmer = createGuestMediaPrewarmer({
        bot,
        cacheChatIds: [-1001],
        writeFileIds: async (illustId, pages) => writes.push({ illustId, pages }),
        logger: { warn() {} }
    })

    t.true(prewarmer.enqueue(illustration('12345678', 1)))
    t.false(prewarmer.enqueue(illustration(12345678, 1)))
    release()
    await prewarmer.waitForIdle()

    t.deepEqual(writes, [{
        illustId: 12345678,
        pages: [{ pageIndex: 0, fileId: 'large-0' }]
    }])
})

test('active work is deduplicated and cache channels rotate with one serial worker each', async t => {
    const calls = []
    let release
    const firstCall = new Promise(resolve => { release = resolve })
    const bot = { api: {
        sendPhoto: async (chatId, media) => {
            calls.push(chatId)
            if (calls.length === 1) await firstCall
            return photoMessage(Number(media.match(/p(\d+)\.jpg$/)[1]))
        },
        sendMediaGroup: async () => { throw new Error('not expected') }
    } }
    const prewarmer = createGuestMediaPrewarmer({
        bot,
        cacheChatIds: [-1001, -1002],
        writeFileIds: async () => {},
        logger: { warn() {} }
    })
    const work = illustration(71, 1)
    t.true(prewarmer.enqueue(work))
    t.false(prewarmer.enqueue(work))
    t.true(prewarmer.enqueue(illustration(72, 1)))
    t.true(prewarmer.enqueue(illustration(73, 1)))
    release()
    await prewarmer.waitForIdle()
    t.deepEqual(calls, [-1001, -1002, -1001])
})

test('an explicit channel flood moves the whole batch to another channel', async t => {
    const calls = []
    const writes = []
    const bot = { api: {
        sendPhoto: async (chatId) => {
            calls.push(chatId)
            if (chatId === -1001) {
                throw { error_code: 429, parameters: { retry_after: 30, flood_gate: true } }
            }
            return photoMessage(0)
        },
        sendMediaGroup: async () => { throw new Error('not expected') }
    } }
    const prewarmer = createGuestMediaPrewarmer({
        bot,
        cacheChatIds: [-1001, -1002],
        writeFileIds: async (_id, pages) => writes.push(pages),
        logger: { warn() {} }
    })
    t.true(prewarmer.enqueue(illustration(80, 1)))
    await prewarmer.waitForIdle()
    t.deepEqual(calls, [-1001, -1002])
    t.deepEqual(writes[0], [{ pageIndex: 0, fileId: 'large-0' }])
})

test('an ambiguous network failure is not repeated in another cache channel', async t => {
    const calls = []
    const bot = { api: {
        sendPhoto: async chatId => {
            calls.push(chatId)
            throw new Error('socket closed after upload')
        },
        sendMediaGroup: async () => { throw new Error('not expected') }
    } }
    const prewarmer = createGuestMediaPrewarmer({
        bot,
        cacheChatIds: [-1001, -1002],
        writeFileIds: async () => t.fail('ambiguous responses must not be written'),
        logger: { warn() {} }
    })
    t.true(prewarmer.enqueue(illustration(81, 1)))
    await prewarmer.waitForIdle()
    t.deepEqual(calls, [-1001])
})

test('a generic 429 without a channel scope is not repeated across channels', async t => {
    const calls = []
    const bot = { api: {
        sendPhoto: async chatId => {
            calls.push(chatId)
            throw { error_code: 429, parameters: { retry_after: 30 } }
        },
        sendMediaGroup: async () => { throw new Error('not expected') }
    } }
    const prewarmer = createGuestMediaPrewarmer({
        bot,
        cacheChatIds: [-1001, -1002],
        writeFileIds: async () => t.fail('uncertain 429 must not be written'),
        logger: { warn() {} }
    })
    t.true(prewarmer.enqueue(illustration(82, 1)))
    await prewarmer.waitForIdle()
    t.deepEqual(calls, [-1001])
})

test('the queue accepts at most 500 active works and rejects work after stop', async t => {
    let release
    const blocker = new Promise(resolve => { release = resolve })
    let first = true
    const bot = { api: {
        sendPhoto: async (_chatId, media) => {
            if (first) { first = false; await blocker }
            return photoMessage(Number(media.match(/p(\d+)\.jpg$/)[1]))
        },
        sendMediaGroup: async () => { throw new Error('not expected') }
    } }
    const prewarmer = createGuestMediaPrewarmer({
        bot,
        cacheChatIds: [-1001],
        writeFileIds: async () => {},
        logger: { warn() {} }
    })
    for (let index = 0; index < GUEST_PREWARM_MAX_WORKS; index++) {
        t.true(prewarmer.enqueue(illustration(10000 + index, 1)))
    }
    t.false(prewarmer.enqueue(illustration(99999, 1)))
    release()
    await prewarmer.waitForIdle()
    await prewarmer.stop()
    t.false(prewarmer.enqueue(illustration(100000, 1)))
})

test('missing cache channel configuration disables only prewarming and emits a warning', async t => {
    const prewarmer = createGuestMediaPrewarmer({
        bot: { api: {} },
        cacheChatIds: [],
        writeFileIds: async () => {},
        logger: { warn() {} }
    })
    t.false(prewarmer.enqueue(illustration(90, 2)))
    t.false(guestMediaCacheStartupMessage([]).enabled)
    t.true(guestMediaCacheStartupMessage([-1001]).enabled)
})
