import { newDb } from 'pg-mem'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Create a fresh in-memory PostgreSQL database for testing
 */
export function createTestDb() {
    const db = newDb()

    // Register missing PostgreSQL functions that pg-mem doesn't implement
    db.public.registerFunction({
        name: 'random',
        returns: 'float',
        implementation: () => Math.random()
    })

    db.public.registerFunction({
        name: 'now',
        returns: 'timestamptz',
        implementation: () => new Date()
    })

    // Load simplified test schema (pg-mem doesn't support all PostgreSQL features)
    const schemaPath = join(__dirname, 'test-schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')

    // Execute schema
    db.public.none(schema)

    return db
}

/**
 * Get a node-postgres compatible client from pg-mem
 */
export function getTestPool(db) {
    return db.adapters.createPg().Pool
}

/**
 * Seed test data
 */
export async function seedTestData(pool) {
    // Insert test author
    await pool.query(`
        INSERT INTO author (author_id, author_name, status)
        VALUES (12345, 'Test Artist', 1)
    `)

    // Insert test illust (regular image)
    await pool.query(`
        INSERT INTO illust (id, title, type, author_id, tags, x_restrict, ai_type, page_count)
        VALUES (111111, 'Test Illust', 0, 12345, ARRAY['tag1', 'tag2'], 0, 0, 2)
    `)

    // Insert test images
    await pool.query(`
        INSERT INTO illust_image (illust_id, page_index, thumb_url, regular_url, original_url, width, height)
        VALUES
            (111111, 0, 'https://i.pximg.net/thumb.jpg', 'https://i.pximg.net/regular.jpg', 'https://i.pximg.net/original.jpg', 1000, 1000),
            (111111, 1, 'https://i.pximg.net/thumb2.jpg', 'https://i.pximg.net/regular2.jpg', 'https://i.pximg.net/original2.jpg', 1200, 1200)
    `)

    // Insert test ugoira
    await pool.query(`
        INSERT INTO illust (id, title, type, author_id, tags, x_restrict, ai_type, page_count)
        VALUES (222222, 'Test Ugoira', 2, 12345, ARRAY['animated', 'test'], 0, 0, 1)
    `)

    await pool.query(`
        INSERT INTO ugoira_meta (illust_id, cover_img_url, width, height)
        VALUES (222222, 'https://i.pximg.net/ugoira_cover.jpg', 800, 600)
    `)

    return pool
}
