#!/usr/bin/env node

/**
 * MongoDB to PostgreSQL Migration Script
 *
 * Usage:
 *   node mongodb2pg.js [--force] [--skip-authors] [--skip-illusts]
 *   QUEUES=5 node mongodb2pg.js [--force]
 *
 * Options:
 *   --force         Truncate all PostgreSQL tables before migration
 *   --skip-authors  Skip author migration (useful when continuing after failure)
 *   --skip-illusts  Skip illusts/images/ugoira migration (useful when re-running after failure)
 *
 * Environment Variables:
 *   QUEUES          Number of parallel write queues (default: 3, recommended: 5-8)
 *
 * This script migrates all data from MongoDB to PostgreSQL using optimized
 * batch INSERT with parallel queues, pipelined read/write, and automatic constraint management.
 *
 * Performance optimizations:
 *   - UNLOGGED tables during migration (no WAL writes, 2-3x speed boost)
 *   - Synchronous commit disabled (reduces fsync overhead)
 *   - Automatic foreign key dropping before migration (prevents FK lookups on each insert)
 *   - Automatic index dropping before migration (prevents slow incremental index updates)
 *   - Automatic index and FK rebuilding after migration (batch rebuild is 10-100x faster)
 *   - Parallel write queues (3 by default) for concurrent PostgreSQL writes
 *   - Pipelined read/write (reads next batch while writing current batch)
 *   - Large batch size (500 rows per batch)
 *   - Transaction-based commits (reduces commit overhead)
 *   - Expected time for 2.3M illusts: ~1-2 minutes with 5 queues + ~1 min rebuild
 *   - Tables are automatically set back to LOGGED after migration for data safety
 *
 * This script should be run while the bot is stopped.
 * By default, the script checks if tables are empty and refuses to run if data exists.
 * Use --force to truncate tables before migration.
 *
 * Note: If migration fails, indexes/foreign keys may need to be rebuilt manually:
 *   psql -d your_database -f rebuild_indexes.sql
 */

import { MongoClient } from 'mongodb'
import pg from 'pg'
import config from './config.js'

const { Pool } = pg

// Parse command line arguments
const args = process.argv.slice(2)
const FORCE_MODE = args.includes('--force')
const SKIP_AUTHORS = args.includes('--skip-authors')
const SKIP_ILLUSTS = args.includes('--skip-illusts')

// Number of parallel write queues for illusts
// Recommended: 2-5 depending on PostgreSQL max_connections
const PARALLEL_QUEUES = Math.min(Math.max(parseInt(process.env.QUEUES || 3), 1), 10)

// MongoDB connection
const mongoUri = config.mongodb.uri
const mongoDbName = config.mongodb.dbname

// PostgreSQL connection
const pgUri = config.postgres.uri

let mongoClient
let mongoDb
let pgPool

const stats = {
    authors: 0,
    illusts: 0,
    illust_images: 0,
    ugoira_meta: 0,
    chat_settings: 0,
    chat_subscribe_authors: 0,
    chat_subscribe_bookmarks: 0,
    chat_links: 0,
    novels: 0,
    rankings: 0,
    telegraphs: 0
}

/**
 * Clean null bytes (0x00) from strings (PostgreSQL doesn't allow them)
 * Also handle null/undefined properly
 */
