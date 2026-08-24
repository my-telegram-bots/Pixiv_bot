const OPTION_COLUMNS = Object.freeze({
    sync: { column: 'sync', values: new Set([0, 1]) },
    administrator_only: { column: 'administrator_only', values: new Set([0, 1]) },
    repeat: { column: 'repeat', values: new Set([0, 1, 2]) }
})

function dbUnavailable() {
    const error = new Error('PostgreSQL is required for linked chats')
    error.code = 'LINK_DB_UNAVAILABLE'
    return error
}

function normalizeRow(row) {
    if (!row) return null
    return {
        sourceChatId: Number(row.source_chat_id),
        linkedChatId: Number(row.linked_chat_id),
        sync: Number(row.sync),
        administratorOnly: Number(row.administrator_only),
        repeat: Number(row.repeat),
        chatType: row.chat_type,
        mediaGroupCount: Number(row.mediagroup_count || 1)
    }
}

export function linkOptionDefinition(field) {
    return OPTION_COLUMNS[field] || null
}

export function createChatLinkStore({ getPool }) {
    if (typeof getPool !== 'function') {
        throw new Error('createChatLinkStore requires getPool')
    }

    function pool() {
        const current = getPool()
        if (!current) throw dbUnavailable()
        return current
    }

    async function getLink(sourceChatId, linkedChatId) {
        const result = await pool().query(
            `SELECT source_chat_id, linked_chat_id, sync, administrator_only,
                    repeat, chat_type, mediagroup_count
             FROM chat_link
             WHERE source_chat_id = $1 AND linked_chat_id = $2`,
            [sourceChatId, linkedChatId]
        )
        return normalizeRow(result.rows[0])
    }

    return {
        async listLinks(sourceChatId) {
            const result = await pool().query(
                `SELECT source_chat_id, linked_chat_id, sync, administrator_only,
                        repeat, chat_type, mediagroup_count
                 FROM chat_link
                 WHERE source_chat_id = $1
                 ORDER BY created_at, linked_chat_id`,
                [sourceChatId]
            )
            return result.rows.map(normalizeRow)
        },

        getLink,

        async createLink(sourceChatId, linkedChat) {
            const existing = await getLink(sourceChatId, linkedChat.id)
            if (existing) return { created: false, link: existing }
            const result = await pool().query(
                `INSERT INTO chat_link (
                    source_chat_id, linked_chat_id, sync,
                    administrator_only, repeat, chat_type, mediagroup_count
                 ) VALUES ($1, $2, 0, 0, 0, $3, 1)
                 ON CONFLICT (source_chat_id, linked_chat_id) DO NOTHING
                 RETURNING source_chat_id, linked_chat_id, sync,
                           administrator_only, repeat, chat_type, mediagroup_count`,
                [sourceChatId, linkedChat.id, linkedChat.type]
            )
            if (result.rows[0]) {
                return { created: true, link: normalizeRow(result.rows[0]) }
            }
            return { created: false, link: await getLink(sourceChatId, linkedChat.id) }
        },

        async updateOption(sourceChatId, linkedChatId, field, expectedValue, nextValue) {
            const definition = linkOptionDefinition(field)
            if (!definition || !definition.values.has(expectedValue) || !definition.values.has(nextValue)) {
                const error = new Error('Invalid linked-chat option')
                error.code = 'LINK_CALLBACK_INVALID'
                throw error
            }
            const result = await pool().query(
                `UPDATE chat_link
                 SET ${definition.column} = $4, updated_at = NOW()
                 WHERE source_chat_id = $1
                   AND linked_chat_id = $2
                   AND ${definition.column} = $3
                 RETURNING source_chat_id, linked_chat_id, sync,
                           administrator_only, repeat, chat_type, mediagroup_count`,
                [sourceChatId, linkedChatId, expectedValue, nextValue]
            )
            if (result.rows[0]) {
                return { status: 'updated', link: normalizeRow(result.rows[0]) }
            }
            const link = await getLink(sourceChatId, linkedChatId)
            return link ? { status: 'stale', link } : { status: 'missing', link: null }
        },

        async deleteLink(sourceChatId, linkedChatId) {
            const result = await pool().query(
                `DELETE FROM chat_link
                 WHERE source_chat_id = $1 AND linked_chat_id = $2
                 RETURNING source_chat_id, linked_chat_id, sync,
                           administrator_only, repeat, chat_type, mediagroup_count`,
                [sourceChatId, linkedChatId]
            )
            return normalizeRow(result.rows[0])
        }
    }
}
