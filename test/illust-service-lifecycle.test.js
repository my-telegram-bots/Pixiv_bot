import test from 'ava'
import {
    IllustrationResolver,
    IllustrationResolveKind
} from '../handlers/pixiv/illustration-resolver.js'

function illustration(id = 42) {
    return {
        id,
        title: 'work',
        type: 0,
        imgs_: {
            size: [{ width: 100, height: 100 }],
            regular_urls: ['https://i.pximg.net/42_p0.jpg'],
            original_urls: ['https://i.pximg.net/42_p0.jpg']
        }
    }
}

test('resolver coalesces concurrent cache-first requests', async t => {
    let detailCalls = 0
    let release
    const gate = new Promise(resolve => { release = resolve })
    const service = new IllustrationResolver({
        getStored: async () => null,
        fetchDetail: async () => {
            detailCalls++
            await gate
            return illustration()
        },
        normalize: value => value,
        buildURLs: async value => value.imgs_,
        extractFields: value => value,
        updateStored: async () => {}
    })

    const first = service.resolve(42)
    const second = service.resolve(42)
    release()
    const [firstResult, secondResult] = await Promise.all([first, second])

    t.is(detailCalls, 1)
    t.is(firstResult.kind, IllustrationResolveKind.READY)
    t.is(secondResult, firstResult)
    t.is(service.inFlight.size, 0)
})

test('only detail endpoint 404 marks an existing illustration deleted', async t => {
    const updates = []
    const service = new IllustrationResolver({
        getStored: async () => null,
        fetchDetail: async () => {
            const error = new Error('not found')
            error.response = { status: 404 }
            throw error
        },
        updateStored: async (...args) => updates.push(args)
    })

    const result = await service.resolve(42, { mode: 'refresh' })

    t.is(result.kind, IllustrationResolveKind.NOT_FOUND)
    t.is(updates.length, 1)
    t.deepEqual(updates[0][1].deleted, true)
    t.deepEqual(updates[0][3], { upsert: false })
})

test('page URL failure does not mark illustration deleted', async t => {
    const updates = []
    const service = new IllustrationResolver({
        getStored: async () => null,
        fetchDetail: async () => illustration(),
        normalize: value => value,
        buildURLs: async () => {
            const error = new Error('pages not found')
            error.response = { status: 404 }
            throw error
        },
        updateStored: async (...args) => updates.push(args)
    })

    const result = await service.resolve(42, { mode: 'refresh' })

    t.is(result.kind, IllustrationResolveKind.FAILED)
    t.is(result.code, 'PIXIV_MEDIA_REFRESH_FAILED')
    t.is(updates.length, 0)
})

test('successful refresh clears a previously stored deletion marker', async t => {
    const updates = []
    const service = new IllustrationResolver({
        getStored: async () => null,
        fetchDetail: async () => illustration(),
        normalize: value => value,
        buildURLs: async value => value.imgs_,
        extractFields: (value, extra) => ({ ...value, ...extra }),
        updateStored: async (...args) => updates.push(args)
    })

    const result = await service.resolve(42, { mode: 'refresh' })

    t.is(result.kind, IllustrationResolveKind.READY)
    t.false(updates[0][1].deleted)
    t.is(updates[0][1].deleted_at, null)
})

test('database read failures return a failed result instead of rejecting', async t => {
    const service = new IllustrationResolver({
        getStored: async () => { throw new Error('database unavailable') },
        updateStored: async () => {},
        fetchDetail: async () => illustration(),
        normalize: value => value,
        buildURLs: async value => value.imgs_,
        extractFields: value => value,
        logger: { warn: () => {} }
    })

    const result = await service.resolve(42)

    t.is(result.kind, IllustrationResolveKind.FAILED)
    t.is(result.code, 'DATABASE_ILLUSTRATION_READ_FAILED')
})
