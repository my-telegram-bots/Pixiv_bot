import test from 'ava'
import {
    collectBefore,
    createInlineDefaultSettings,
    createInlineQueryHandler,
    createInlineSettingsResolver,
    normalizeInlineOffset,
    settleBefore
} from '../handlers/telegram/inline-query.js'
import { buildRankingInlineResult } from '../handlers/telegram/illustration-inline-result.js'

const never = new Promise(() => { })

function illustration(id, type = 0) {
    return {
        id,
        type,
        title: `illust ${id}`,
        tags: [],
        imgs_: type === 2
            ? { cover_img_url: `https://i.pximg.net/${id}_p0.jpg` }
            : {
                size: [{ width: 100, height: 200 }],
                thumb_urls: [`https://i.pximg.net/${id}_p0_thumb.jpg`],
                regular_urls: [`https://i.pximg.net/${id}_p0.jpg`],
                original_urls: [`https://i.pximg.net/${id}_p0_original.jpg`]
            }
    }
}

function context(overrides = {}) {
    const answers = []
    return {
        inlineQuery: { offset: '', from: { id: 1 } },
        ids: { illust: [] },
        text: '',
        l: 'en',
        us: createInlineDefaultSettings(),
        answerInlineQuery: async (results, options) => answers.push({ results, options }),
        answers,
        ...overrides
    }
}

function dependencies(overrides = {}) {
    return {
        now: Date.now,
        logger: { warn() {}, error() {}, dev() {} },
        dbLess: () => true,
        illustService: { resolve: async id => ({ kind: 'ready', illustration: illustration(id) }) },
        detectUgoiraUrl: async () => null,
        handleRanking: async () => ({ data: [] }),
        db: {},
        format: illust => illust.title,
        keyboard: () => ({}),
        localize: (_language, key) => key,
        ...overrides
    }
}

test('inline offsets reject negative, malformed, and excessive values', t => {
    t.is(normalizeInlineOffset('2'), 2)
    t.is(normalizeInlineOffset('-1'), 0)
    t.is(normalizeInlineOffset('2x'), 0)
    t.is(normalizeInlineOffset('10001'), 0)
})

test('deadline helpers return completed siblings without waiting for pending work', async t => {
    const expired = Date.now() - 1
    t.deepEqual(await settleBefore(never, expired), { status: 'timeout' })

    const results = await collectBefore([
        Promise.resolve('ready'),
        never
    ], Date.now() + 20)
    t.deepEqual(results[0], { status: 'fulfilled', value: 'ready' })
    t.is(results[1], undefined)
})

test('inline settings fall back without allowing a late lookup to mutate context', async t => {
    const ctx = context({
        text: '+sp',
        user_id: 1,
        inlineDeadline: { workDeadlineAt: Date.now() - 1 }
    })
    const resolver = createInlineSettingsResolver({
        resolveUserSettings: async isolated => {
            await never
            isolated.us = { unsafe: true }
        },
        logger: { warn() {} }
    })

    const settings = await resolver(ctx)
    t.is(settings.setting.dbless, true)
    t.false(settings.single_caption)
    t.is(ctx.us, settings)
})

test('direct inline lookup answers once with partial results before the deadline', async t => {
    const startedAt = Date.now()
    const ctx = context({
        ids: { illust: [1, 2] },
        inlineDeadline: {
            receivedAt: startedAt,
            workDeadlineAt: startedAt + 500,
            answerDeadlineAt: startedAt + 1000
        }
    })
    const handler = createInlineQueryHandler(dependencies({
        illustService: {
            resolve: id => id === 1
                ? Promise.resolve({ kind: 'ready', illustration: illustration(id) })
                : never
        }
    }))

    await handler(ctx)
    t.is(ctx.answers.length, 1)
    t.deepEqual(ctx.answers[0].results.map(result => result.id), ['p_1-0'])
    t.is(ctx.answers[0].options.cache_time, 0)
    t.true(Date.now() - startedAt < 300)
})

test('shared inline photo builder preserves spoiler behavior', async t => {
    const ctx = context({
        ids: { illust: [1] },
        us: { ...createInlineDefaultSettings('+spoiler'), spoiler: true },
        inlineDeadline: {
            receivedAt: Date.now(),
            workDeadlineAt: Date.now() + 200,
            answerDeadlineAt: Date.now() + 400
        }
    })

    await createInlineQueryHandler(dependencies())(ctx)

    t.is(ctx.answers.length, 1)
    t.true(ctx.answers[0].results[0].has_spoiler)
})

test('inline and Guest photo results never expose square-cropped Pixiv thumbnails', async t => {
    const ctx = context({
        ids: { illust: [1] },
        inlineDeadline: {
            receivedAt: Date.now(),
            workDeadlineAt: Date.now() + 200,
            answerDeadlineAt: Date.now() + 400
        }
    })

    await createInlineQueryHandler(dependencies())(ctx)

    const result = ctx.answers[0].results[0]
    t.is(result.photo_url, 'https://i.pximg.net/1_p0.jpg')
    t.is(result.thumbnail_url, result.photo_url)
    t.false(result.thumbnail_url.includes('_thumb'))
})

