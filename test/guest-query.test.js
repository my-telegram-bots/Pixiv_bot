import test from 'ava'
import { readFileSync } from 'fs'
import { Bot } from 'grammy'
import en from '../lang/en.js'
import ja from '../lang/ja.js'
import zhHans from '../lang/zh-hans.js'
import zhHant from '../lang/zh-hant.js'
import {
    createGuestQueryHandler,
    createGuestSettingsResolver,
    formatGuestAdminReport,
    guestModeStartupMessage,
    registerGuestQueryHandler,
    stripGuestBotMention
} from '../handlers/telegram/guest-query.js'
import { createGuestMediaPrewarmer } from '../handlers/telegram/guest-media-prewarmer.js'

function illustration(id, { type = 0, pages = 1, fileId, pageFileIds } = {}) {
    if (type === 2) {
        return {
            id,
            type,
            title: `ugoira ${id}`,
            tags: [],
            tg_file_id: fileId,
            imgs_: { cover_img_url: `https://i.pximg.net/${id}_cover.jpg` }
        }
    }
    return {
        id,
        type,
        title: `illust ${id}`,
        author_id: 99,
        author_name: 'artist',
        description: '',
        tags: [],
        imgs_: {
            size: Array.from({ length: pages }, () => ({ width: 100, height: 200 })),
            thumb_urls: Array.from(
                { length: pages },
                (_, page) => `https://i.pximg.net/${id}_p${page}_thumb.jpg`
            ),
            regular_urls: Array.from(
                { length: pages },
                (_, page) => `https://i.pximg.net/${id}_p${page}.jpg`
            ),
            original_urls: Array.from(
                { length: pages },
                (_, page) => `https://i.pximg.net/${id}_p${page}_original.jpg`
            ),
            tg_file_ids: Array.from(
                { length: pages },
                (_, page) => pageFileIds?.[page] || null
            )
        }
    }
}

function context(overrides = {}) {
    const answers = []
    return {
        update: { update_id: 42 },
        guestMessage: {
            guest_query_id: 'guest-1',
            text: '@Pixiv_bot 12345678',
            from: { id: 7, language_code: 'en' },
            chat: { id: -100, type: 'supergroup' }
        },
        from: { id: 7, language_code: 'en' },
        me: { username: 'Pixiv_bot' },
        answerGuestQuery: async result => answers.push(result),
        answers,
        ...overrides
    }
}

function localize(_language, key, value) {
    return key
}

function localizeRaw(_language, key, value) {
    if (key === 'guest_rich_multipage_notice') return `rich pages=${value}`
    if (key === 'guest_rich_truncated_notice') return `total=${value}; showing first 50`
    return key
}

function dependencies(overrides = {}) {
    return {
        now: Date.now,
        logger: { warn() {}, dev() {} },
        getUserSettings: async () => null,
        illustService: {
            resolve: async id => ({ kind: 'ready', illustration: illustration(id) })
        },
        detectUgoiraUrl: async () => null,
        format: (illust, settings, _mode, page) =>
            `${illust.title} page=${page} spoiler=${Boolean(settings.spoiler)}`,
        keyboard: id => ({
            reply_markup: { inline_keyboard: [[{ text: 'open', url: `https://pixiv.net/${id}` }]] }
        }),
        localize,
        localizeRaw,
        ...overrides
    }
}

test('guest mention removal is exact, case-insensitive, and leaves reply-only text intact', t => {
    t.is(stripGuestBotMention('@Pixiv_bot 12345678', 'Pixiv_bot'), '12345678')
    t.is(stripGuestBotMention('12345678 @pixiv_BOT', 'Pixiv_bot'), '12345678')
    t.is(stripGuestBotMention('12345678', 'Pixiv_bot'), '12345678')
    t.is(stripGuestBotMention('@Pixiv_bot_backup 12345678', 'Pixiv_bot'), '@Pixiv_bot_backup 12345678')
})

