import test from 'ava'
import { createTestDb, getTestPool, seedTestData } from './helpers/db-setup.js'
import {
    getIllust,
    updateIllust,
    updateIllustImageFileIds,
    deleteIllust,
    findManyIllusts
} from '../db.js'

// Mock pool for getIllust (it uses the global pool)
let mockPool = null

test.beforeEach(async t => {
    // Create fresh in-memory database for each test
    const db = createTestDb()
    const PoolConstructor = getTestPool(db)
    const pool = new PoolConstructor()

    await seedTestData(pool)

    // Mock the global pool used by getIllust
    mockPool = pool

    t.context = { pool, db }
})

test.afterEach(t => {
    // Clean up
    if (t.context.pool) {
        t.context.pool.end()
    }
})

// Test 1: Get illust by ID (regular image) - using new getIllust() API
test('getIllust returns illust with images', async t => {
    const { pool } = t.context

    const illust = await getIllust(111111, pool)

    t.truthy(illust)
    t.is(illust.id, 111111)
    t.is(illust.title, 'Test Illust')
    t.is(illust.type, 0)
    t.is(illust.author_name, 'Test Artist')
    t.deepEqual(illust.tags, ['tag1', 'tag2'])

    // Check images in MongoDB-compatible format
    t.truthy(illust.imgs_)
    t.is(illust.imgs_.thumb_urls.length, 2)
    t.is(illust.imgs_.thumb_urls[0], 'https://i.pximg.net/thumb.jpg')
    t.is(illust.imgs_.size[0].width, 1000)
    t.is(illust.imgs_.size[1].width, 1200)
    t.deepEqual(illust.imgs_.tg_file_ids, [null, null])
})

// Test 2: Get ugoira illust - using new getIllust() API
test('getIllust returns ugoira with metadata', async t => {
    const { pool } = t.context

    const illust = await getIllust(222222, pool)

    t.truthy(illust)
    t.is(illust.id, 222222)
    t.is(illust.title, 'Test Ugoira')
    t.is(illust.type, 2) // ugoira type

    // Check ugoira metadata in MongoDB-compatible format
    t.truthy(illust.imgs_)
    t.is(illust.imgs_.cover_img_url, 'https://i.pximg.net/ugoira_cover.jpg')
    t.is(illust.imgs_.size[0].width, 800)
    t.is(illust.imgs_.size[0].height, 600)
})

// Test 3: Non-existent illust returns null
test('getIllust returns null for non-existent ID', async t => {
    const { pool } = t.context

    const illust = await getIllust(999999, pool)

    t.is(illust, null)
})

// Test 4: Update existing illust
test('updateIllust updates existing illust', async t => {
    const { pool } = t.context

    // Update illust
    await updateIllust(111111, {
        title: 'Updated Title',
        tags: ['new-tag', 'updated'],
        x_restrict: 1
    }, pool)

    // Verify update
    const illust = await getIllust(111111, pool)
    t.is(illust.title, 'Updated Title')
    t.deepEqual(illust.tags, ['new-tag', 'updated'])
    t.is(illust.x_restrict, 1)
})

// Test 5: Upsert new illust with images
test('updateIllust creates new illust with upsert', async t => {
    const { pool } = t.context

    // Insert new illust
    await updateIllust(333333, {
        id: 333333,
        title: 'New Illust',
        type: 0,
        author_id: 12345,
        author_name: 'Test Artist',
        tags: ['tag1'],
        x_restrict: 0,
        ai_type: 0,
        imgs_: {
            thumb_urls: ['https://example.com/thumb.jpg'],
            regular_urls: ['https://example.com/regular.jpg'],
            original_urls: ['https://example.com/original.jpg'],
            size: [{ width: 500, height: 500 }]
        }
    }, pool, { upsert: true })

    // Verify created
    const illust = await getIllust(333333, pool)
    t.truthy(illust)
    t.is(illust.title, 'New Illust')
    t.is(illust.imgs_.thumb_urls[0], 'https://example.com/thumb.jpg')
})

// Test 6: Update ugoira metadata
test('updateIllust updates ugoira metadata', async t => {
    const { pool } = t.context

    // Update ugoira
    await updateIllust(222222, {
        type: 2,
        imgs_: {
            cover_img_url: 'https://example.com/new_cover.jpg',
            size: [{ width: 1920, height: 1080 }]
        },
        tg_file_id: 'new_telegram_file_id'
    }, pool)

    // Verify update
    const illust = await getIllust(222222, pool)
    t.is(illust.imgs_.cover_img_url, 'https://example.com/new_cover.jpg')
    t.is(illust.imgs_.size[0].width, 1920)
    t.is(illust.tg_file_id, 'new_telegram_file_id')
})