function cleanString(str) {
    if (str === null || str === undefined) return null
    if (typeof str !== 'string') return str
    return str.replace(/\x00/g, '')
}

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`
    }
    return `${seconds}s`
}

async function connectDatabases() {
    console.log('Connecting to MongoDB...')
    mongoClient = await MongoClient.connect(mongoUri)
    mongoDb = mongoClient.db(mongoDbName)
    console.log('✓ MongoDB connected')

    console.log('Connecting to PostgreSQL...')
    pgPool = new Pool({
        connectionString: pgUri,
        max: PARALLEL_QUEUES + 5,  // Allow parallel queues + buffer for other operations
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    })
    await pgPool.query('SELECT 1')

    // Disable synchronous commits for faster writes (safe for migration)
    await pgPool.query('SET synchronous_commit = OFF')

    console.log(`✓ PostgreSQL connected (max ${PARALLEL_QUEUES + 5} connections)`)
    console.log('✓ Performance mode enabled (synchronous_commit = OFF)')
}

async function checkTablesEmpty() {
    console.log('\nChecking if PostgreSQL tables are empty...')

    let tables = [
        'author', 'illust', 'illust_image', 'ugoira_meta',
        'chat_setting', 'chat_subscribe_author', 'chat_subscribe_bookmarks',
        'chat_link', 'novel', 'ranking', 'telegraph'
    ]

    // Skip author check if --skip-authors is specified
    if (SKIP_AUTHORS) {
        tables = tables.filter(t => t !== 'author')
        console.log('  (Skipping author table check)')
    }

    // Skip illust tables check if --skip-illusts is specified
    if (SKIP_ILLUSTS) {
        tables = tables.filter(t => !['illust', 'illust_image', 'ugoira_meta'].includes(t))
        console.log('  (Skipping illust tables check)')
    }

    for (const table of tables) {
        const result = await pgPool.query(`SELECT COUNT(*) FROM ${table}`)
        const count = parseInt(result.rows[0].count)

        if (count > 0) {
            console.error(`\n❌ Table "${table}" contains ${count} rows!`)
            console.error('Database is not empty. Migration aborted.')
            console.error('\nTo force migration and truncate all tables, use:')
            console.error('  node mongodb2pg.js --force')
            if (!SKIP_AUTHORS) {
                console.error('To skip author migration, add:')
                console.error('  node mongodb2pg.js --force --skip-authors')
            }
            if (!SKIP_ILLUSTS) {
                console.error('To skip illust migration, add:')
                console.error('  node mongodb2pg.js --force --skip-illusts')
            }
            process.exit(1)
        }
    }

    console.log('✓ All checked tables are empty')
}

async function truncateTables() {
    console.log('\n⚠️  FORCE MODE: Truncating PostgreSQL tables...')

    let tables = [
        'telegraph', 'ranking', 'novel', 'chat_link',
        'chat_subscribe_bookmarks', 'chat_subscribe_author',
        'chat_setting', 'ugoira_meta', 'illust_image', 'illust', 'author'
    ]

    // Skip author truncation if --skip-authors is specified
    if (SKIP_AUTHORS) {
        tables = tables.filter(t => t !== 'author')
        console.log('  (Preserving author table)')
    }

    // Skip illust truncation if --skip-illusts is specified
    if (SKIP_ILLUSTS) {
        tables = tables.filter(t => !['illust', 'illust_image', 'ugoira_meta'].includes(t))
        console.log('  (Preserving illust tables)')
    }

    for (const table of tables) {
        await pgPool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        console.log(`  Truncated ${table}`)
    }

    console.log(`✓ Truncated ${tables.length} table${tables.length > 1 ? 's' : ''}`)
}

async function dropIndexes() {
    console.log('\n⚠️  Dropping indexes for faster migration...')

    const indexes = [
        'idx_author_name',
        'idx_author_status',
        'idx_illust_author',
        'idx_illust_tags',
        'idx_illust_deleted',
        'idx_illust_image_illust',
        'idx_subscribe_author_chat',
        'idx_subscribe_author_author',
        'idx_subscribe_bookmarks_chat',
        'idx_chat_link_source',
        'idx_ranking_mode_date',
        'idx_telegraph_user'
    ]

    for (const index of indexes) {
        try {
            await pgPool.query(`DROP INDEX IF EXISTS ${index}`)
            console.log(`  Dropped ${index}`)
        } catch (error) {
            console.log(`  ⚠️  Failed to drop ${index}: ${error.message}`)
        }
    }

    console.log('✓ Indexes dropped (will be rebuilt after migration)')
}

async function dropForeignKeys() {
    console.log('\n⚠️  Dropping foreign key constraints for faster migration...')

    const foreignKeys = [
        { table: 'illust', constraint: 'illust_author_id_fkey' },
        { table: 'illust_image', constraint: 'illust_image_illust_id_fkey' },
        { table: 'ugoira_meta', constraint: 'ugoira_meta_illust_id_fkey' }
    ]

    for (const fk of foreignKeys) {
        try {
            await pgPool.query(`ALTER TABLE ${fk.table} DROP CONSTRAINT IF EXISTS ${fk.constraint}`)
            console.log(`  Dropped ${fk.constraint}`)
        } catch (error) {
            console.log(`  ⚠️  Failed to drop ${fk.constraint}: ${error.message}`)
        }
    }

    console.log('✓ Foreign keys dropped (will be rebuilt after migration)')
}

async function rebuildForeignKeys() {
    console.log('\n🔗 Rebuilding foreign key constraints...')
    const startTime = Date.now()

    const foreignKeyDefinitions = [
        {
            table: 'illust',
            constraint: 'illust_author_id_fkey',
            sql: 'ALTER TABLE illust ADD CONSTRAINT illust_author_id_fkey FOREIGN KEY (author_id) REFERENCES author(author_id)'
        },
        {
            table: 'illust_image',
            constraint: 'illust_image_illust_id_fkey',
            sql: 'ALTER TABLE illust_image ADD CONSTRAINT illust_image_illust_id_fkey FOREIGN KEY (illust_id) REFERENCES illust(id) ON DELETE CASCADE'
        },
        {
            table: 'ugoira_meta',
            constraint: 'ugoira_meta_illust_id_fkey',
            sql: 'ALTER TABLE ugoira_meta ADD CONSTRAINT ugoira_meta_illust_id_fkey FOREIGN KEY (illust_id) REFERENCES illust(id) ON DELETE CASCADE'
        }
    ]

    for (const fk of foreignKeyDefinitions) {
        try {
            console.log(`  Creating ${fk.constraint}...`)
            await pgPool.query(fk.sql)
        } catch (error) {
            console.log(`  ⚠️  Failed to create ${fk.constraint}: ${error.message}`)
        }
    }

    const duration = Date.now() - startTime
    console.log(`✓ Foreign keys rebuilt in ${formatDuration(duration)}`)
}

async function rebuildIndexes() {
    console.log('\n🔨 Rebuilding indexes (parallel)...')
    const startTime = Date.now()

    const indexDefinitions = [
        'CREATE INDEX idx_author_name ON author(author_name)',
        'CREATE INDEX idx_author_status ON author(status)',
        'CREATE INDEX idx_illust_author ON illust(author_id)',
        'CREATE INDEX idx_illust_tags ON illust USING GIN(tags)',
        'CREATE INDEX idx_illust_deleted ON illust(deleted) WHERE deleted = TRUE',
        'CREATE INDEX idx_illust_image_illust ON illust_image(illust_id)',
        'CREATE INDEX idx_subscribe_author_chat ON chat_subscribe_author(chat_id)',
        'CREATE INDEX idx_subscribe_author_author ON chat_subscribe_author(author_id)',
        'CREATE INDEX idx_subscribe_bookmarks_chat ON chat_subscribe_bookmarks(chat_id)',
        'CREATE INDEX idx_chat_link_source ON chat_link(source_chat_id)',
        'CREATE INDEX idx_ranking_mode_date ON ranking(mode, date)',
        'CREATE INDEX idx_telegraph_user ON telegraph(user_id)'
    ]

    // Create all indexes in parallel for much faster rebuild
    const results = await Promise.allSettled(
        indexDefinitions.map(async (indexDef) => {
            const indexName = indexDef.match(/INDEX (\w+)/)[1]
            console.log(`  Creating ${indexName}...`)
            try {
                await pgPool.query(indexDef)
                return { indexName, success: true }
            } catch (error) {
                console.log(`  ⚠️  Failed to create ${indexName}: ${error.message}`)
                return { indexName, success: false, error: error.message }
            }
        })
    )

    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failed = results.length - succeeded

    const duration = Date.now() - startTime
    console.log(`✓ Indexes rebuilt in ${formatDuration(duration)} (${succeeded} succeeded, ${failed} failed)`)
}

async function setTablesUnlogged() {
    console.log('\n🚀 Setting illust tables to UNLOGGED for maximum speed...')

    // Only set illust-related tables to UNLOGGED (large data volume)
    const tables = [
        'illust',
        'illust_image',
        'ugoira_meta'
    ]

    for (const table of tables) {
        try {
            await pgPool.query(`ALTER TABLE ${table} SET UNLOGGED`)
            console.log(`  Set ${table} to UNLOGGED`)
        } catch (error) {
            console.log(`  ⚠️  Failed to set ${table} to UNLOGGED: ${error.message}`)
        }
    }

    console.log('✓ Illust tables set to UNLOGGED (no WAL writes, 2-3x faster)')
    console.log('  ⚠️  Data will NOT survive PostgreSQL crash until migration completes')
}

async function setTablesLogged() {
    console.log('\n🛡️  Setting tables back to LOGGED for safety...')
    const startTime = Date.now()

    // Set all tables that might be UNLOGGED back to LOGGED
    // Include author table to ensure foreign keys can be created
    const tables = [
        'author',
        'illust',
        'illust_image',
        'ugoira_meta'
    ]

    for (const table of tables) {
        try {
            console.log(`  Setting ${table} to LOGGED...`)
            await pgPool.query(`ALTER TABLE ${table} SET LOGGED`)
        } catch (error) {
            console.log(`  ⚠️  Failed to set ${table} to LOGGED: ${error.message}`)
        }
    }

    const duration = Date.now() - startTime
    console.log(`✓ Tables set back to LOGGED in ${formatDuration(duration)}`)
    console.log('  ✓ Data is now safe and will survive crashes')
}

async function migrateAuthors() {
    console.log('\n=== Migrating Authors ===')
    const startTime = Date.now()

    const illusts = mongoDb.collection('illust')
    const cursor = illusts.find({})

    const authorMap = new Map()

    for await (const doc of cursor) {
        if (doc.author_id && doc.author_name) {
            authorMap.set(doc.author_id, doc.author_name)
        }
    }

    console.log(`Found ${authorMap.size} unique authors`)

    // Batch insert authors
    const authors = Array.from(authorMap.entries())
    const BATCH_SIZE = 100

    for (let i = 0; i < authors.length; i += BATCH_SIZE) {
        const batch = authors.slice(i, i + BATCH_SIZE)
        const values = []
        const placeholders = []

        batch.forEach(([authorId, authorName], idx) => {
            const offset = idx * 2
            placeholders.push(`($${offset + 1}, $${offset + 2})`)
            values.push(authorId, cleanString(authorName))
        })

        await pgPool.query(`
            INSERT INTO author (author_id, author_name)
            VALUES ${placeholders.join(', ')}
        `, values)

        stats.authors += batch.length
        console.log(`  Inserted ${stats.authors}/${authors.length} authors...`)
    }

    const duration = Date.now() - startTime
    console.log(`✓ Migrated ${stats.authors} authors in ${formatDuration(duration)}`)
}

/**
 * Process a chunk of illusts with a dedicated PostgreSQL connection
 */
async function processIllustChunk(docs) {
    const BATCH_SIZE = 200  // Reduced to avoid "too many parameters" error (was 500)
    const localStats = { illusts: 0, illust_images: 0, ugoira_meta: 0 }

    let illustBatch = []
    let imageBatch = []
    let ugoiraBatch = []

    const client = await pgPool.connect()
    try {
        await client.query('BEGIN')

        for (const doc of docs) {
            // Collect illust row
            illustBatch.push({
                id: doc.id,
                title: cleanString(doc.title) || '',
                type: doc.type || 0,
                comment: cleanString(doc.comment) || null,
                description: cleanString(doc.description) || null,
                author_id: doc.author_id,
                tags: doc.tags || [],
                sl: doc.sl || 0,
                restrict: doc.restrict || 0,
                x_restrict: doc.x_restrict || 0,
                ai_type: doc.ai_type || 0,
                page_count: doc.imgs_?.size?.length || 1,
                deleted: doc.deleted || false,
                deleted_at: doc.deleted_at || null
            })

            // Collect image or ugoira rows
            if (doc.type === 2 && doc.imgs_?.cover_img_url) {
                ugoiraBatch.push({
                    illust_id: doc.id,
                    cover_img_url: cleanString(doc.imgs_.cover_img_url),
                    width: doc.imgs_.size?.[0]?.width || null,
                    height: doc.imgs_.size?.[0]?.height || null,
                    tg_file_id: cleanString(doc.tg_file_id) || null
                })
            } else if (doc.imgs_?.thumb_urls) {
                for (let j = 0; j < doc.imgs_.thumb_urls.length; j++) {
                    imageBatch.push({
                        illust_id: doc.id,
                        page_index: j,
                        thumb_url: cleanString(doc.imgs_.thumb_urls[j]) || null,
                        regular_url: cleanString(doc.imgs_.regular_urls?.[j]) || null,
                        original_url: cleanString(doc.imgs_.original_urls?.[j]) || null,
                        width: doc.imgs_.size?.[j]?.width || null,
                        height: doc.imgs_.size?.[j]?.height || null,
                        tg_file_id: j === 0 ? (cleanString(doc.tg_file_id) || null) : null
                    })
                }
            }

            // Flush batches if ANY batch size reached (manga can have many images)
            if (illustBatch.length >= BATCH_SIZE ||
                imageBatch.length >= BATCH_SIZE ||
                ugoiraBatch.length >= BATCH_SIZE) {
                const batchStats = await flushIllustBatches(client, illustBatch, imageBatch, ugoiraBatch)
                localStats.illusts += batchStats.illusts
                localStats.illust_images += batchStats.illust_images
                localStats.ugoira_meta += batchStats.ugoira_meta
                illustBatch = []
                imageBatch = []
                ugoiraBatch = []
            }
        }

        // Flush remaining
        if (illustBatch.length > 0) {
            const batchStats = await flushIllustBatches(client, illustBatch, imageBatch, ugoiraBatch)
            localStats.illusts += batchStats.illusts
            localStats.illust_images += batchStats.illust_images
            localStats.ugoira_meta += batchStats.ugoira_meta
        }

        await client.query('COMMIT')

    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
    }

    return localStats
}

/**
 * Migrate illusts using parallel queues with pipelined read/write
 */
async function migrateIllusts() {
    console.log(`\n=== Migrating Illusts (${PARALLEL_QUEUES} parallel queues with pipelined read/write) ===`)
    const startTime = Date.now()

    const illusts = mongoDb.collection('illust')
    const PAGE_SIZE = 50000  // Smaller to avoid OOM (200k = 2GB heap, 50k = 500MB)
    let lastId = null
    let totalProcessed = 0

    // Helper function to read one batch from MongoDB
    async function readBatch(fromId) {
        const readStartTime = Date.now()
        const query = fromId ? { _id: { $gt: fromId } } : {}
        const docs = await illusts
            .find(query)
            .sort({ _id: 1 })
            .limit(PAGE_SIZE)
            .toArray()

        if (docs.length === 0) return null

        const readDuration = Date.now() - readStartTime
        const docsCount = docs.length
        const lastIdValue = docs[docs.length - 1]._id

        // Deduplicate
        const dedupStartTime = Date.now()
        const deduped = new Map()
        for (const doc of docs) {
            deduped.set(doc.id, doc)
        }
        const uniqueDocs = Array.from(deduped.values())
        const dedupDuration = Date.now() - dedupStartTime

        // Release memory ASAP (avoid keeping both docs + uniqueDocs in memory)
        docs.length = 0
        deduped.clear()

        return {
            uniqueDocs,
            docsCount,           // Store count, not array
            lastId: lastIdValue,
            readDuration,
            dedupDuration
        }
    }

    // Read first batch
    let currentBatch = await readBatch(lastId)
    if (!currentBatch) {
        console.log('  No data to migrate')
        return
    }

    while (currentBatch) {
        const { uniqueDocs, docsCount, readDuration, dedupDuration } = currentBatch
        console.log(`  Processing ${uniqueDocs.length} unique docs (MongoDB read: ${formatDuration(readDuration)}, dedup: ${dedupDuration}ms)...`)

        // Split into chunks for parallel processing
        const chunkSize = Math.ceil(uniqueDocs.length / PARALLEL_QUEUES)
        const chunks = []
        for (let i = 0; i < PARALLEL_QUEUES; i++) {
            const start = i * chunkSize
            const end = Math.min(start + chunkSize, uniqueDocs.length)
            if (start < uniqueDocs.length) {
                chunks.push(uniqueDocs.slice(start, end))
            }
        }

        // Pipeline: Start reading next batch while writing current batch
        const writeStartTime = Date.now()
        const [writeResults, nextBatch] = await Promise.all([
            Promise.all(chunks.map((chunk) => processIllustChunk(chunk))),
            readBatch(currentBatch.lastId)
        ])
        const writeDuration = Date.now() - writeStartTime

        // Aggregate stats
        for (const result of writeResults) {
            stats.illusts += result.illusts
            stats.illust_images += result.illust_images
            stats.ugoira_meta += result.ugoira_meta
        }

        lastId = currentBatch.lastId
        totalProcessed += docsCount
        const elapsed = Date.now() - startTime
        const rate = Math.round(stats.illusts / (elapsed / 1000))
        console.log(`  Progress: ${totalProcessed} docs (${stats.illusts} illusts, ${stats.illust_images} images, ${stats.ugoira_meta} ugoiras) - ${rate} illusts/sec`)
        console.log(`    PG write: ${formatDuration(writeDuration)} (pipelined with next MongoDB read)`)

        // Release memory before next iteration
        currentBatch.uniqueDocs = null
        currentBatch = nextBatch
    }

    const duration = Date.now() - startTime
    const avgRate = Math.round(stats.illusts / (duration / 1000))
    console.log(`✓ Migrated ${stats.illusts} illusts, ${stats.illust_images} images, ${stats.ugoira_meta} ugoiras in ${formatDuration(duration)} (avg ${avgRate} illusts/sec)`)
}

/**
 * Flush illust batches to database and return stats
 */
async function flushIllustBatches(client, illustBatch, imageBatch, ugoiraBatch) {
    const batchStats = { illusts: 0, illust_images: 0, ugoira_meta: 0 }

    // Insert illusts
    if (illustBatch.length > 0) {
        const values = []
        const placeholders = []
        illustBatch.forEach((doc, idx) => {
            const offset = idx * 14
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`)
            values.push(
                doc.id, doc.title, doc.type, doc.comment, doc.description, doc.author_id,
                doc.tags, doc.sl, doc.restrict, doc.x_restrict, doc.ai_type, doc.page_count,
                doc.deleted, doc.deleted_at
            )
        })

        await client.query(`
            INSERT INTO illust (
                id, title, type, comment, description, author_id,
                tags, sl, restrict, x_restrict, ai_type, page_count,
                deleted, deleted_at
            ) VALUES ${placeholders.join(', ')}
            ON CONFLICT (id) DO NOTHING
        `, values)
        batchStats.illusts = illustBatch.length
    }

    // Insert images
    if (imageBatch.length > 0) {
        const values = []
        const placeholders = []
        imageBatch.forEach((img, idx) => {
            const offset = idx * 8
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`)
            values.push(
                img.illust_id, img.page_index, img.thumb_url, img.regular_url,
                img.original_url, img.width, img.height, img.tg_file_id
            )
        })

        await client.query(`
            INSERT INTO illust_image (
                illust_id, page_index, thumb_url, regular_url, original_url,
                width, height, tg_file_id
            ) VALUES ${placeholders.join(', ')}
            ON CONFLICT (illust_id, page_index) DO NOTHING
        `, values)
        batchStats.illust_images = imageBatch.length
    }

    // Insert ugoiras
    if (ugoiraBatch.length > 0) {
        const values = []
        const placeholders = []
        ugoiraBatch.forEach((ugoira, idx) => {
            const offset = idx * 5
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`)
            values.push(
                ugoira.illust_id, ugoira.cover_img_url, ugoira.width,
                ugoira.height, ugoira.tg_file_id
            )
        })

        await client.query(`
            INSERT INTO ugoira_meta (illust_id, cover_img_url, width, height, tg_file_id)
            VALUES ${placeholders.join(', ')}
            ON CONFLICT (illust_id) DO NOTHING
        `, values)
        batchStats.ugoira_meta = ugoiraBatch.length
    }

    return batchStats
}

