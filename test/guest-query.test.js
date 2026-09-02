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

function illustration(id, { type = 0, pages = 1, fileId } = {}) {
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
    if (key === 'guest_multipage_notice') return `pages=${value}`
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

test('guest multi-page result returns the first page and visibly states total pages', async t => {
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
    t.true(ctx.answers[0].caption.includes('pages=3'))
    t.truthy(ctx.answers[0].reply_markup)
})

test('guest multi-page caption remains valid when the normal caption fills Telegram limit', async t => {
    const ctx = context()
    await createGuestQueryHandler(dependencies({
        illustService: {
            resolve: async id => ({
                kind: 'ready',
                illustration: illustration(id, { pages: 2 })
            })
        },
        format: () => '*'.repeat(1100)
    }))(ctx)

    t.true(Array.from(ctx.answers[0].caption).length <= 1024)
    t.true(ctx.answers[0].caption.startsWith('pages=2'))
    t.false('parse_mode' in ctx.answers[0])
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
    const ctx = context({
        guestMessage: {
            guest_query_id: 'secret-query-token',
            text: '@Pixiv_bot 12345678 secret-payload https://i.pximg.net/private.jpg',
            from: { id: 7, language_code: 'en' },
            chat: { id: -100, type: 'supergroup' }
        }
    })
    await createGuestQueryHandler(dependencies({
        resolveGuestSettings: async () => { throw new Error('secret internal payload') },
        reportError: fields => reports.push(fields)
    }))(ctx)

    t.is(ctx.answers.length, 1)
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
            return { default: { tags: false, spoiler: false } }
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
})

test('guest registration remains before every ordinary text route and startup warning is non-blocking', t => {
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
    const registration = app.indexOf('registerGuestQueryHandler(bot, guestQueryHandler)')

    t.true(registration > 0)
    t.true(registration < app.indexOf("bot.command('start'"))
    t.true(registration < app.indexOf("bot.on([':text', ':caption']"))
    t.true(app.includes('getUserSettings: userId => process.env.DBLESS'))
    t.false(app.includes('resolveUserSettings(ctx.guestMessage'))

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
    t.true(expected.includes('guest_multipage_notice'))
    t.true(expected.includes('guest_media_unavailable'))
})
