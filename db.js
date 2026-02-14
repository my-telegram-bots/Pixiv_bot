import config from '#config'
import pg from 'pg'
const { Pool } = pg

let pool = null

export function getPool() {
    return pool
}

export let db = {
    collection: dummy_collection
}

export let collection = {
    illust: dummy_collection(),
    chat_setting: dummy_collection(),
    novel: dummy_collection(),
    ranking: dummy_collection(),
    author: dummy_collection(),
    telegraph: dummy_collection()
}

/**
 * Initialize PostgreSQL connection
 */
export async function db_initial() {
    if (process.env.DBLESS) {
        console.warn('WARNING', 'No Database Mode(DBLESS) is not recommend for production environment.')
    } else {
        try {
            pool = new Pool({
                connectionString: config.postgres.uri,
                max: 50,                      // Increase for 2.2M dataset
                min: 5,                       // Keep warm connections
                idleTimeoutMillis: 30000,     // Close idle after 30s
                connectionTimeoutMillis: 3000, // Timeout acquiring connection
                statement_timeout: 30000       // Kill queries after 30s
            })
            // Test connection
            await pool.query('SELECT 1')
            console.log('PostgreSQL connected')

            // Initialize collection wrappers
            collection.illust = createIllustCollection()
            collection.chat_setting = createChatSettingCollection()
            collection.novel = createNovelCollection()
            collection.ranking = createRankingCollection()
            collection.author = createAuthorCollection()
            collection.telegraph = createTelegraphCollection()

            db = { collection: (name) => collection[name] }
        }
        catch (error) {
            console.error('Connect Database Error', error)
            process.exit()
        }
    }
}

/**
 * Close PostgreSQL connection pool
 */
export async function db_close() {
    if (pool) {
        await pool.end()
        console.log('PostgreSQL pool closed')
    }
}

// ============================================
// New Direct SQL API (No Wrapper)
// ============================================

/**
 * Get illust by ID
 * Returns MongoDB-compatible format for backward compatibility
 * @param {number} id - Illust ID
 * @param {Pool} testPool - Optional pool for testing (uses global pool if not provided)
 */
export async function getIllust(id, testPool = null) {
    const queryPool = testPool || pool

    if (!queryPool) {
        return null
    }

    const illustResult = await queryPool.query(
        'SELECT i.*, a.author_name FROM illust i LEFT JOIN author a ON i.author_id = a.author_id WHERE i.id = $1',
        [id]
    )

    if (!illustResult.rows[0]) {
        return null
    }

    const illust = illustResult.rows[0]

    // For ugoira (type=2), get ugoira_meta
    if (illust.type === 2) {
        const ugoiraResult = await queryPool.query(
            'SELECT * FROM ugoira_meta WHERE illust_id = $1',
            [id]
        )
        const ugoira = ugoiraResult.rows[0]
        return rebuildIllustFromRow(illust, [], ugoira)
    }

    // For regular illusts, get images
    const imagesResult = await queryPool.query(
        'SELECT * FROM illust_image WHERE illust_id = $1 ORDER BY page_index',
        [id]
    )

    return rebuildIllustFromRow(illust, imagesResult.rows, null)
}

/**
 * Update or insert illust
 * @param {number} id - Illust ID
 * @param {object} data - Data to update (can include imgs_, author_name, etc.)
 * @param {Pool} testPool - Optional pool for testing
 * @param {object} options - Options like { upsert: true }
 */
