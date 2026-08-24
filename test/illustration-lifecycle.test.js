import test from 'ava'
import fs from 'node:fs'
import en from '../lang/en.js'
import ja from '../lang/ja.js'
import zhHans from '../lang/zh-hans.js'
import zhHant from '../lang/zh-hant.js'
import {
    IllustrationLifecycleState,
    applyIllustrationRefresh,
    beginIllustrationRefresh,
    beginIllustrationSend,
    completeIllustration,
    createIllustrationLifecycle,
    failIllustration,
    markIllustrationPageSent,
    pendingIllustrationPages
} from '../handlers/telegram/illustration-lifecycle.js'

test('illustration lifecycle refreshes at most once and retains sent pages', t => {
    const lifecycle = createIllustrationLifecycle({ id: 42, imgs_: {} })
    beginIllustrationSend(lifecycle)
    markIllustrationPageSent(lifecycle, 0)

    t.true(beginIllustrationRefresh(lifecycle, 1))
    applyIllustrationRefresh(lifecycle, { id: 42, imgs_: { regular_urls: ['new'] } })
    t.false(beginIllustrationRefresh(lifecycle, 1))
    t.deepEqual([...lifecycle.sentPages], [0])
    t.is(lifecycle.refreshCount, 1)
    t.is(lifecycle.state, IllustrationLifecycleState.RETRYING)

    markIllustrationPageSent(lifecycle, 1)
    completeIllustration(lifecycle)
    t.is(lifecycle.state, IllustrationLifecycleState.COMPLETED)
})

test('refresh resumes only unsent direct pages', t => {
    const lifecycle = createIllustrationLifecycle({
        id: 42,
        mediagroup: [{ p: 0 }, { p: 1 }, { p: 2 }]
    })
    beginIllustrationSend(lifecycle)
    markIllustrationPageSent(lifecycle, 0)
    markIllustrationPageSent(lifecycle, 1)
    beginIllustrationRefresh(lifecycle, 2)
    applyIllustrationRefresh(lifecycle, {
        id: 42,
        mediagroup: [{ p: 0 }, { p: 1 }, { p: 2, media_r: 'fresh' }]
    })

    t.deepEqual(pendingIllustrationPages(lifecycle), [2])
})

test('refresh treats PostgreSQL string ID and Pixiv numeric ID as the same illustration', t => {
    const lifecycle = createIllustrationLifecycle({
        id: '148841251',
        mediagroup: [{ id: '148841251', p: 0, media_r: 'stale' }]
    })
    beginIllustrationSend(lifecycle)
    beginIllustrationRefresh(lifecycle, 0)

    applyIllustrationRefresh(lifecycle, {
        id: 148841251,
        mediagroup: [{ id: 148841251, p: 0, media_r: 'fresh' }]
    })

    t.is(lifecycle.id, 148841251)
    t.is(lifecycle.illust.id, 148841251)
    t.is(lifecycle.illust.mediagroup[0].id, 148841251)
    t.is(lifecycle.state, IllustrationLifecycleState.RETRYING)
})

test('refresh identity failures have actionable localized messages', t => {
    for (const language of [en, ja, zhHans, zhHant]) {
        t.regex(language.illustration_refresh_id_mismatch, /ILLUSTRATION_REFRESH_ID_MISMATCH/)
    }
})

test('illustration not-found is terminal', t => {
    const lifecycle = createIllustrationLifecycle({ id: 7 })
    beginIllustrationSend(lifecycle)
    beginIllustrationRefresh(lifecycle, 0)
    failIllustration(lifecycle, 'PIXIV_ILLUSTRATION_NOT_FOUND')

    t.is(lifecycle.state, IllustrationLifecycleState.NOT_FOUND)
    t.throws(() => completeIllustration(lifecycle), {
        message: 'Illegal illustration transition: not_found -> completed'
    })
})

test('download helpers cannot refresh or delete illustration metadata', t => {
    const commonSource = fs.readFileSync(new URL('../handlers/common.js', import.meta.url), 'utf8')
    const legacyIllustSource = fs.readFileSync(new URL('../handlers/pixiv/illust.js', import.meta.url), 'utf8')

    t.false(commonSource.includes('get_illust'))
    t.false(commonSource.includes('resolveIllustration'))
    t.false(commonSource.includes('skip_refetch'))
    t.false(legacyIllustSource.includes('get_illust'))
    t.false(legacyIllustSource.includes('deleted: true'))
})
