/**
 * Database Migration Checker
 * Checks for pending schema patches and applies them automatically on startup
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PATCHES_DIR = join(__dirname, 'sql', 'patches')

/**
 * Ensure schema_migrations table exists
 */
async function ensureMigrationsTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            version TEXT NOT NULL UNIQUE,
            executed_at TIMESTAMPTZ DEFAULT NOW(),
            execution_time_ms INT,
            batch INT DEFAULT 1
        )
    `)
}

/**
 * Get all patch files in order
 */
function getAllPatches() {
    try {
        const files = readdirSync(PATCHES_DIR)
            .filter(f => f.endsWith('.sql') && f.startsWith('patch-'))
            .sort()
        return files
    } catch (error) {
        // Directory doesn't exist or no patches
        return []
    }
}

/**
 * Get executed migrations
 */
async function getExecutedMigrations(pool) {
    const result = await pool.query(
        'SELECT version FROM schema_migrations ORDER BY id'
    )
    return new Set(result.rows.map(r => r.version))
}

/**
 * Check if patch requires manual execution (filename contains 'manually')
 */
function requiresManualExecution(filename) {
    return filename.toLowerCase().includes('manually')
}

/**
 * Get pending patches
 */
async function getPendingPatches(pool) {
    const allPatches = getAllPatches()
    const executed = await getExecutedMigrations(pool)

    return allPatches.filter(file => {
        const version = file.replace('.sql', '')
        return !executed.has(version)
    })
}

/**
 * Get pending patches that can be auto-applied
 */
async function getAutoApplicablePatches(pool) {
    const pending = await getPendingPatches(pool)
    return pending.filter(file => !requiresManualExecution(file))
}

/**
 * Get pending patches that require manual execution
 */
async function getManualPatches(pool) {
    const pending = await getPendingPatches(pool)
    return pending.filter(file => requiresManualExecution(file))
}

/**
 * Apply a single patch
 */
async function applyPatch(pool, filename) {
    const version = filename.replace('.sql', '')
    const filepath = join(PATCHES_DIR, filename)
    const sql = readFileSync(filepath, 'utf-8')

    console.log(`  Applying patch: ${version}`)
    const startTime = Date.now()

    try {
        await pool.query('BEGIN')

        // Execute patch SQL
        await pool.query(sql)

        // Record migration (if not already in the patch file)
        await pool.query(`
            INSERT INTO schema_migrations (version, execution_time_ms, batch)
            VALUES ($1, $2, (SELECT COALESCE(MAX(batch), 0) + 1 FROM schema_migrations))
            ON CONFLICT (version) DO NOTHING
        `, [version, Date.now() - startTime])

        await pool.query('COMMIT')
        console.log(`  ✓ Applied ${version} (${Date.now() - startTime}ms)`)
        return true
    } catch (error) {
        await pool.query('ROLLBACK')
        console.error(`  ✗ Failed to apply ${version}:`, error.message)
        throw error
    }
}

/**
 * Check and apply pending migrations
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {boolean} autoApply - If true, auto-apply patches. If false, exit on pending patches.
 */
export async function checkAndApplyMigrations(pool, autoApply = true) {
    try {
        // Ensure migrations table exists
        await ensureMigrationsTable(pool)

        // Check for pending patches
        const manualPatches = await getManualPatches(pool)
        const autoPatches = await getAutoApplicablePatches(pool)
        const totalPending = manualPatches.length + autoPatches.length

        if (totalPending === 0) {
            console.log('✓ Database schema is up to date')
            return true
        }

        // Always block if there are manual patches
        if (manualPatches.length > 0) {
            console.error(`\n✗ Found ${manualPatches.length} patch(es) requiring MANUAL execution:`)
            manualPatches.forEach(p => {
                console.error(`  ⚠ ${p}`)
            })
            console.error('\n  These patches must be applied manually:')
            manualPatches.forEach(p => {
                console.error(`    psql pixiv_bot < sql/patches/${p}`)
            })
            console.error('\n  Reason: Marked with /* manually */ (dangerous operation)')
            console.error('  Please review, backup database, and apply manually before starting bot.\n')
            return false
        }

        // Handle auto-applicable patches
        if (autoPatches.length > 0) {
            console.log(`\n⚠ Found ${autoPatches.length} pending schema patch(es):`)
            autoPatches.forEach(p => console.log(`  - ${p}`))

            if (!autoApply) {
                console.error('\n✗ Database schema is out of date!')
                console.error('  Please apply pending patches manually:')
                autoPatches.forEach(p => {
                    console.error(`    psql pixiv_bot < sql/patches/${p}`)
                })
                console.error('\n  Or set AUTO_APPLY_PATCHES=1 to auto-apply on startup')
                return false
            }

            // Auto-apply patches
            console.log('\n→ Auto-applying patches...')
            for (const patch of autoPatches) {
                await applyPatch(pool, patch)
            }

            console.log('✓ All patches applied successfully\n')
        }

        return true
    } catch (error) {
        console.error('✗ Migration check failed:', error.message)
        throw error
    }
}

/**
 * Show migration status
 */
export async function showMigrationStatus(pool) {
    await ensureMigrationsTable(pool)

    const allPatches = getAllPatches()
    const executed = await getExecutedMigrations(pool)

    console.log('\n📊 Database Migration Status:\n')

    if (allPatches.length === 0) {
        console.log('  No patches defined')
        return
    }

    allPatches.forEach(file => {
        const version = file.replace('.sql', '')
        const status = executed.has(version) ? '✓' : '⏳'
        console.log(`  ${status} ${version}`)
    })

    const pending = allPatches.filter(f => !executed.has(f.replace('.sql', '')))
    if (pending.length > 0) {
        console.log(`\n  ⚠ ${pending.length} pending patch(es)`)
    } else {
        console.log(`\n  ✓ All patches applied`)
    }

    console.log('')
}