test('ranking photo results use the regular image as Telegram preview', t => {
    const flag = { setting: { format: { inline: 'v2' } } }
    const result = buildRankingInlineResult({
        id: 9,
        imgs_: {
            regular_urls: ['https://i.pximg.net/9_p0.jpg'],
            thumb_urls: ['https://i.pximg.net/9_p0_square-thumb.jpg'],
            size: [{ width: 100, height: 200 }]
        }
    }, flag, {
        format: () => 'caption',
        keyboard: () => ({})
    })

    t.is(result.photo_url, 'https://i.pximg.net/9_p0.jpg')
    t.is(result.thumbnail_url, result.photo_url)
    t.false(result.thumbnail_url.includes('square-thumb'))
})

test('shared inline photo builder applies automatic spoiler to sensitive works', async t => {
    const ctx = context({
        ids: { illust: [1] },
        us: { ...createInlineDefaultSettings(), auto_spoiler: true },
        inlineDeadline: {
            receivedAt: Date.now(),
            workDeadlineAt: Date.now() + 200,
            answerDeadlineAt: Date.now() + 400
        }
    })
    await createInlineQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: { ...illustration(id), x_restrict: 1 }
            })
        }
    }))(ctx)

    t.true(ctx.answers[0].results[0].has_spoiler)
})

test('ugoira redirect preserves ready sibling results and never starts conversion', async t => {
    const ctx = context({
        ids: { illust: [1, 2] },
        inlineDeadline: {
            receivedAt: Date.now(),
            workDeadlineAt: Date.now() + 100,
            answerDeadlineAt: Date.now() + 200
        }
    })
    const handler = createInlineQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, id === 2 ? 2 : 0)
            })
        },
        detectUgoiraUrl: async () => null
    }))

    await handler(ctx)
    t.deepEqual(ctx.answers[0].results.map(result => result.id), ['p_1-0'])
    t.is(ctx.answers[0].options.switch_pm_parameter, '2')
    t.is(ctx.answers[0].options.cache_time, 0)
})

test('inline shared ugoira builder preserves the existing remote URL policy', async t => {
    const ctx = context({
        ids: { illust: [2] },
        inlineDeadline: {
            receivedAt: Date.now(),
            workDeadlineAt: Date.now() + 200,
            answerDeadlineAt: Date.now() + 400
        }
    })
    await createInlineQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({ kind: 'ready', illustration: illustration(id, 2) })
        },
        detectUgoiraUrl: async (_illust, _type, options) => {
            t.false(options.existingOnly)
            return 'https://media.example/2.mp4'
        }
    }))(ctx)

    t.is(ctx.answers[0].results[0].mpeg4_url, 'https://media.example/2.mp4')
})

test('malformed cached media is isolated and private parameters stay within Telegram limits', async t => {
    const ids = Array.from({ length: 7 }, (_, index) => 123456780 + index)
    const ctx = context({
        ids: { illust: ids },
        inlineDeadline: {
            receivedAt: Date.now(),
            workDeadlineAt: Date.now() + 500,
            answerDeadlineAt: Date.now() + 1000
        }
    })
    const handler = createInlineQueryHandler(dependencies({
        illustService: {
            resolve: async id => {
                const value = illustration(id)
                if (id === ids[0]) value.imgs_.regular_urls[0] = 'not a URL'
                return { kind: 'ready', illustration: value }
            }
        }
    }))

    await handler(ctx)
    t.is(ctx.answers[0].results.length, 6)
    t.false(ctx.answers[0].results.some(result => result.id === `p_${ids[0]}-0`))
    t.true(Buffer.byteLength(ctx.answers[0].options.switch_pm_parameter, 'utf8') <= 64)
})

test('a timed-out direct lookup offers the private recovery path', async t => {
    const ctx = context({
        ids: { illust: [7] },
        inlineDeadline: {
            receivedAt: Date.now(),
            workDeadlineAt: Date.now() - 1,
            answerDeadlineAt: Date.now() + 200
        }
    })
    await createInlineQueryHandler(dependencies({
        illustService: { resolve: () => never }
    }))(ctx)

    t.is(ctx.answers.length, 1)
    t.deepEqual(ctx.answers[0].results, [])
    t.is(ctx.answers[0].options.switch_pm_parameter, '7')
    t.is(ctx.answers[0].options.switch_pm_text, 'inline_lookup_timeout')
    t.is(ctx.answers[0].options.cache_time, 0)
})

test('ranking and search timeouts still produce one prompt empty answer', async t => {
    const rankingCtx = context({
        inlineDeadline: {
            receivedAt: Date.now(),
            workDeadlineAt: Date.now() - 1,
            answerDeadlineAt: Date.now() + 200
        }
    })
    await createInlineQueryHandler(dependencies({ handleRanking: () => never }))(rankingCtx)
    t.is(rankingCtx.answers.length, 1)
    t.deepEqual(rankingCtx.answers[0].results, [])

    const searchCtx = context({
        text: 'tag',
        inlineDeadline: rankingCtx.inlineDeadline
    })
    const cursor = {
        sort: () => cursor,
        skip: () => cursor,
        limit: () => cursor,
        toArray: () => never
    }
    await createInlineQueryHandler(dependencies({
        dbLess: () => false,
        db: { collection: { illust: { find: () => cursor } } }
    }))(searchCtx)
    t.is(searchCtx.answers.length, 1)
    t.deepEqual(searchCtx.answers[0].results, [])
})