async function migrateChatSettings() {
    console.log('\n=== Migrating Chat Settings ===')
    const startTime = Date.now()

    const chatSettings = mongoDb.collection('chat_setting')
    const cursor = chatSettings.find({})

    const BATCH_SIZE = 100
    let settingsBatch = []
    let subscribeBatch = []
    let bookmarksBatch = []
    let linksBatch = []
    let count = 0

    const flushBatches = async () => {
        // Flush main settings
        if (settingsBatch.length > 0) {
            for (const { columns, values } of settingsBatch) {
                const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ')
                await pgPool.query(`
                    INSERT INTO chat_setting (${columns.join(', ')})
                    VALUES (${placeholders})
                `, values)
            }
            stats.chat_settings += settingsBatch.length
            settingsBatch = []
        }

        // Flush subscribe_author
        if (subscribeBatch.length > 0) {
            const values = []
            const placeholders = []
            subscribeBatch.forEach((item, idx) => {
                const offset = idx * 3
                placeholders.push(`($${offset + 1}, $${offset + 2}, to_timestamp($${offset + 3} / 1000.0))`)
                values.push(...item)
            })
            await pgPool.query(`
                INSERT INTO chat_subscribe_author (chat_id, author_id, subscribed_at)
                VALUES ${placeholders.join(', ')}
            `, values)
            stats.chat_subscribe_authors += subscribeBatch.length
            subscribeBatch = []
        }

        // Flush subscribe_bookmarks
        if (bookmarksBatch.length > 0) {
            const values = []
            const placeholders = []
            bookmarksBatch.forEach((item, idx) => {
                const offset = idx * 3
                placeholders.push(`($${offset + 1}, $${offset + 2}, to_timestamp($${offset + 3} / 1000.0))`)
                values.push(...item)
            })
            await pgPool.query(`
                INSERT INTO chat_subscribe_bookmarks (chat_id, author_id, subscribed_at)
                VALUES ${placeholders.join(', ')}
            `, values)
            stats.chat_subscribe_bookmarks += bookmarksBatch.length
            bookmarksBatch = []
        }

        // Flush chat_links
        if (linksBatch.length > 0) {
            const values = []
            const placeholders = []
            linksBatch.forEach((item, idx) => {
                const offset = idx * 7
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`)
                values.push(...item)
            })
            await pgPool.query(`
                INSERT INTO chat_link (
                    source_chat_id, linked_chat_id, sync, administrator_only,
                    repeat, chat_type, mediagroup_count
                ) VALUES ${placeholders.join(', ')}
            `, values)
            stats.chat_links += linksBatch.length
            linksBatch = []
        }
    }

    for await (const doc of cursor) {
        // Prepare main setting record
        const columns = ['id']
        const values = [doc.id]

        if (doc.format?.message) {
            columns.push('format_message')
            values.push(cleanString(doc.format.message))
        }
        if (doc.format?.mediagroup_message) {
            columns.push('format_mediagroup_message')
            values.push(cleanString(doc.format.mediagroup_message))
        }
        if (doc.format?.inline) {
            columns.push('format_inline')
            values.push(cleanString(doc.format.inline))
        }
        if (doc.format?.version) {
            columns.push('format_version')
            values.push(cleanString(doc.format.version))
        }

        const defaultFields = [
            'tags', 'description', 'open', 'share', 'remove_keyboard', 'remove_caption',
            'single_caption', 'album', 'album_one', 'album_equal', 'reverse', 'overwrite',
            'asfile', 'append_file', 'append_file_immediate', 'caption_extraction',
            'caption_above', 'show_id', 'auto_spoiler', 'telegraph_title',
            'telegraph_author_name', 'telegraph_author_url'
        ]

        for (const field of defaultFields) {
            if (doc.default?.[field] !== undefined && doc.default?.[field] !== null) {
                columns.push(`default_${field}`)
                const value = doc.default[field]
                // Clean strings, keep other types as-is
                values.push(typeof value === 'string' ? cleanString(value) : value)
            }
        }

        settingsBatch.push({ columns, values })

        // Prepare subscribe_author_list
        if (doc.subscribe_author_list) {
            for (const [authorId, timestamp] of Object.entries(doc.subscribe_author_list)) {
                subscribeBatch.push([doc.id, parseInt(authorId), timestamp])
            }
        }

        // Prepare subscribe_author_bookmarks_list
        if (doc.subscribe_author_bookmarks_list) {
            for (const [authorId, timestamp] of Object.entries(doc.subscribe_author_bookmarks_list)) {
                bookmarksBatch.push([doc.id, parseInt(authorId), timestamp])
            }
        }

        // Prepare link_chat_list
        if (doc.link_chat_list) {
            for (const [linkedChatId, linkData] of Object.entries(doc.link_chat_list)) {
                linksBatch.push([
                    doc.id,
                    parseInt(linkedChatId),
                    linkData.sync || 0,
                    linkData.administrator_only || 0,
                    linkData.repeat || 0,
                    cleanString(linkData.type) || 'group',
                    linkData.mediagroup_count || 1
                ])
            }
        }

        count++
        if (settingsBatch.length >= BATCH_SIZE) {
            await flushBatches()
            console.log(`  Processed ${count} chat settings...`)
        }
    }

    // Flush remaining
    await flushBatches()

    const duration = Date.now() - startTime
    console.log(`✓ Migrated ${stats.chat_settings} chat settings in ${formatDuration(duration)}`)
    console.log(`  - ${stats.chat_subscribe_authors} author subscriptions`)
    console.log(`  - ${stats.chat_subscribe_bookmarks} bookmark subscriptions`)
    console.log(`  - ${stats.chat_links} chat links`)
}

async function migrateNovels() {
    console.log('\n=== Migrating Novels ===')
    const startTime = Date.now()

    const novels = mongoDb.collection('novel')
    const cursor = novels.find({})

    const BATCH_SIZE = 100
    let batch = []
    let count = 0

    const flushBatch = async () => {
        if (batch.length === 0) return

        const values = []
        const placeholders = []
        batch.forEach((doc, idx) => {
            const offset = idx * 12
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`)
            // Extract tag names from tag objects array
            const tagNames = Array.isArray(doc.tags)
                ? doc.tags.map(t => typeof t === 'string' ? t : t.tag).filter(Boolean)
                : []

            values.push(
                cleanString(doc.id),
                cleanString(doc.title) || null,
                cleanString(doc.description) || null,
                cleanString(doc.seriesType) || null,
                cleanString(doc.userName) || null,
                doc.userId || null,
                doc.restrict || 0,
                doc.xRestrict || 0,
                tagNames,
                cleanString(doc.createDate) || null,
                cleanString(doc.coverUrl) || null,
                cleanString(doc.content) || null
            )
        })

        await pgPool.query(`
            INSERT INTO novel (
                id, title, description, series_type, user_name, user_id,
                restrict, x_restrict, tags, create_date, cover_url, content
            ) VALUES ${placeholders.join(', ')}
        `, values)

        stats.novels += batch.length
        batch = []
    }

    for await (const doc of cursor) {
        count++

        // Skip invalid novel data (missing required id)
        if (!doc.id) {
            console.log(`  ⚠️  Skipping invalid novel: id=${doc.id}`)
            continue
        }

        batch.push(doc)

        if (batch.length >= BATCH_SIZE) {
            await flushBatch()
            console.log(`  Processed ${count} novels...`)
        }
    }

    // Flush remaining
    await flushBatch()

    const duration = Date.now() - startTime
    console.log(`✓ Migrated ${stats.novels} novels in ${formatDuration(duration)}`)
}