test('guest text resolves caller settings and answers once with one complete photo', async t => {
    const queriedUsers = []
    const ctx = context()
    const handler = createGuestQueryHandler(dependencies({
        getUserSettings: async userId => {
            queriedUsers.push(userId)
            return { default: { spoiler: true, open: true, share: true } }
        }
    }))

    await handler(ctx)

    t.deepEqual(queriedUsers, [7])
    t.is(ctx.answers.length, 1)
    t.is(ctx.answers[0].type, 'photo')
    t.true(ctx.answers[0].has_spoiler)
    t.is(ctx.answers[0].photo_url, 'https://i.pximg.net/12345678_p0.jpg')
    t.is(ctx.answers[0].thumbnail_url, ctx.answers[0].photo_url)
    t.false(ctx.answers[0].thumbnail_url.includes('_thumb'))
    t.truthy(ctx.answers[0].reply_markup)
})

test('guest caption and reply summon context use only the caption input', async t => {
    const ctx = context({
        guestMessage: {
            guest_query_id: 'guest-2',
            caption: '@Pixiv_bot https://www.pixiv.net/artworks/23456789',
            from: { id: 8, language_code: 'ja' },
            chat: { id: 8, type: 'private' },
            reply_to_message: {
                text: 'https://www.pixiv.net/artworks/99999999'
            }
        },
        from: { id: 8, language_code: 'ja' }
    })

    await createGuestQueryHandler(dependencies())(ctx)

    t.is(ctx.answers.length, 1)
    t.is(ctx.answers[0].id, 'p_23456789-0')
    t.is(ctx.l, 'ja')
})

test('guest settings use the explicit caller instead of another bot sender', async t => {
    const queriedUsers = []
    const ctx = context({
        from: { id: 99, is_bot: true, language_code: 'en' },
        guestMessage: {
            guest_query_id: 'guest-bot-reply',
            text: '@Pixiv_bot 34567890',
            from: { id: 99, is_bot: true, language_code: 'en' },
            guest_bot_caller_user: { id: 8, is_bot: false, language_code: 'ja' },
            chat: { id: -100, type: 'supergroup' }
        }
    })

    await createGuestQueryHandler(dependencies({
        getUserSettings: async userId => { queriedUsers.push(userId); return null }
    }))(ctx)

    t.deepEqual(queriedUsers, [8])
    t.is(ctx.l, 'ja')
    t.is(ctx.answers[0].id, 'p_34567890-0')
})

test('guest cold multi-page result keeps only the normal page-position caption', async t => {
    const ctx = context()
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, { pages: 3 })
            })
        }
    }))(ctx)

    t.is(ctx.answers.length, 1)
    t.is(ctx.answers[0].id, 'p_12345678-0')
    t.is(ctx.answers[0].caption, 'illust 12345678 page=0 spoiler=false')
    t.false(ctx.answers[0].caption.includes('This work has'))
    t.truthy(ctx.answers[0].reply_markup)
})

test('guest cold multi-page result does not rewrite the normal caption', async t => {
    const ctx = context()
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, { pages: 2 })
            })
        },
        format: () => 'normal caption 1/2'
    }))(ctx)

    t.is(ctx.answers[0].caption, 'normal caption 1/2')
    t.is(ctx.answers[0].parse_mode, 'MarkdownV2')
})

test('cold cache answers the first page exactly once before prewarming begins', async t => {
    const events = []
    const ctx = context({
        answerGuestQuery: async result => {
            events.push('answer')
            ctx.answers.push(result)
        }
    })
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, { pages: 3 })
            })
        },
        prewarmer: { enqueue: illust => events.push(`enqueue:${illust.id}`) }
    }))(ctx)

    t.is(ctx.answers.length, 1)
    t.is(ctx.answers[0].type, 'photo')
    t.deepEqual(events, ['answer', 'enqueue:12345678'])
})

