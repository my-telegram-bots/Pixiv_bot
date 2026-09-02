import test from 'ava'
import { readFileSync } from 'fs'
import { withTransaction } from '../postgres-transaction.js'
import {
    applyPatch,
    assertAutoPatchTransactionOwnership
} from '../db-migration-check.js'

function createFakePool(queryImplementation = async () => ({ rows: [], rowCount: 0 })) {
    const calls = []
    let releaseCount = 0
    const client = {
        async query(sql, values) {
            calls.push({ sql, values })
            return await queryImplementation(sql, values)
        },
        release() {
            releaseCount++
        }
    }
    const pool = {
        async connect() {
            return client
        },
        async query() {
            throw new Error('transaction used pool.query instead of the checked-out client')
        }
    }

    return {
        pool,
        client,
        calls,
        get releaseCount() {
            return releaseCount
        }
    }
}

test('withTransaction commits all work on one checked-out client and releases it', async t => {
    const fake = createFakePool()

    const result = await withTransaction(fake.pool, async client => {
        t.is(client, fake.client)
        await client.query('UPDATE example SET value = $1', ['committed'])
        return 'result'
    })

    t.is(result, 'result')
    t.deepEqual(fake.calls.map(call => call.sql), [
        'BEGIN',
        'UPDATE example SET value = $1',
        'COMMIT'
    ])
    t.is(fake.releaseCount, 1)
})

test('withTransaction rolls back callback failures, releases the client, and keeps the original error', async t => {
    const fake = createFakePool()
    const operationError = new Error('operation failed')

    const error = await t.throwsAsync(withTransaction(fake.pool, async client => {
        await client.query('INSERT INTO example VALUES ($1)', [1])
        throw operationError
    }))

    t.is(error, operationError)
    t.deepEqual(fake.calls.map(call => call.sql), [
        'BEGIN',
        'INSERT INTO example VALUES ($1)',
        'ROLLBACK'
    ])
    t.is(fake.releaseCount, 1)
})

test('withTransaction preserves the operation error when rollback also fails', async t => {
    const rollbackError = new Error('rollback failed')
    const fake = createFakePool(async sql => {
        if (sql === 'ROLLBACK') throw rollbackError
        return { rows: [], rowCount: 0 }
    })
    const operationError = new Error('operation failed')

    const error = await t.throwsAsync(withTransaction(fake.pool, async () => {
        throw operationError
    }))

    t.is(error, operationError)
    t.is(error.rollbackError, rollbackError)
    t.is(fake.releaseCount, 1)
})

test('withTransaction releases the client without rollback when BEGIN fails', async t => {
    const beginError = new Error('begin failed')
    const fake = createFakePool(async sql => {
        if (sql === 'BEGIN') throw beginError
        return { rows: [], rowCount: 0 }
    })

    const error = await t.throwsAsync(withTransaction(fake.pool, async () => {
        t.fail('operation must not run when BEGIN fails')
    }))

    t.is(error, beginError)
    t.deepEqual(fake.calls.map(call => call.sql), ['BEGIN'])
    t.is(fake.releaseCount, 1)
})

test('applyPatch commits patch SQL and its migration ledger entry on one client', async t => {
    const fake = createFakePool()

    await applyPatch(fake.pool, 'patch-001-add-random-value.sql')

    t.is(fake.calls[0].sql, 'BEGIN')
    t.regex(fake.calls[1].sql, /ALTER TABLE illust ADD COLUMN/)
    t.false(/^(?:\s*)(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(fake.calls[1].sql))
    t.regex(fake.calls[2].sql, /INSERT INTO schema_migrations/)
    t.deepEqual(fake.calls[2].values[0], 'patch-001-add-random-value')
    t.is(fake.calls[3].sql, 'COMMIT')
    t.is(fake.releaseCount, 1)
})

test('applyPatch rolls back patch SQL when its migration ledger entry fails', async t => {
    const ledgerError = new Error('ledger insert failed')
    const fake = createFakePool(async sql => {
        if (/INSERT INTO schema_migrations/.test(sql)) throw ledgerError
        return { rows: [], rowCount: 0 }
    })

    const error = await t.throwsAsync(
        applyPatch(fake.pool, 'patch-001-add-random-value.sql')
    )

    t.is(error, ledgerError)
    t.deepEqual(fake.calls.map(call => {
        if (/ALTER TABLE illust ADD COLUMN/.test(call.sql)) return 'PATCH'
        if (/INSERT INTO schema_migrations/.test(call.sql)) return 'LEDGER'
        return call.sql
    }), ['BEGIN', 'PATCH', 'LEDGER', 'ROLLBACK'])
    t.is(fake.releaseCount, 1)
})

test('auto-apply patches reject nested transaction control', t => {
    const error = t.throws(() => {
        assertAutoPatchTransactionOwnership(
            'ALTER TABLE example ADD COLUMN value INT;\nCOMMIT;',
            'patch-999-invalid.sql'
        )
    })

    t.is(error.code, 'AUTO_PATCH_TRANSACTION_CONTROL')
})

test('runtime transaction entry points do not issue transaction control through a pool', t => {
    const source = readFileSync(new URL('../db.js', import.meta.url), 'utf-8')

    t.false(/\b(?:pool|queryPool)\.query\(\s*['"](?:BEGIN|COMMIT|ROLLBACK)['"]/.test(source))
    t.is((source.match(/withTransaction\(/g) || []).length, 4)
})