async function migrateRankings() {
    console.log('\n=== Migrating Rankings ===')
    const startTime = Date.now()

    const rankings = mongoDb.collection('ranking')
    const cursor = rankings.find({})

    const BATCH_SIZE = 100
    let batch = []
    let count = 0

    const flushBatch = async () => {
        if (batch.length === 0) return

        const values = []
        const placeholders = []
        batch.forEach((doc, idx) => {
            const offset = idx * 4
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`)
            values.push(
                cleanString(doc.id),
                cleanString(doc.mode),
                cleanString(doc.date),
                JSON.stringify(doc.contents)
            )
        })

        await pgPool.query(`
            INSERT INTO ranking (id, mode, date, contents)
            VALUES ${placeholders.join(', ')}
        `, values)

        stats.rankings += batch.length
        batch = []
    }

    for await (const doc of cursor) {
        count++

        // Skip invalid ranking data (missing required fields)
        if (!doc.id || !doc.mode || !doc.date || !doc.contents) {
            console.log(`  ⚠️  Skipping invalid ranking: id=${doc.id}, mode=${doc.mode}, date=${doc.date}`)
            continue
        }

        batch.push(doc)

        if (batch.length >= BATCH_SIZE) {
            await flushBatch()
            console.log(`  Processed ${count} rankings...`)
        }
    }

    // Flush remaining
    await flushBatch()

    const duration = Date.now() - startTime
    console.log(`✓ Migrated ${stats.rankings} rankings in ${formatDuration(duration)}`)
}

async function migrateTelegraph() {
    console.log('\n=== Migrating Telegraph ===')
    const startTime = Date.now()

    const telegraphs = mongoDb.collection('telegraph')
    const cursor = telegraphs.find({})

    const BATCH_SIZE = 100
    let batch = []
    let count = 0

    const flushBatch = async () => {
        if (batch.length === 0) return

        const values = []
        const placeholders = []
        batch.forEach((doc, idx) => {
            const offset = idx * 3
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`)
            values.push(
                cleanString(doc.telegraph_url),
                doc.ids || [],
                doc.user_id || null
            )
        })

        await pgPool.query(`
            INSERT INTO telegraph (telegraph_url, illust_ids, user_id)
            VALUES ${placeholders.join(', ')}
        `, values)

        stats.telegraphs += batch.length
        batch = []
    }

    for await (const doc of cursor) {
        count++

        // Skip invalid telegraph data (missing required telegraph_url)
        if (!doc.telegraph_url) {
            console.log(`  ⚠️  Skipping invalid telegraph: telegraph_url=${doc.telegraph_url}`)
            continue
        }

        batch.push(doc)

        if (batch.length >= BATCH_SIZE) {
            await flushBatch()
            console.log(`  Processed ${count} telegraphs...`)
        }
    }

    // Flush remaining
    await flushBatch()

    const duration = Date.now() - startTime
    console.log(`✓ Migrated ${stats.telegraphs} telegraph entries in ${formatDuration(duration)}`)
}