test('a production PostgreSQL string ID warms once and the next Guest answer contains every page', async t => {
    const cacheChatId = -1003868194900
    const pageFileIds = [null, null, null]
    const storedIllustration = () => illustration('12345678', {
        pages: 3,
        pageFileIds
    })
    const prewarmer = createGuestMediaPrewarmer({
        bot: { api: {
            sendMediaGroup: async (chatId, media) => {
                t.is(chatId, cacheChatId)
                return media.map((_, page) => ({
                    photo: [
                        { file_id: `small-${page}`, width: 100, height: 100 },
                        { file_id: `cached-${page}`, width: 1000, height: 1000 }
                    ]
                }))
            },
            sendPhoto: async () => { throw new Error('not expected') }
        } },
        cacheChatIds: [cacheChatId],
        writeFileIds: async (illustId, pages) => {
            t.is(illustId, 12345678)
            for (const page of pages) pageFileIds[page.pageIndex] = page.fileId
        },
        logger: { warn() {} }
    })
    const handler = createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async () => ({
                kind: 'ready',
                illustration: storedIllustration()
            })
        },
        prewarmer
    }))

    const cold = context()
    await handler(cold)
    t.is(cold.answers[0].type, 'photo')
    await prewarmer.waitForIdle()
    t.deepEqual(pageFileIds, ['cached-0', 'cached-1', 'cached-2'])

    const warm = context()
    await handler(warm)
    t.is(warm.answers[0].type, 'article')
    t.deepEqual(
        warm.answers[0].input_message_content.rich_message.media.map(item => item.media.media),
        pageFileIds
    )
})

test('a rejected guest answer never starts prewarming', async t => {
    let enqueues = 0
    const ctx = context({ answerGuestQuery: async () => { throw new Error('expired') } })
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, { pages: 3 })
            })
        },
        prewarmer: { enqueue: () => { enqueues++ } }
    }))(ctx)
    t.is(enqueues, 0)
})

test('a prewarm enqueue failure cannot replace or duplicate the successful Guest answer', async t => {
    const ctx = context()
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, { pages: 2 })
            })
        },
        prewarmer: { enqueue: () => { throw new Error('queue unavailable') } }
    }))(ctx)
    t.is(ctx.answers.length, 1)
    t.is(ctx.answers[0].type, 'photo')
})

test('complete page cache returns one rich slideshow with caption, buttons, and page spoilers', async t => {
    const ctx = context()
    await createGuestQueryHandler(dependencies({
        getUserSettings: async () => ({
            default: { spoiler: true, tags: true, description: true }
        }),
        illustService: {
            resolve: async id => {
                const work = illustration(id, {
                    pages: 3,
                    pageFileIds: ['file-0', 'file-1', 'file-2']
                })
                work.title = 'title * [safe]'
                work.author_name = 'artist _name_'
                work.tags = ['tag-one']
                work.description = 'line <unsafe>'
                return { kind: 'ready', illustration: work }
            }
        }
    }))(ctx)

    t.is(ctx.answers.length, 1)
    const result = ctx.answers[0]
    t.is(result.type, 'article')
    t.truthy(result.reply_markup)
    t.true(result.input_message_content.rich_message.markdown.includes('<tg-slideshow>'))
    t.true(result.input_message_content.rich_message.markdown.includes('rich pages=3'))
    t.true(result.input_message_content.rich_message.markdown.includes('title \\* \\[safe\\]'))
    t.false(result.input_message_content.rich_message.markdown.includes('www\\.pixiv'))
    t.deepEqual(
        result.input_message_content.rich_message.media.map(item => item.id),
        ['page_0', 'page_1', 'page_2']
    )
    t.true(result.input_message_content.rich_message.media.every(
        item => item.media.has_spoiler === true
    ))
})

test('partial cache never returns a partial rich slideshow', async t => {
    const ctx = context()
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, {
                    pages: 3,
                    pageFileIds: ['file-0', null, 'file-2']
                })
            })
        }
    }))(ctx)
    t.is(ctx.answers[0].type, 'photo')
    t.false('input_message_content' in ctx.answers[0])
})

test('rich slideshow caps attachments at 50 and states the real page count', async t => {
    const ctx = context()
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, {
                    pages: 63,
                    pageFileIds: Array.from({ length: 63 }, (_, page) => `file-${page}`)
                })
            })
        }
    }))(ctx)
    const rich = ctx.answers[0].input_message_content.rich_message
    t.is(rich.media.length, 50)
    t.true(rich.markdown.includes('total=63; showing first 50'))
    t.false(rich.markdown.includes('page_50'))
})