export async function updateIllust(id, data, testPool = null, options = {}) {
    const queryPool = testPool || pool

    if (!queryPool) {
        return { acknowledged: false }
    }

    const upsert = options.upsert || false

    try {
        await queryPool.query('BEGIN')

        // Extract illust main fields
        const illustFields = ['title', 'type', 'comment', 'description', 'author_id',
            'tags', 'sl', 'restrict', 'x_restrict', 'ai_type', 'page_count', 'deleted', 'deleted_at']
        const illustData = {}
        for (const field of illustFields) {
            if (data[field] !== undefined) {
                illustData[field] = data[field]
            }
        }

        // Handle author - insert or update author_name
        if (data.author_id && data.author_name) {
            await queryPool.query(`
                INSERT INTO author (author_id, author_name)
                VALUES ($1, $2)
                ON CONFLICT (author_id) DO UPDATE SET author_name = $2, updated_at = NOW()
            `, [data.author_id, data.author_name])
        }

        // Upsert illust main table
        if (Object.keys(illustData).length > 0 || upsert) {
            const columns = ['id', ...Object.keys(illustData)]
            const values = [id, ...Object.values(illustData)]
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')

            const updateClauses = Object.keys(illustData)
                .map((col, i) => `${col} = $${i + 2}`)
                .join(', ')

            if (updateClauses) {
                await queryPool.query(`
                    INSERT INTO illust (${columns.join(', ')})
                    VALUES (${placeholders})
                    ON CONFLICT (id) DO UPDATE SET ${updateClauses}, updated_at = NOW()
                `, values)
            } else if (upsert) {
                await queryPool.query(`
                    INSERT INTO illust (id, title) VALUES ($1, $2)
                    ON CONFLICT (id) DO NOTHING
                `, [id, data.title || ''])
            }
        }

        // Handle imgs_ field - convert to illust_image or ugoira_meta rows
        if (data.imgs_) {
            const imgs = data.imgs_
            const type = data.type ?? 0

            if (type === 2 && imgs.cover_img_url) {
                // Ugoira - update ugoira_meta
                await queryPool.query(`
                    INSERT INTO ugoira_meta (illust_id, cover_img_url, width, height)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (illust_id) DO UPDATE SET
                        cover_img_url = $2, width = $3, height = $4, updated_at = NOW()
                `, [
                    id,
                    imgs.cover_img_url,
                    imgs.size?.[0]?.width || null,
                    imgs.size?.[0]?.height || null
                ])
            } else if (imgs.thumb_urls) {
                // Regular illust - update illust_image
                // Delete existing images first
                await queryPool.query('DELETE FROM illust_image WHERE illust_id = $1', [id])

                // Insert new images
                for (let i = 0; i < imgs.thumb_urls.length; i++) {
                    await queryPool.query(`
                        INSERT INTO illust_image (illust_id, page_index, thumb_url, regular_url, original_url, width, height)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [
                        id,
                        i,
                        imgs.thumb_urls[i] || null,
                        imgs.regular_urls?.[i] || null,
                        imgs.original_urls?.[i] || null,
                        imgs.size?.[i]?.width || null,
                        imgs.size?.[i]?.height || null
                    ])
                }
            }
        }

        // Handle tg_file_id update
        if (data.tg_file_id !== undefined) {
            if (data.type === 2) {
                // Ugoira - update ugoira_meta
                await queryPool.query(`
                    UPDATE ugoira_meta SET tg_file_id = $1, updated_at = NOW()
                    WHERE illust_id = $2
                `, [data.tg_file_id, id])
            } else {
                // Regular illust - update first image's tg_file_id
                await queryPool.query(`
                    UPDATE illust_image
                    SET tg_file_id = $1, updated_at = NOW()
                    WHERE illust_id = $2 AND page_index = 0
                `, [data.tg_file_id, id])
            }
        }

        await queryPool.query('COMMIT')
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
    } catch (error) {
        await queryPool.query('ROLLBACK')
        console.error('updateIllust error:', error)
        throw error
    }
}

/**
 * Delete an illust from the database
 * @param {number} id - Illust ID
 * @param {Pool} testPool - Optional test pool
 * @returns {Promise<Object>} Result with deletedCount
 */
export async function deleteIllust(id, testPool = null) {
    const queryPool = testPool || pool
    if (!queryPool) return { acknowledged: true, deletedCount: 0 }

    try {
        await queryPool.query('BEGIN')

        // Delete related data first (foreign keys cascade if set, but let's be explicit)
        await queryPool.query('DELETE FROM illust_image WHERE illust_id = $1', [id])
        await queryPool.query('DELETE FROM ugoira_meta WHERE illust_id = $1', [id])

        // Delete the main illust record
        const result = await queryPool.query('DELETE FROM illust WHERE id = $1', [id])

        await queryPool.query('COMMIT')
        return { acknowledged: true, deletedCount: result.rowCount }
    } catch (error) {
        await queryPool.query('ROLLBACK')
        console.error('deleteIllust error:', error)
        throw error
    }
}

/**
 * Find multiple illusts by IDs
 * @param {number[]} ids - Array of illust IDs
 * @param {Pool} testPool - Optional test pool
 * @returns {Promise<Array>} Array of illust objects
 */
export async function findManyIllusts(ids, testPool = null) {
    const queryPool = testPool || pool
    if (!queryPool) return []
    if (!Array.isArray(ids) || ids.length === 0) return []

    // Simpler approach that works with pg-mem: fetch each illust separately
    // In production PostgreSQL, we could use a more optimized query with json_agg
    // But for compatibility with pg-mem (testing), we use this approach
    const results = await Promise.all(ids.map(id => getIllust(id, queryPool)))

    // Filter out null results (non-existent illusts)
    return results.filter(illust => illust !== null)
}

/**
 * Helper: Rebuild MongoDB-style illust object from PostgreSQL rows
 */
function rebuildIllustFromRow(illust, images, ugoira) {
    const result = {
        id: illust.id,
        title: illust.title || '',
        type: illust.type,
        comment: illust.comment,
        description: illust.description,
        author_id: illust.author_id,
        author_name: illust.author_name || 'Unknown',
        tags: Array.isArray(illust.tags) ? illust.tags : [],
        sl: illust.sl,
        restrict: illust.restrict,
        x_restrict: illust.x_restrict,
        ai_type: illust.ai_type,
        deleted: illust.deleted,
        deleted_at: illust.deleted_at
    }

    if (illust.type === 2 && ugoira) {
        // Ugoira
        result.imgs_ = {
            cover_img_url: ugoira.cover_img_url,
            size: [{ width: ugoira.width, height: ugoira.height }]
        }
        result.tg_file_id = ugoira.tg_file_id
    } else if (images && images.length > 0) {
        // Regular illust
        result.imgs_ = {
            thumb_urls: images.map(img => img.thumb_url),
            regular_urls: images.map(img => img.regular_url),
            original_urls: images.map(img => img.original_url),
            size: images.map(img => ({ width: img.width, height: img.height }))
        }
        if (images[0]?.tg_file_id) {
            result.tg_file_id = images[0].tg_file_id
        }
    }

    return result
}

// ============================================
// Illust Collection Wrapper
// ============================================
function createIllustCollection() {
    return {
        findOne: async (query) => {
            if (!query || query.id === undefined) return null
            const id = query.id

            const illustResult = await pool.query(
                'SELECT i.*, a.author_name FROM illust i LEFT JOIN author a ON i.author_id = a.author_id WHERE i.id = $1',
                [id]
            )
            if (!illustResult.rows[0]) return null

            const illust = illustResult.rows[0]

            // For ugoira (type=2), get ugoira_meta
            if (illust.type === 2) {
                const ugoiraResult = await pool.query(
                    'SELECT * FROM ugoira_meta WHERE illust_id = $1',
                    [id]
                )
                const ugoira = ugoiraResult.rows[0]
                if (ugoira) {
                    return rebuildIllustObject(illust, [], ugoira)
                }
            }

            // For regular illusts, get images
            const imagesResult = await pool.query(
                'SELECT * FROM illust_image WHERE illust_id = $1 ORDER BY page_index',
                [id]
            )

            return rebuildIllustObject(illust, imagesResult.rows, null)
        },

        find: (query) => {
            return new PostgresCursor('illust', query, pool)
        },

        updateOne: async (query, update, options = {}) => {
            const id = query.id
            const data = update.$set || {}
            const upsert = options.upsert || false

            try {
                await pool.query('BEGIN')

                // Extract illust main fields
                const illustFields = ['title', 'type', 'comment', 'description', 'author_id',
                    'tags', 'sl', 'restrict', 'x_restrict', 'ai_type', 'page_count', 'deleted', 'deleted_at']
                const illustData = {}
                for (const field of illustFields) {
                    if (data[field] !== undefined) {
                        illustData[field] = data[field]
                    }
                }

                // Handle author - insert or update author_name
                if (data.author_id && data.author_name) {
                    await pool.query(`
                        INSERT INTO author (author_id, author_name)
                        VALUES ($1, $2)
                        ON CONFLICT (author_id) DO UPDATE SET author_name = $2, updated_at = NOW()
                    `, [data.author_id, data.author_name])
                }

                // Upsert illust main table
                if (Object.keys(illustData).length > 0 || upsert) {
                    const columns = ['id', ...Object.keys(illustData)]
                    const values = [id, ...Object.values(illustData)]
                    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')

                    const updateClauses = Object.keys(illustData)
                        .map((col, i) => `${col} = $${i + 2}`)
                        .join(', ')

                    if (updateClauses) {
                        await pool.query(`
                            INSERT INTO illust (${columns.join(', ')})
                            VALUES (${placeholders})
                            ON CONFLICT (id) DO UPDATE SET ${updateClauses}, updated_at = NOW()
                        `, values)
                    } else if (upsert) {
                        await pool.query(`
                            INSERT INTO illust (id, title) VALUES ($1, $2)
                            ON CONFLICT (id) DO NOTHING
                        `, [id, data.title || ''])
                    }
                }

                // Handle imgs_ field - convert to illust_image rows
                if (data.imgs_) {
                    const imgs = data.imgs_
                    const type = data.type ?? 0

                    if (type === 2 && imgs.cover_img_url) {
                        // Ugoira - update ugoira_meta
                        await pool.query(`
                            INSERT INTO ugoira_meta (illust_id, cover_img_url, width, height)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (illust_id) DO UPDATE SET
                                cover_img_url = $2, width = $3, height = $4, updated_at = NOW()
                        `, [
                            id,
                            imgs.cover_img_url,
                            imgs.size?.[0]?.width || null,
                            imgs.size?.[0]?.height || null
                        ])
                    } else if (imgs.thumb_urls) {
                        // Regular illust - update illust_image
                        // Delete existing images first
                        await pool.query('DELETE FROM illust_image WHERE illust_id = $1', [id])

                        // Insert new images
                        for (let i = 0; i < imgs.thumb_urls.length; i++) {
                            await pool.query(`
                                INSERT INTO illust_image (illust_id, page_index, thumb_url, regular_url, original_url, width, height)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)
                            `, [
                                id,
                                i,
                                imgs.thumb_urls[i] || null,
                                imgs.regular_urls?.[i] || null,
                                imgs.original_urls?.[i] || null,
                                imgs.size?.[i]?.width || null,
                                imgs.size?.[i]?.height || null
                            ])
                        }
                    }
                }

                // Handle tg_file_id update for ugoira
                if (data.tg_file_id !== undefined && data.type === 2) {
                    await pool.query(`
                        UPDATE ugoira_meta SET tg_file_id = $1, updated_at = NOW()
                        WHERE illust_id = $2
                    `, [data.tg_file_id, id])
                }

                await pool.query('COMMIT')
                return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
            } catch (error) {
                await pool.query('ROLLBACK')
                console.error('updateOne error:', error)
                throw error
            }
        },

        insertOne: async (doc) => {
            // Use direct updateIllust with upsert
            return await updateIllust(doc.id, doc, pool, { upsert: true })
        },

        deleteOne: async (query) => {
            // Use direct deleteIllust
            return await deleteIllust(query.id, pool)
        },

        createIndex: async () => {
            // Indexes are created in schema.sql
            return true
        }
    }
}

/**
 * Rebuild MongoDB-style illust object from PostgreSQL data
 */
function rebuildIllustObject(illust, images, ugoira) {
    const result = {
        id: illust.id,
        title: illust.title || '',
        type: illust.type,
        comment: illust.comment,
        description: illust.description,
        author_id: illust.author_id,
        author_name: illust.author_name || 'Unknown', // Null safety
        tags: Array.isArray(illust.tags) ? illust.tags : [],
        sl: illust.sl,
        restrict: illust.restrict,
        x_restrict: illust.x_restrict,
        ai_type: illust.ai_type,
        deleted: illust.deleted,
        deleted_at: illust.deleted_at
    }

    if (illust.type === 2 && ugoira) {
        // Ugoira
        result.imgs_ = {
            cover_img_url: ugoira.cover_img_url,
            size: [{ width: ugoira.width, height: ugoira.height }]
        }
        result.tg_file_id = ugoira.tg_file_id
    } else if (images.length > 0) {
        // Regular illust
        result.imgs_ = {
            thumb_urls: images.map(img => img.thumb_url),
            regular_urls: images.map(img => img.regular_url),
            original_urls: images.map(img => img.original_url),
            size: images.map(img => ({ width: img.width, height: img.height }))
        }
        // Use first image's tg_file_id as the illust's tg_file_id
        if (images[0]?.tg_file_id) {
            result.tg_file_id = images[0].tg_file_id
        }
    }

    return result
}

// ============================================
// Chat Setting Collection Wrapper
// ============================================
function createChatSettingCollection() {
    return {
        findOne: async (query) => {
            if (!query || query.id === undefined) return null
            const id = query.id

            // Check for subscription query
            for (const key in query) {
                if (key.startsWith('subscribe_author_list.')) {
                    const authorId = key.split('.')[1]
                    const result = await pool.query(
                        'SELECT 1 FROM chat_subscribe_author WHERE chat_id = $1 AND author_id = $2',
                        [id, authorId]
                    )
                    return result.rows[0] ? { id } : null
                }
                if (key.startsWith('subscribe_author_bookmarks_list.')) {
                    const authorId = key.split('.')[1]
                    const result = await pool.query(
                        'SELECT 1 FROM chat_subscribe_bookmarks WHERE chat_id = $1 AND author_id = $2',
                        [id, authorId]
                    )
                    return result.rows[0] ? { id } : null
                }
            }

            // Query main settings
            const settingResult = await pool.query('SELECT * FROM chat_setting WHERE id = $1', [id])
            const setting = settingResult.rows[0]

            if (!setting) {
                // Return empty object structure for new chats
                return null
            }

            // Query subscriptions
            const subscribeAuthorsResult = await pool.query(
                'SELECT author_id, subscribed_at FROM chat_subscribe_author WHERE chat_id = $1',
                [id]
            )
            const subscribeBookmarksResult = await pool.query(
                'SELECT author_id, subscribed_at FROM chat_subscribe_bookmarks WHERE chat_id = $1',
                [id]
            )

            // Query linked chats
            const linksResult = await pool.query(
                'SELECT * FROM chat_link WHERE source_chat_id = $1',
                [id]
            )

            return rebuildSettingObject(setting, subscribeAuthorsResult.rows, subscribeBookmarksResult.rows, linksResult.rows)
        },

        find: (query) => {
            return new ChatSettingCursor(query, pool)
        },

        updateOne: async (query, update, options = {}) => {
            const id = query.id
            const setData = update.$set || {}
            const unsetData = update.$unset || {}
            const upsert = options.upsert || false

            try {
                // START TRANSACTION
                await pool.query('BEGIN')

                // Handle $set operations
                if (Object.keys(setData).length > 0) {
                    const columns = []
                    const values = [id]
                    let paramIndex = 2

                    // Handle format fields
                    if (setData.format) {
                        for (const key in setData.format) {
                            columns.push(`format_${key} = $${paramIndex}`)
                            values.push(setData.format[key])
                            paramIndex++
                        }
                    }

                    // Handle default fields
                    if (setData.default) {
                        for (const key in setData.default) {
                            columns.push(`default_${key} = $${paramIndex}`)
                            values.push(setData.default[key])
                            paramIndex++
                        }
                    }

                    // Handle subscription lists
                    for (const key in setData) {
                        if (key.startsWith('subscribe_author_list.')) {
                            const authorId = key.split('.')[1]
                            await pool.query(`
                                INSERT INTO chat_subscribe_author (chat_id, author_id, subscribed_at)
                                VALUES ($1, $2, to_timestamp($3 / 1000.0))
                                ON CONFLICT DO NOTHING
                            `, [id, authorId, setData[key]])
                        } else if (key.startsWith('subscribe_author_bookmarks_list.')) {
                            const authorId = key.split('.')[1]
                            await pool.query(`
                                INSERT INTO chat_subscribe_bookmarks (chat_id, author_id, subscribed_at)
                                VALUES ($1, $2, to_timestamp($3 / 1000.0))
                                ON CONFLICT DO NOTHING
                            `, [id, authorId, setData[key]])
                        } else if (key.startsWith('link_chat_list.')) {
                            const linkedChatId = key.split('.')[1]
                            const linkData = setData[key]
                            await pool.query(`
                                INSERT INTO chat_link (source_chat_id, linked_chat_id, sync, administrator_only, repeat, chat_type, mediagroup_count)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)
                                ON CONFLICT (source_chat_id, linked_chat_id) DO UPDATE SET
                                    sync = $3, administrator_only = $4, repeat = $5, chat_type = $6, mediagroup_count = $7, updated_at = NOW()
                            `, [id, linkedChatId, linkData.sync || 0, linkData.administrator_only || 0, linkData.repeat || 0, linkData.type, linkData.mediagroup_count || 1])
                        }
                    }

                    // Update main table if there are columns to update
                    if (columns.length > 0 || upsert) {
                        if (columns.length > 0) {
                            await pool.query(`
                                INSERT INTO chat_setting (id) VALUES ($1)
                                ON CONFLICT (id) DO UPDATE SET ${columns.join(', ')}, updated_at = NOW()
                            `, values)
                        } else if (upsert) {
                            await pool.query(`
                                INSERT INTO chat_setting (id) VALUES ($1)
                                ON CONFLICT (id) DO NOTHING
                            `, [id])
                        }
                    }
                }

                // Handle $unset operations
                if (Object.keys(unsetData).length > 0) {
                    for (const key in unsetData) {
                        if (key.startsWith('subscribe_author_list.')) {
                            const authorId = key.split('.')[1]
                            await pool.query(
                                'DELETE FROM chat_subscribe_author WHERE chat_id = $1 AND author_id = $2',
                                [id, authorId]
                            )
                        } else if (key.startsWith('subscribe_author_bookmarks_list.')) {
                            const authorId = key.split('.')[1]
                            await pool.query(
                                'DELETE FROM chat_subscribe_bookmarks WHERE chat_id = $1 AND author_id = $2',
                                [id, authorId]
                            )
                        } else if (key.startsWith('link_chat_list.')) {
                            const linkedChatId = key.split('.')[1]
                            await pool.query(
                                'DELETE FROM chat_link WHERE source_chat_id = $1 AND linked_chat_id = $2',
                                [id, linkedChatId]
                            )
                        } else if (key === 'default') {
                            // Reset all default fields to null
                            await pool.query(`
                                UPDATE chat_setting SET
                                    default_tags = NULL, default_description = NULL, default_open = NULL,
                                    default_share = NULL, default_remove_keyboard = NULL, default_remove_caption = NULL,
                                    default_single_caption = NULL, default_album = NULL, default_album_one = NULL,
                                    default_album_equal = NULL, default_reverse = NULL, default_overwrite = NULL,
                                    default_asfile = NULL, default_append_file = NULL, default_append_file_immediate = NULL,
                                    default_caption_extraction = NULL, default_caption_above = NULL, default_show_id = NULL,
                                    default_auto_spoiler = NULL, default_telegraph_title = NULL,
                                    default_telegraph_author_name = NULL, default_telegraph_author_url = NULL,
                                    updated_at = NOW()
                                WHERE id = $1
                            `, [id])
                        } else if (key === 'format') {
                            // Reset all format fields to null
                            await pool.query(`
                                UPDATE chat_setting SET
                                    format_message = NULL, format_mediagroup_message = NULL,
                                    format_inline = NULL, format_version = 'v2',
                                    updated_at = NOW()
                                WHERE id = $1
                            `, [id])
                        }
                    }
                }

                // COMMIT TRANSACTION
                await pool.query('COMMIT')
                return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
            } catch (error) {
                // ROLLBACK ON ERROR
                await pool.query('ROLLBACK')
                console.error('chat_setting updateOne error:', error)
                throw error
            }
        },

        insertOne: async (doc) => {
            return collection.chat_setting.updateOne({ id: doc.id }, { $set: doc }, { upsert: true })
        },

        updateMany: async (query, update) => {
            // Convert MongoDB query to SQL WHERE conditions
            const conditions = []
            const values = []
            let paramIndex = 1

            // Handle format field matching
            if (query['format.message']) {
                conditions.push(`format_message = $${paramIndex}`)
                values.push(query['format.message'])
                paramIndex++
            }
            if (query['format.inline']) {
                conditions.push(`format_inline = $${paramIndex}`)
                values.push(query['format.inline'])
                paramIndex++
            }

            const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

            // Build SET clause from $set
            const setClauses = []
            if (update.$set) {
                for (const key in update.$set) {
                    if (key.startsWith('format.')) {
                        const field = 'format_' + key.split('.')[1]
                        setClauses.push(`${field} = $${paramIndex}`)
                        values.push(update.$set[key])
                        paramIndex++
                    }
                }
            }

            // Build UNSET clause
            if (update.$unset) {
                for (const key in update.$unset) {
                    if (key.startsWith('format.')) {
                        const field = 'format_' + key.split('.')[1]
                        setClauses.push(`${field} = NULL`)
                    }
                }
            }

            if (setClauses.length > 0) {
                const sql = `UPDATE chat_setting SET ${setClauses.join(', ')}, updated_at = NOW() ${whereClause}`
                const result = await pool.query(sql, values)
                return { acknowledged: true, matchedCount: result.rowCount, modifiedCount: result.rowCount }
            }

            return { acknowledged: true, matchedCount: 0, modifiedCount: 0 }
        },

        createIndex: async () => {
            return true
        }
    }
}

/**
 * Rebuild MongoDB-style setting object from PostgreSQL data
 */
function rebuildSettingObject(setting, subscribeAuthors, subscribeBookmarks, links) {
    // Rebuild format object
    const format = {}
    if (setting.format_message) format.message = setting.format_message
    if (setting.format_mediagroup_message) format.mediagroup_message = setting.format_mediagroup_message
    if (setting.format_inline) format.inline = setting.format_inline
    format.version = setting.format_version || 'v2'

    // Rebuild default object
    const defaultSettings = {}
    const defaultFields = [
        'tags', 'description', 'open', 'share', 'remove_keyboard', 'remove_caption',
        'single_caption', 'album', 'album_one', 'album_equal', 'reverse', 'overwrite',
        'asfile', 'append_file', 'append_file_immediate', 'caption_extraction',
        'caption_above', 'show_id', 'auto_spoiler', 'telegraph_title',
        'telegraph_author_name', 'telegraph_author_url'
    ]
    for (const field of defaultFields) {
        const dbField = `default_${field}`
        if (setting[dbField] !== null && setting[dbField] !== undefined) {
            defaultSettings[field] = setting[dbField]
        }
    }

    // Rebuild subscribe_author_list
    const subscribe_author_list = {}
    for (const s of subscribeAuthors) {
        subscribe_author_list[s.author_id] = new Date(s.subscribed_at).getTime()
    }

    // Rebuild subscribe_author_bookmarks_list
    const subscribe_author_bookmarks_list = {}
    for (const s of subscribeBookmarks) {
        subscribe_author_bookmarks_list[s.author_id] = new Date(s.subscribed_at).getTime()
    }

    // Rebuild link_chat_list
    const link_chat_list = {}
    for (const link of links) {
        link_chat_list[link.linked_chat_id] = {
            sync: link.sync,
            administrator_only: link.administrator_only,
            repeat: link.repeat,
            type: link.chat_type,
            mediagroup_count: link.mediagroup_count
        }
    }

    return {
        id: setting.id,
        format: Object.keys(format).length > 0 ? format : undefined,
        default: Object.keys(defaultSettings).length > 0 ? defaultSettings : undefined,
        subscribe_author_list,
        subscribe_author_bookmarks_list,
        link_chat_list
    }
}

// ============================================
// Other Collection Wrappers
// ============================================
function createNovelCollection() {
    return {
        findOne: async (query) => {
            if (!query || query.id === undefined) return null
            const result = await pool.query('SELECT * FROM novel WHERE id = $1', [query.id])
            return result.rows[0] || null
        },

        insertOne: async (doc) => {
            await pool.query(`
                INSERT INTO novel (id, title, description, series_type, user_name, user_id, restrict, x_restrict, tags, create_date, cover_url, content)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (id) DO NOTHING
            `, [doc.id, doc.title, doc.description, doc.seriesType, doc.userName, doc.userId, doc.restrict, doc.xRestrict, doc.tags, doc.createDate, doc.coverUrl, doc.content])
            return { acknowledged: true, insertedId: doc.id }
        },

        createIndex: async () => { return true }
    }
}

function createRankingCollection() {
    return {
        findOne: async (query) => {
            if (!query || query.id === undefined) return null
            const result = await pool.query('SELECT * FROM ranking WHERE id = $1', [query.id])
            if (!result.rows[0]) return null
            return {
                id: result.rows[0].id,
                mode: result.rows[0].mode,
                date: result.rows[0].date,
                contents: result.rows[0].contents
            }
        },

        insertOne: async (doc) => {
            await pool.query(`
                INSERT INTO ranking (id, mode, date, contents)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO NOTHING
            `, [doc.id, doc.mode, doc.date, JSON.stringify(doc.contents)])
            return { acknowledged: true, insertedId: doc.id }
        },

        createIndex: async () => { return true }
    }
}

function createAuthorCollection() {
    return {
        findOne: async (query) => {
            if (!query) return null
            const id = query.id || query.author_id
            if (!id) return null
            const result = await pool.query('SELECT * FROM author WHERE author_id = $1', [id])
            return result.rows[0] || null
        },

        updateOne: async (query, update, options = {}) => {
            const id = query.id || query.author_id
            const data = update.$set || {}

            await pool.query(`
                INSERT INTO author (author_id, author_name, author_avatar_url, comment, comment_html, status)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (author_id) DO UPDATE SET
                    author_name = COALESCE($2, author.author_name),
                    author_avatar_url = COALESCE($3, author.author_avatar_url),
                    comment = COALESCE($4, author.comment),
                    comment_html = COALESCE($5, author.comment_html),
                    status = COALESCE($6, author.status),
                    updated_at = NOW()
            `, [id, data.author_name, data.author_avatar_url, data.comment, data.comment_html, data.status])

            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
        },

        createIndex: async () => { return true }
    }
}

function createTelegraphCollection() {
    return {
        findOne: async (query) => {
            if (!query || query.telegraph_url === undefined) return null
            const result = await pool.query('SELECT * FROM telegraph WHERE telegraph_url = $1', [query.telegraph_url])
            if (!result.rows[0]) return null
            return {
                telegraph_url: result.rows[0].telegraph_url,
                ids: result.rows[0].illust_ids,
                user_id: result.rows[0].user_id
            }
        },

        insertOne: async (doc) => {
            await pool.query(`
                INSERT INTO telegraph (telegraph_url, illust_ids, user_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (telegraph_url) DO NOTHING
            `, [doc.telegraph_url, doc.ids, doc.user_id])
            return { acknowledged: true, insertedId: doc.telegraph_url }
        },

        createIndex: async () => { return true }
    }
}

// ============================================
// Cursor Classes for Query Chaining
// ============================================
class PostgresCursor {
    constructor(tableName, query, pool) {
        this.tableName = tableName
        this.query = query
        this.pool = pool
        this._sort = null
        this._skip = 0
        this._limit = null

        // Whitelist of allowed sort/query fields
        this.allowedFields = ['id', 'title', 'type', 'author_id', 'x_restrict',
                              'ai_type', 'page_count', 'deleted', 'created_at', 'updated_at']
    }

    sort(spec) {
        this._sort = spec
        return this
    }

    skip(n) {
        this._skip = n
        return this
    }

    limit(n) {
        this._limit = n
        return this
    }

    // Add method to enforce max limit
    _enforceLimit() {
        const MAX_LIMIT = 1000
        if (!this._limit || this._limit > MAX_LIMIT) {
            this._limit = MAX_LIMIT
        }
    }

    async toArray() {
        // Enforce maximum query limit for safety
        this._enforceLimit()

        // Build main query with JOINs and aggregation
        let sql = `
            SELECT
                i.id, i.title, i.type, i.comment, i.description, i.author_id,
                i.tags, i.sl, i.restrict, i.x_restrict, i.ai_type, i.deleted, i.deleted_at,
                a.author_name,
                -- Aggregate images into JSON array
                COALESCE(
                    json_agg(
                        json_build_object(
                            'page_index', img.page_index,
                            'thumb_url', img.thumb_url,
                            'regular_url', img.regular_url,
                            'original_url', img.original_url,
                            'width', img.width,
                            'height', img.height,
                            'tg_file_id', img.tg_file_id
                        ) ORDER BY img.page_index
                    ) FILTER (WHERE img.illust_id IS NOT NULL),
                    '[]'::json
                ) AS images,
                -- Ugoira metadata
                u.cover_img_url, u.width as ugoira_width, u.height as ugoira_height,
                u.tg_file_id as ugoira_tg_file_id
            FROM illust i
            LEFT JOIN author a ON i.author_id = a.author_id
            LEFT JOIN illust_image img ON i.id = img.illust_id
            LEFT JOIN ugoira_meta u ON i.id = u.illust_id
        `

        const params = []
        const conditions = []
        let paramIndex = 1

        // Handle query conditions
        if (this.query) {
            // Handle $or conditions (for searching by multiple IDs)
            if (this.query.$or) {
                const orConditions = []
                for (const cond of this.query.$or) {
                    if (cond.id !== undefined) {
                        orConditions.push(`i.id = $${paramIndex}`)
                        params.push(cond.id)
                        paramIndex++
                    }
                }
                if (orConditions.length > 0) {
                    conditions.push(`(${orConditions.join(' OR ')})`)
                }
            }

            // Handle tag search
            if (this.query.tags) {
                if (this.query.tags.$regex) {
                    // Convert regex to LIKE pattern
                    let pattern = this.query.tags.$regex
                    // Handle common regex patterns
                    if (pattern.startsWith('^')) {
                        pattern = pattern.slice(1) + '%'
                    } else {
                        pattern = '%' + pattern + '%'
                    }
                    conditions.push(`EXISTS (SELECT 1 FROM unnest(i.tags) AS tag WHERE tag ILIKE $${paramIndex})`)
                    params.push(pattern)
                    paramIndex++
                } else if (typeof this.query.tags === 'string') {
                    conditions.push(`$${paramIndex} = ANY(i.tags)`)
                    params.push(this.query.tags)
                    paramIndex++
                }
            }

            // Handle other simple equality conditions
            for (const key in this.query) {
                if (key === '$or' || key === 'tags') continue
                if (typeof this.query[key] !== 'object') {
                    // SECURITY: Validate field name against whitelist
                    if (!this.allowedFields.includes(key)) {
                        throw new Error(`Invalid query field: ${key}`)
                    }
                    conditions.push(`i.${key} = $${paramIndex}`)
                    params.push(this.query[key])
                    paramIndex++
                }
            }
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ')
        }

        // GROUP BY all non-aggregated columns
        sql += ` GROUP BY i.id, a.author_name, u.cover_img_url, u.width, u.height, u.tg_file_id`

        // Handle sort
        if (this._sort) {
            const sortClauses = []
            for (const key in this._sort) {
                // SECURITY: Validate field name against whitelist
                if (!this.allowedFields.includes(key)) {
                    throw new Error(`Invalid sort field: ${key}`)
                }
                const direction = this._sort[key] === -1 ? 'DESC' : 'ASC'
                sortClauses.push(`i.${key} ${direction}`)
            }
            if (sortClauses.length > 0) {
                sql += ' ORDER BY ' + sortClauses.join(', ')
            }
        }

        // Handle pagination
        if (this._limit) {
            sql += ` LIMIT $${paramIndex}`
            params.push(this._limit)
            paramIndex++
        }

        if (this._skip > 0) {
            sql += ` OFFSET $${paramIndex}`
            params.push(this._skip)
        }

        // SINGLE QUERY - no N+1 problem!
        const result = await this.pool.query(sql, params)

        // Rebuild illust objects from aggregated data
        return result.rows.map(row => {
            const illust = {
                id: row.id,
                title: row.title,
                type: row.type,
                comment: row.comment,
                description: row.description,
                author_id: row.author_id,
                author_name: row.author_name,
                tags: row.tags || [],
                sl: row.sl,
                restrict: row.restrict,
                x_restrict: row.x_restrict,
                ai_type: row.ai_type,
                deleted: row.deleted,
                deleted_at: row.deleted_at
            }

            if (row.type === 2 && row.cover_img_url) {
                // Ugoira
                illust.imgs_ = {
                    cover_img_url: row.cover_img_url,
                    size: [{ width: row.ugoira_width, height: row.ugoira_height }]
                }
                illust.tg_file_id = row.ugoira_tg_file_id
            } else if (row.images && row.images.length > 0) {
                // Regular illust - use aggregated images
                const images = row.images
                illust.imgs_ = {
                    thumb_urls: images.map(img => img.thumb_url),
                    regular_urls: images.map(img => img.regular_url),
                    original_urls: images.map(img => img.original_url),
                    size: images.map(img => ({ width: img.width, height: img.height }))
                }
                if (images[0]?.tg_file_id) {
                    illust.tg_file_id = images[0].tg_file_id
                }
            }

            return illust
        })
    }
}

class ChatSettingCursor {
    constructor(query, pool) {
        this.query = query
        this.pool = pool
    }

    async toArray() {
        // This is mainly used for subscription queries
        let sql = 'SELECT * FROM chat_setting'
        const params = []
        const conditions = []
        let paramIndex = 1

        // Handle subscription list queries
        for (const key in this.query) {
            if (key.startsWith('subscribe_author_list.')) {
                const authorId = key.split('.')[1]

                // If query also has id, use it to filter
                if (this.query.id) {
                    const subResult = await this.pool.query(
                        'SELECT 1 FROM chat_subscribe_author WHERE chat_id = $1 AND author_id = $2',
                        [this.query.id, authorId]
                    )
                    if (subResult.rows.length === 0) return []

                    conditions.push(`id = $${paramIndex}`)
                    params.push(this.query.id)
                    paramIndex++
                } else {
                    const subResult = await this.pool.query(
                        'SELECT chat_id FROM chat_subscribe_author WHERE author_id = $1',
                        [authorId]
                    )
                    const chatIds = subResult.rows.map(r => r.chat_id)
                    if (chatIds.length === 0) return []

                    conditions.push(`id = ANY($${paramIndex})`)
                    params.push(chatIds)
                    paramIndex++
                }
            } else if (key === 'id') {
                // Handle id field if not already processed
                if (!conditions.some(c => c.includes('id ='))) {
                    conditions.push(`id = $${paramIndex}`)
                    params.push(this.query.id)
                    paramIndex++
                }
            }
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ')
        }

        const result = await this.pool.query(sql, params)

        // Rebuild each setting
        const settings = []
        for (const row of result.rows) {
            const subscribeAuthorsResult = await this.pool.query(
                'SELECT author_id, subscribed_at FROM chat_subscribe_author WHERE chat_id = $1',
                [row.id]
            )
            const subscribeBookmarksResult = await this.pool.query(
                'SELECT author_id, subscribed_at FROM chat_subscribe_bookmarks WHERE chat_id = $1',
                [row.id]
            )
            const linksResult = await this.pool.query(
                'SELECT * FROM chat_link WHERE source_chat_id = $1',
                [row.id]
            )

            settings.push(rebuildSettingObject(row, subscribeAuthorsResult.rows, subscribeBookmarksResult.rows, linksResult.rows))
        }

        return settings
    }
}

// ============================================
// update_setting and delete_setting
// ============================================
export async function update_setting(value, chat_id, flag) {
    try {
        let s = {}
        let u = {}

        if (value.format) {
            s.format = {}
            for (const i in value.format) {
                if (['message', 'mediagroup_message', 'inline', 'version'].includes(i)) {
                    if (typeof value.format[i] == 'string') {
                        if (i === 'version') {
                            if (value.format[i] === 'v1') {
                                s.format[i] = 'v1'
                            }
                        } else {
                            s.format[i] = value.format[i]
                        }
                    }
                }
            }
            if (!s.format.version) {
                s.format.version = 'v2'
            }
            delete value.format
        }

        if (value.default) {
            s.default = {}
            for (const i in value.default) {
                if (['telegraph_title', 'telegraph_author_name', 'telegraph_author_url'].includes(i)) {
                    if (typeof value.default[i] === 'string') {
                        s.default[i] = value.default[i]
                    }
                }
                if (['tags', 'description', 'open', 'share', 'remove_keyboard', 'remove_caption', 'single_caption',
                    'album', 'album_one', 'album_equal', 'reverse', 'overwrite', 'asfile', 'append_file', 'append_file_immediate',
                    'caption_extraction', 'caption_above', 'show_id', 'auto_spoiler'].includes(i)) {
                    if (typeof value.default[i] === 'boolean') {
                        s.default[i] = value.default[i]
                    }
                }
            }
            delete value.default
        }

        for (let i in value) {
            if (!Object.prototype.hasOwnProperty.call(value, i)) {
                continue
            }
            if (['__proto__', 'constructor', 'prototype'].includes(i)) {
                console.warn(`Blocked dangerous property in update_setting: ${i}`)
                continue
            }

            let action = i.substring(0, 3)
            let ii = i.substring(4)
            let v = null
            let index = null

            if (['subscribe_author', 'subscribe_author_bookmarks'].includes(ii)) {
                v = +new Date()
                index = value[i]
            }

            if (['link_chat'].includes(ii)) {
                if (typeof value[i] === 'string') {
                    index = value[i]
                } else {
                    index = value[i].chat_id
                }
                v = {
                    sync: parseInt(value[i].sync),
                    administrator_only: parseInt(value[i].administrator_only),
                    repeat: parseInt(value[i].repeat),
                    type: value[i].type,
                    mediagroup_count: 1
                }
            }

            if (action === 'add') {
                s[`${ii}_list.${index}`] = v
            } else if (action === 'del') {
                u[`${ii}_list.${index}`] = { $exists: true }
            }
        }

        let update_data = {}
        if (JSON.stringify(s).length > 2) {
            update_data.$set = s
        }
        if (JSON.stringify(u).length > 2) {
            update_data.$unset = u
        }

        await collection.chat_setting.updateOne({
            id: chat_id,
        }, update_data, {
            upsert: true
        })

        return true
    } catch (error) {
        console.warn(error)
        return false
    }
}

export async function delete_setting(chat_id) {
    try {
        await collection.chat_setting.updateOne({
            id: chat_id
        }, {
            $unset: {
                default: { $exists: true },
                format: { $exists: true }
            }
        })
        return true
    } catch (error) {
        console.warn(error)
        return false
    }
}

/**
 * Dummy collection for DBLESS mode
 */
function dummy_collection() {
    const dummyCursor = {
        sort: () => dummyCursor,
        skip: () => dummyCursor,
        limit: () => dummyCursor,
        toArray: async () => []
    }

    return {
        find: () => dummyCursor,
        findOne: async () => null,
        insertOne: async () => ({ acknowledged: true, insertedId: null }),
        updateOne: async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }),
        updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0 }),
        deleteOne: async () => ({ acknowledged: true, deletedCount: 1 }),
        replaceOne: async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }),
        createIndex: async () => true
    }
}

export default {
    db_initial,
    db,
    collection,
    update_setting,
    delete_setting
}
