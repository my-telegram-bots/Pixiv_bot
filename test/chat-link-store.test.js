import test from 'ava'
import { newDb } from 'pg-mem'
import { createChatLinkStore } from '../handlers/telegram/chat-link-store.js'

test.beforeEach(async t => {
    const database = newDb()
    database.public.none(`
        CREATE TABLE chat_link (
            source_chat_id BIGINT NOT NULL,
            linked_chat_id BIGINT NOT NULL,
            sync SMALLINT DEFAULT 0,
            administrator_only SMALLINT DEFAULT 0,
            repeat SMALLINT DEFAULT 0,
            chat_type TEXT,
            mediagroup_count SMALLINT DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (source_chat_id, linked_chat_id)
        )
    `)
    const adapter = database.adapters.createPg()
    const pool = new adapter.Pool()
    t.context.pool = pool
    t.context.store = createChatLinkStore({ getPool: () => pool })
})

test.afterEach.always(async t => {
    await t.context.pool?.end()
})

test('chat-link store creates multiple targets and preserves an existing target', async t => {
    const first = await t.context.store.createLink(-10, { id: -20, type: 'channel' })
    t.true(first.created)
    await t.context.store.updateOption(-10, -20, 'repeat', 0, 1)

    const duplicate = await t.context.store.createLink(-10, { id: -20, type: 'channel' })
    const second = await t.context.store.createLink(-10, { id: -30, type: 'supergroup' })

    t.false(duplicate.created)
    t.is(duplicate.link.repeat, 1)
    t.true(second.created)
    t.deepEqual((await t.context.store.listLinks(-10)).map(link => link.linkedChatId), [-20, -30])
})

test('chat-link store updates one option conditionally without overwriting another', async t => {
    await t.context.store.createLink(-10, { id: -20, type: 'channel' })

    const syncUpdate = await t.context.store.updateOption(-10, -20, 'sync', 0, 1)
    const repeatUpdate = await t.context.store.updateOption(-10, -20, 'repeat', 0, 2)
    const staleUpdate = await t.context.store.updateOption(-10, -20, 'sync', 0, 1)

    t.is(syncUpdate.status, 'updated')
    t.is(repeatUpdate.status, 'updated')
    t.is(staleUpdate.status, 'stale')
    t.is(staleUpdate.link.sync, 1)
    t.is(staleUpdate.link.repeat, 2)
})

test('a stale callback cannot recreate a deleted link', async t => {
    await t.context.store.createLink(-10, { id: -20, type: 'channel' })
    t.truthy(await t.context.store.deleteLink(-10, -20))

    const result = await t.context.store.updateOption(-10, -20, 'sync', 0, 1)

    t.is(result.status, 'missing')
    t.is(await t.context.store.getLink(-10, -20), null)
})

test('chat-link store rejects unavailable PostgreSQL and invalid option values', async t => {
    const unavailable = createChatLinkStore({ getPool: () => null })
    const missingError = await t.throwsAsync(() => unavailable.listLinks(-10))
    t.is(missingError.code, 'LINK_DB_UNAVAILABLE')

    await t.context.store.createLink(-10, { id: -20, type: 'channel' })
    const invalidError = await t.throwsAsync(
        () => t.context.store.updateOption(-10, -20, 'repeat', 0, 9)
    )
    t.is(invalidError.code, 'LINK_CALLBACK_INVALID')
})