test('guest ugoira prefers a Telegram file id then accepts an existing public MP4 URL', async t => {
    const cachedCtx = context()
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, { type: 2, fileId: 'telegram-file' })
            })
        },
        detectUgoiraUrl: async () => t.fail('cached ugoira must not probe a URL')
    }))(cachedCtx)
    t.is(cachedCtx.answers[0].mpeg4_file_id, 'telegram-file')

    const urlCtx = context()
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, { type: 2 })
            })
        },
        detectUgoiraUrl: async (_illust, _type, options) => {
            t.true(options.existingOnly)
            return 'https://media.example/12345678.mp4'
        }
    }))(urlCtx)
    t.is(urlCtx.answers[0].mpeg4_url, 'https://media.example/12345678.mp4')
    t.is(urlCtx.answers[0].type, 'mpeg4_gif')
})

const invalidInputs = [
    ['', 'guest_input_required'],
    ['12345678 23456789', 'guest_multiple_illustrations'],
    ['https://pixiv.net/novel/show.php?id=12345678', 'guest_unsupported_input'],
    ['https://pixiv.net/users/12345678', 'guest_unsupported_input'],
    ['/s +tags', 'guest_unsupported_input'],
    ['/link', 'guest_unsupported_input'],
    ['12345678+file', 'guest_unsupported_input'],
    ['12345678-kb', 'guest_unsupported_input'],
    ['12345678+unknown', 'guest_unsupported_input'],
    ['not a Pixiv artwork', 'guest_unsupported_input']
]

for (const [input, expectedKey] of invalidInputs) {
    test(`guest invalid input produces one explanatory article: ${expectedKey} ${input}`, async t => {
        let lookups = 0
        const ctx = context({
            guestMessage: {
                guest_query_id: 'guest-invalid',
                text: `@Pixiv_bot ${input}`,
                from: { id: 7, language_code: 'en' },
                chat: { id: -100, type: 'supergroup' }
            }
        })
        await createGuestQueryHandler(dependencies({
            illustService: { resolve: async () => { lookups++; return null } }
        }))(ctx)

        t.is(lookups, 0)
        t.is(ctx.answers.length, 1)
        t.is(ctx.answers[0].type, 'article')
        t.is(ctx.answers[0].input_message_content.message_text, expectedKey)
    })
}

test('guest not-found, media unavailable, timeout, and exception each answer once', async t => {
    const cases = [
        {
            expected: 'guest_illustration_not_found',
            deps: { illustService: { resolve: async () => ({ kind: 'not_found', code: 'PIXIV_ILLUSTRATION_NOT_FOUND' }) } }
        },
        {
            expected: 'guest_media_unavailable',
            deps: {
                illustService: {
                    resolve: async id => ({ kind: 'ready', illustration: illustration(id, { type: 2 }) })
                },
                detectUgoiraUrl: async () => null
            }
        },
        {
            expected: 'guest_lookup_timeout',
            ctx: {
                guestDeadline: {
                    receivedAt: Date.now() - 100,
                    workDeadlineAt: Date.now() - 1,
                    answerDeadlineAt: Date.now() + 100
                }
            },
            deps: { getUserSettings: undefined }
        },
        {
            expected: 'guest_request_failed',
            deps: { resolveGuestSettings: async () => { throw new Error('secret payload') } }
        }
    ]

    for (const item of cases) {
        const ctx = context(item.ctx)
        await createGuestQueryHandler(dependencies(item.deps))(ctx)
        t.is(ctx.answers.length, 1)
        t.is(ctx.answers[0].input_message_content.message_text, item.expected)
        t.false(ctx.answers[0].input_message_content.message_text.includes('pximg.net'))
        t.false(ctx.answers[0].input_message_content.message_text.includes('payload'))
    }
})