test('regular illustration file IDs are written and read in page order', async t => {
    const { pool } = t.context
    const result = await updateIllustImageFileIds(111111, [
        { pageIndex: 1, fileId: 'page-one-file' },
        { pageIndex: 0, fileId: 'page-zero-file' }
    ], pool)
    const illust = await getIllust(111111, pool)
    t.true(result.acknowledged)
    t.is(result.modifiedCount, 2)
    t.deepEqual(illust.imgs_.tg_file_ids, ['page-zero-file', 'page-one-file'])
    t.false('tg_file_id' in illust)
})

test('regular illustrations reject the superseded work-level file ID path', async t => {
    const error = await t.throwsAsync(updateIllust(111111, {
        type: 0,
        tg_file_id: 'legacy-page-zero-file'
    }, t.context.pool))
    t.is(error.message, 'Regular illustration file IDs must be written by page')
})

test('regular image refresh preserves unchanged URLs, invalidates changed URLs, and deletes removed pages', async t => {
    const { pool } = t.context
    await updateIllustImageFileIds(111111, [
        { pageIndex: 0, fileId: 'keep-me' },
        { pageIndex: 1, fileId: 'invalidate-me' }
    ], pool)

    await updateIllust(111111, {
        type: 0,
        imgs_: {
            thumb_urls: ['https://i.pximg.net/new-thumb.jpg'],
            regular_urls: ['https://i.pximg.net/regular.jpg'],
            original_urls: ['https://i.pximg.net/new-original.jpg'],
            size: [{ width: 2000, height: 2000 }]
        }
    }, pool)
    let illust = await getIllust(111111, pool)
    t.deepEqual(illust.imgs_.tg_file_ids, ['keep-me'])
    t.is(illust.imgs_.size.length, 1)

    await updateIllust(111111, {
        type: 0,
        imgs_: {
            thumb_urls: ['https://i.pximg.net/new-thumb.jpg'],
            regular_urls: ['https://i.pximg.net/changed-regular.jpg'],
            original_urls: ['https://i.pximg.net/new-original.jpg'],
            size: [{ width: 2000, height: 2000 }]
        }
    }, pool)
    illust = await getIllust(111111, pool)
    t.deepEqual(illust.imgs_.tg_file_ids, [null])
})

// Test 8: Update tg_file_id for ugoira (without imgs_)
test('updateIllust updates tg_file_id for ugoira separately', async t => {
    const { pool } = t.context

    // Update only tg_file_id for ugoira
    await updateIllust(222222, {
        type: 2,
        tg_file_id: 'ugoira_file_id_updated'
    }, pool)

    // Verify update
    const illust = await getIllust(222222, pool)
    t.is(illust.tg_file_id, 'ugoira_file_id_updated')
})

// Test 9: Delete illust
test('deleteIllust removes illust and related data', async t => {
    const { pool } = t.context

    // Verify illust exists
    let illust = await getIllust(111111, pool)
    t.truthy(illust)

    // Delete illust
    const result = await deleteIllust(111111, pool)
    t.is(result.acknowledged, true)
    t.is(result.deletedCount, 1)

    // Verify illust is gone
    illust = await getIllust(111111, pool)
    t.is(illust, null)
})

// Test 10: Delete ugoira
test('deleteIllust removes ugoira and metadata', async t => {
    const { pool } = t.context

    // Delete ugoira
    const result = await deleteIllust(222222, pool)
    t.is(result.acknowledged, true)
    t.is(result.deletedCount, 1)

    // Verify deletion
    const illust = await getIllust(222222, pool)
    t.is(illust, null)
})

// Test 11: Find many illusts by IDs
test('findManyIllusts returns multiple illusts', async t => {
    const { pool } = t.context

    const illusts = await findManyIllusts([111111, 222222], pool)

    t.is(illusts.length, 2)

    // Check both illusts are present
    const ids = illusts.map(i => i.id)
    t.true(ids.includes(111111))
    t.true(ids.includes(222222))

    // Verify data structure
    const regularIllust = illusts.find(i => i.id === 111111)
    t.is(regularIllust.title, 'Test Illust')
    t.truthy(regularIllust.imgs_)
    t.is(regularIllust.imgs_.thumb_urls.length, 2)

    const ugoiraIllust = illusts.find(i => i.id === 222222)
    t.is(ugoiraIllust.type, 2)
    t.truthy(ugoiraIllust.imgs_)
    t.is(ugoiraIllust.imgs_.cover_img_url, 'https://i.pximg.net/ugoira_cover.jpg')
})

// Test 12: Find many illusts with some non-existent IDs
test('findManyIllusts handles mixed existing and non-existing IDs', async t => {
    const { pool } = t.context

    const illusts = await findManyIllusts([111111, 999999, 222222], pool)

    // Should only return existing illusts
    t.is(illusts.length, 2)
    const ids = illusts.map(i => i.id)
    t.true(ids.includes(111111))
    t.true(ids.includes(222222))
    t.false(ids.includes(999999))
})

// Test 13: Find many illusts with empty array
test('findManyIllusts returns empty array for empty input', async t => {
    const { pool } = t.context

    const illusts = await findManyIllusts([], pool)

    t.deepEqual(illusts, [])
})