async function cleanup() {
    console.log('\nCleaning up connections...')
    if (mongoClient) {
        await mongoClient.close()
    }
    if (pgPool) {
        await pgPool.end()
    }
}

async function main() {
    console.log('MongoDB → PostgreSQL Migration Tool')
    console.log('====================================\n')

    if (FORCE_MODE) {
        console.log('⚠️  Running in FORCE mode (--force)')
    }
    if (SKIP_AUTHORS) {
        console.log('⚠️  Skipping authors migration (--skip-authors)')
    }
    if (SKIP_ILLUSTS) {
        console.log('⚠️  Skipping illusts migration (--skip-illusts)')
    }

    const totalStartTime = Date.now()

    try {
        await connectDatabases()

        if (FORCE_MODE) {
            await truncateTables()
        } else {
            await checkTablesEmpty()
        }

        if (!SKIP_AUTHORS) {
            await migrateAuthors()
        }

        // Variable to track background index rebuilding
        let rebuildIndexesPromise = null

        // Illust migration with optimizations (UNLOGGED, drop indexes/FKs)
        if (!SKIP_ILLUSTS) {
            // Drop foreign keys and indexes before migration for better performance
            await dropForeignKeys()
            await dropIndexes()

            // Set illust tables to UNLOGGED for maximum speed (no WAL writes)
            await setTablesUnlogged()

            await migrateIllusts()

            // Set tables back to LOGGED before rebuilding indexes (required for data safety)
            await setTablesLogged()

            // Start rebuilding indexes in background (don't wait)
            rebuildIndexesPromise = rebuildIndexes()
            console.log('  ℹ️  Index rebuilding started in background...')

            // Rebuild foreign keys (fast, only 3 FKs)
            await rebuildForeignKeys()
        }

        // Migrate other tables while indexes are rebuilding in background
        await migrateChatSettings()
        await migrateNovels()
        await migrateRankings()
        await migrateTelegraph()

        // Wait for background index rebuilding to complete
        if (rebuildIndexesPromise) {
            console.log('\n⏳ Waiting for background index rebuilding to complete...')
            await rebuildIndexesPromise
        }

        const totalDuration = Date.now() - totalStartTime

        console.log('\n=== Migration Complete ===')
        console.log(`Total Time: ${formatDuration(totalDuration)}`)
        console.log('\nStatistics:')
        console.log(`  Authors:                  ${stats.authors}`)
        console.log(`  Illusts:                  ${stats.illusts}`)
        console.log(`  Illust Images:            ${stats.illust_images}`)
        console.log(`  Ugoira Meta:              ${stats.ugoira_meta}`)
        console.log(`  Chat Settings:            ${stats.chat_settings}`)
        console.log(`  Chat Subscribe Authors:   ${stats.chat_subscribe_authors}`)
        console.log(`  Chat Subscribe Bookmarks: ${stats.chat_subscribe_bookmarks}`)
        console.log(`  Chat Links:               ${stats.chat_links}`)
        console.log(`  Novels:                   ${stats.novels}`)
        console.log(`  Rankings:                 ${stats.rankings}`)
        console.log(`  Telegraph:                ${stats.telegraphs}`)

    } catch (error) {
        console.error('\n❌ Migration failed:', error)
        console.error('\n⚠️  Note: If migration failed, you may need to rebuild indexes and foreign keys manually:')
        console.error('  psql -d your_database -f rebuild_indexes.sql')
        console.error('\n⚠️  This will restore all indexes and foreign key constraints.')
        process.exit(1)
    } finally {
        await cleanup()
    }
}

main()