test('guest reports contain only bounded safe fields and never original input or payloads', async t => {
    const reports = []
    let answered = false
    const ctx = context({
        guestMessage: {
            guest_query_id: 'secret-query-token',
            text: '@Pixiv_bot 12345678 secret-payload https://i.pximg.net/private.jpg',
            from: { id: 7, language_code: 'en' },
            chat: { id: -100, type: 'supergroup' }
        },
        answerGuestQuery: async () => { answered = true }
    })
    await createGuestQueryHandler(dependencies({
        resolveGuestSettings: async () => { throw new Error('secret internal payload') },
        reportError: fields => {
            t.true(answered)
            reports.push(fields)
        }
    }))(ctx)

    t.true(answered)
    t.is(reports.length, 1)
    t.deepEqual(Object.keys(reports[0]).sort(), [
        'errorCode', 'illustId', 'requestId', 'stage'
    ])
    const report = formatGuestAdminReport(reports[0])
    t.is(
        report,
        '[guest-error] request=42 illust=12345678 code=GUEST_REQUEST_FAILED stage=handler'
    )
    t.false(report.includes('secret'))
    t.false(report.includes('pximg'))
    t.false(report.includes('payload'))
})

test('a rejected guest answer is attempted once and reported without retrying', async t => {
    let attempts = 0
    const reports = []
    const ctx = context({
        answerGuestQuery: async () => {
            attempts++
            throw new Error('query is too old with secret payload')
        }
    })

    await createGuestQueryHandler(dependencies({
        reportError: fields => reports.push(fields)
    }))(ctx)

    t.is(attempts, 1)
    t.is(reports.length, 1)
    t.is(reports[0].errorCode, 'GUEST_ANSWER_FAILED')
})

test('guest settings resolver applies request directives without a chat lookup or write path', async t => {
    const queries = []
    const resolver = createGuestSettingsResolver({
        getUserSettings: async userId => {
            queries.push(userId)
            return {
                default: {
                    tags: false,
                    spoiler: false,
                    open: false,
                    share: false,
                    remove_keyboard: true
                }
            }
        },
        logger: { warn() {} }
    })
    const ctx = context({ text: '12345678+spoiler +tags', user_id: 7 })
    const now = Date.now()

    const settings = await resolver(ctx, {
        workDeadlineAt: now + 100,
        answerDeadlineAt: now + 200
    })

    t.deepEqual(queries, [7])
    t.true(settings.spoiler)
    t.true(settings.tags)
    t.true(settings.open)
    t.true(settings.share)
    t.false(settings.remove_keyboard)
})

test('guest registration remains before every ordinary text route and startup warning is non-blocking', t => {
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
    const registration = app.indexOf('registerGuestQueryHandler(bot, guestQueryHandler)')

    t.true(registration > 0)
    t.true(registration < app.indexOf("bot.command('start'"))
    t.true(registration < app.indexOf("bot.on([':text', ':caption']"))
    t.true(app.includes('getUserSettings: userId => process.env.DBLESS'))
    t.false(app.includes('resolveUserSettings(ctx.guestMessage'))
    const guestConstruction = app.slice(
        app.indexOf('const guestQueryHandler = createGuestQueryHandler'),
        app.indexOf("console.log('✓ Telegram bot instance created')")
    )
    t.true(guestConstruction.includes('localizeRaw: _lr'))
    t.true(guestConstruction.includes('prewarmer: guestMediaPrewarmer'))

    t.true(guestModeStartupMessage({ supports_guest_queries: true }).enabled)
    t.false(guestModeStartupMessage({ supports_guest_queries: false }).enabled)
})

test('registerGuestQueryHandler installs one terminal guest_message handler', t => {
    const registrations = []
    const handler = () => {}
    registerGuestQueryHandler({ on: (...args) => registrations.push(args) }, handler)
    t.deepEqual(registrations, [['guest_message', handler]])
})

test('terminal guest registration prevents grammY generic text handlers from running', async t => {
    const bot = new Bot('1:test')
    let guestCalls = 0
    let ordinaryCalls = 0
    registerGuestQueryHandler(bot, async () => { guestCalls++ })
    bot.on([':text', ':caption'], async () => { ordinaryCalls++ })
    bot.botInfo = {
        id: 1,
        is_bot: true,
        first_name: 'Pixiv',
        username: 'Pixiv_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: true,
        supports_guest_queries: true
    }

    await bot.handleUpdate({
        update_id: 1,
        guest_message: {
            message_id: 1,
            date: 1,
            guest_query_id: 'guest-1',
            text: '@Pixiv_bot 12345678',
            chat: { id: -100, type: 'group', title: 'test' },
            from: { id: 7, is_bot: false, first_name: 'Caller' }
        }
    })

    t.is(guestCalls, 1)
    t.is(ordinaryCalls, 0)
})

