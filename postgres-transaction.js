/**
 * Run an operation in a transaction on one checked-out PostgreSQL client.
 *
 * Pool.query() must never be used between BEGIN and COMMIT/ROLLBACK because
 * separate calls may be dispatched to different connections.
 */
export async function withTransaction(pool, operation) {
    if (!pool || typeof pool.connect !== 'function') {
        throw new TypeError('withTransaction requires a PostgreSQL pool')
    }
    if (typeof operation !== 'function') {
        throw new TypeError('withTransaction requires an operation function')
    }

    const client = await pool.connect()
    let transactionStarted = false

    try {
        await client.query('BEGIN')
        transactionStarted = true

        const result = await operation(client)
        await client.query('COMMIT')
        return result
    } catch (error) {
        if (transactionStarted) {
            try {
                await client.query('ROLLBACK')
            } catch (rollbackError) {
                try {
                    Object.defineProperty(error, 'rollbackError', {
                        value: rollbackError,
                        configurable: true
                    })
                } catch {
                    // Preserve and rethrow the original operation error.
                }
            }
        }
        throw error
    } finally {
        client.release()
    }
}
