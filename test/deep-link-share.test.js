import test from 'ava'
import { readFileSync } from 'node:fs'
import { forceDeepLinkShare } from '../handlers/telegram/deep-link-share.js'

test('a non-empty /start payload forces share while ordinary delivery preserves the setting', t => {
    const deepLink = { match: '12345678-23456789', us: { share: false } }
    const ordinary = { match: '', us: { share: false } }

    t.true(forceDeepLinkShare(deepLink))
    t.true(deepLink.us.share)
    t.false(forceDeepLinkShare(ordinary))
    t.false(ordinary.us.share)
})

test('album deep-link recovery edits the delivered first message instead of sending a duplicate', t => {
    const sender = readFileSync(
        new URL('../handlers/telegram/tg-sender.js', import.meta.url),
        'utf8'
    )

    t.true(sender.includes('await attachDeepLinkAlbumKeyboard('))
    t.true(sender.includes('bot.api.editMessageReplyMarkup(runtime.chatId, messageId,'))
    t.true(sender.includes('k_os(firstIllustId, runtime.ctx.us)'))
    t.false(/attachDeepLinkAlbumKeyboard[\s\S]*?bot\.api\.sendMessage/.test(sender))
})