test('real grammY guest context sends one singular answerGuestQuery payload', async t => {
    const bot = new Bot('1:test')
    const calls = []
    bot.botInfo = {
        id: 1,
        is_bot: true,
        first_name: 'Pixiv',
        username: 'Pixiv_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: true,
        supports_guest_queries: true
    }
    bot.api.config.use(async (_previous, method, payload) => {
        calls.push({ method, payload })
        return {
            ok: true,
            result: {
                message_id: 2,
                date: 1,
                chat: { id: -100, type: 'group', title: 'test' }
            }
        }
    })
    registerGuestQueryHandler(bot, createGuestQueryHandler(dependencies()))

    await bot.handleUpdate({
        update_id: 2,
        guest_message: {
            message_id: 1,
            date: 1,
            guest_query_id: 'guest-real-context',
            text: '@Pixiv_bot 12345678',
            chat: { id: -100, type: 'group', title: 'test' },
            from: { id: 7, is_bot: false, first_name: 'Caller', language_code: 'en' }
        }
    })

    t.is(calls.length, 1)
    t.is(calls[0].method, 'answerGuestQuery')
    t.is(calls[0].payload.guest_query_id, 'guest-real-context')
    t.is(calls[0].payload.result.type, 'photo')
    t.false(Array.isArray(calls[0].payload.result))
})

test('real grammY guest context serializes a cached multi-page Rich Message', async t => {
    const bot = new Bot('1:test')
    const calls = []
    bot.botInfo = {
        id: 1,
        is_bot: true,
        first_name: 'Pixiv',
        username: 'Pixiv_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: true,
        supports_guest_queries: true
    }
    bot.api.config.use(async (_previous, method, payload) => {
        calls.push({ method, payload })
        return {
            ok: true,
            result: {
                message_id: 2,
                date: 1,
                chat: { id: -100, type: 'group', title: 'test' }
            }
        }
    })
    registerGuestQueryHandler(bot, createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, {
                    pages: 2,
                    pageFileIds: ['telegram-file-0', 'telegram-file-1']
                })
            })
        }
    })))

    await bot.handleUpdate({
        update_id: 3,
        guest_message: {
            message_id: 1,
            date: 1,
            guest_query_id: 'guest-rich-context',
            text: '@Pixiv_bot 12345678',
            chat: { id: -100, type: 'group', title: 'test' },
            from: { id: 7, is_bot: false, first_name: 'Caller', language_code: 'en' }
        }
    })

    t.is(calls.length, 1)
    t.is(calls[0].method, 'answerGuestQuery')
    const rich = calls[0].payload.result.input_message_content.rich_message
    t.is(rich.media.length, 2)
    t.is(rich.media[0].media.media, 'telegram-file-0')
    t.true(rich.markdown.includes('tg://photo?id=page_1'))
})

test('guest handler has no ordinary delivery or chat-authority tail', t => {
    const source = readFileSync(
        new URL('../handlers/telegram/guest-query.js', import.meta.url),
        'utf8'
    )
    for (const forbidden of [
        'tg_sender',
        'sendMediaGroup',
        'sendChatAction',
        'setMessageReaction',
        'dispatchLinkedMessage',
        'getChatMember',
        'handleSettingsCommand',
        'sendMessage('
    ]) {
        t.false(source.includes(forbidden), forbidden)
    }
})

test('all supported languages expose the same complete guest message keys', t => {
    const guestKeys = language => Object.keys(language).filter(key => key.startsWith('guest_')).sort()
    const expected = guestKeys(en)
    t.deepEqual(guestKeys(ja), expected)
    t.deepEqual(guestKeys(zhHans), expected)
    t.deepEqual(guestKeys(zhHant), expected)
    t.false(expected.includes('guest_multipage_notice'))
    t.true(expected.includes('guest_media_unavailable'))
})
