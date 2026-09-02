import test from 'ava'
import { readFileSync } from 'node:fs'
import {
    attachDeepLinkAlbumKeyboard,
    attachDeepLinkShareKeyboard,
    deepLinkShareExtra,
    forceDeepLinkShare
} from '../handlers/telegram/deep-link-share.js'

test('a non-empty /start payload forces share while ordinary delivery preserves the setting', t => {
    const deepLink = {
        command: 'start',
        match: '12345678-23456789',
        us: { share: false }
    }
    const ordinary = { command: undefined, match: '', us: { share: false } }
    const otherCommand = { command: 'something', match: '12345678', us: { share: false } }

    t.true(forceDeepLinkShare(deepLink))
    t.true(deepLink.us.share)
    t.false(forceDeepLinkShare(ordinary))
    t.false(ordinary.us.share)
    t.false(forceDeepLinkShare(otherCommand))
    t.false(otherCommand.us.share)
})

test('deep-link recovery attaches a real switch_inline_query share keyboard', async t => {
    const edits = []
    const attached = await attachDeepLinkShareKeyboard({
        api: {
            editMessageReplyMarkup: async (...args) => edits.push(args)
        },
        chatId: 10,
        messageId: 20,
        illustId: 149156331,
        settings: { open: false, share: true, show_id: true }
    })

    t.true(attached)
    t.is(edits.length, 1)
    t.deepEqual(edits[0].slice(0, 2), [10, 20])
    const buttons = edits[0][2].reply_markup.inline_keyboard.flat()
    t.deepEqual(buttons.map(button => button.text), ['share'])
    t.is(buttons[0].switch_inline_query, 'https://pixiv.net/artworks/149156331')
})

test('album recovery edits its first delivered message and never sends a duplicate', async t => {
    const edits = []
    const sends = []
    const attached = await attachDeepLinkAlbumKeyboard(
        {
            api: {
                editMessageReplyMarkup: async (...args) => edits.push(args),
                sendMessage: async (...args) => sends.push(args)
            }
        },
        {
            forceDeepLinkShareKeyboard: true,
            chatId: 10,
            ctx: { l: 'en', us: { share: true } },
            reportError: async () => {}
        },
        [{ id: 149156331, p: 0 }, { id: 149156331, p: 1 }],
        [{ message_id: 20 }, { message_id: 21 }]
    )

    t.true(attached)
    t.is(edits.length, 1)
    t.deepEqual(edits[0].slice(0, 2), [10, 20])
    t.is(sends.length, 0)
})

test('deep-link recovery refuses invalid message targets without an API call', async t => {
    let calls = 0
    const attached = await attachDeepLinkShareKeyboard({
        api: { editMessageReplyMarkup: async () => { calls++ } },
        chatId: 10,
        messageId: undefined,
        illustId: 149156331,
        settings: { share: true }
    })

    t.false(attached)
    t.is(calls, 0)
})

test('deep-link keyboard edit failure is non-fatal and observable without another send', async t => {
    const failure = new Error('edit failed')
    const reports = []
    const attached = await attachDeepLinkShareKeyboard({
        api: { editMessageReplyMarkup: async () => { throw failure } },
        chatId: 10,
        messageId: 20,
        illustId: 149156331,
        settings: { share: true },
        onError: async error => reports.push(error)
    })

    t.false(attached)
    t.deepEqual(reports, [failure])
})

test('Telegraph deep-link delivery can attach share without changing ordinary extras', t => {
    const ordinary = { parse_mode: 'MarkdownV2' }
    t.is(deepLinkShareExtra(ordinary, false, 149156331, { share: false }), ordinary)

    const deepLink = deepLinkShareExtra(ordinary, true, '149156331', {
        share: true,
        show_id: true
    })
    t.is(deepLink.parse_mode, 'MarkdownV2')
    t.is(
        deepLink.reply_markup.inline_keyboard[0][0].switch_inline_query,
        'https://pixiv.net/artworks/149156331'
    )
})

test('the sender wires deep-link share into direct, album, file-only, and Telegraph output', t => {
    const sender = readFileSync(
        new URL('../handlers/telegram/tg-sender.js', import.meta.url),
        'utf8'
    )
    const telegraph = readFileSync(
        new URL('../handlers/telegram/tg-sender-telegraph.js', import.meta.url),
        'utf8'
    )

    t.true(sender.includes('const forceDeepLinkShareKeyboard = forceDeepLinkShare(ctx)'))
    t.true(sender.includes('await attachDeepLinkAlbumKeyboard('))
    t.true(sender.includes('await attachDeepLinkKeyboard('))
    t.true(telegraph.includes('deepLinkShareExtra('))
})
