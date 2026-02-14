# Database Schema & Migrations

PostgreSQL database schema and migration patches for Pixiv Bot.

## Files

- **schema.sql** - Complete database schema (for new installations)
- **rebuild_indexes.sql** - Rebuild all indexes (for maintenance)
- **patches/** - Migration patches (for schema updates)

## Schema Patches

Schema patches are incremental SQL scripts for updating existing databases.

### Naming Convention

```
patch-NNN-description[-manually].sql
```

- **NNN** - Sequential number (001, 002, 003, ...)
- **description** - Short description in lowercase with hyphens
- **-manually** - (Optional) Add this suffix for dangerous operations requiring manual review

**Examples:**
- `patch-001-add-random-value.sql` - Auto-apply
- `patch-002-add-user-preferences.sql` - Auto-apply
- `patch-003-drop-old-table-manually.sql` - **Requires manual execution**
- `patch-004-large-migration-manually.sql` - **Requires manual execution**

### Creating a New Patch

1. Create a new file in `sql/patches/` following the naming convention
2. Write SQL to update the schema
3. Add English comments explaining the changes
4. Test on a development database first

### Manual vs Auto-Apply

Patches can be marked for manual execution by including `manually` in the **filename**:

```
patch-002-drop-old-table-manually.sql  ← Bot refuses to start until applied
```

- **Auto-apply patches** - Applied automatically on bot startup (default behavior)
- **Manual patches** (filename contains `manually`) - Bot **refuses to start** until manually applied

**When to use `-manually` suffix:**
- DROP TABLE / DROP COLUMN operations
- Large data migrations (>100K rows)
- Breaking schema changes
- Operations requiring downtime
- Anything that needs human review before execution

### Example Patches

**Auto-apply patch** (`patch-001-add-random-value.sql`):

```sql
-- Patch 001: Add random_value column for fast random sampling
-- Date: 2025-02-15
-- Description: Adds indexed random_value column to ugoira_meta table for O(1) random queries

BEGIN;

-- Add random_value column
ALTER TABLE ugoira_meta ADD COLUMN IF NOT EXISTS random_value FLOAT DEFAULT random();

-- Create index
CREATE INDEX IF NOT EXISTS idx_ugoira_random ON ugoira_meta(random_value);

-- Initialize values for existing rows
UPDATE ugoira_meta SET random_value = random() WHERE random_value IS NULL;

-- Record migration
INSERT INTO schema_migrations (version, execution_time_ms, batch)
VALUES ('patch-001-add-random-value', 0, 1)
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

**Manual patch** (`patch-002-drop-old-table-manually.sql`):

```sql
-- Patch 002: Drop deprecated table (MANUAL - filename contains 'manually')
-- Date: 2025-02-15
-- Description: Removes old_table that is no longer used
-- DANGER: This will permanently delete data!

BEGIN;

DROP TABLE IF EXISTS old_table_name CASCADE;

INSERT INTO schema_migrations (version, execution_time_ms, batch)
VALUES ('patch-002-drop-old-table-manually', 0, 1)
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

### Applying Patches

**Manual execution (required):**

```bash
# Apply a specific patch
psql pixiv_bot < sql/patches/patch-001-xxx.sql

# Or connect and run interactively
psql pixiv_bot
pixiv_bot=# \i sql/patches/patch-001-xxx.sql
```

**Always:**
1. Backup database before applying patches
2. Test on development database first
3. Review patch SQL before running

### Migration Tracking

All applied patches are tracked in the `schema_migrations` table:

```sql
SELECT * FROM schema_migrations ORDER BY id;
```

| id | version | executed_at | execution_time_ms | batch |
|----|---------|-------------|-------------------|-------|
| 1 | patch-001-add-random-value | 2025-02-15 10:00:00 | 1200 | 1 |

## Schema Overview

### Core Tables

- **author** - Artist/author information
- **illust** - Illustration metadata
- **illust_image** - Image URLs and dimensions (for multi-page illusts)
- **ugoira_meta** - Ugoira (animation) metadata

### User Settings

- **chat_setting** - User/chat preferences
- **chat_subscribe_author** - Author subscriptions
- **chat_subscribe_bookmarks** - Bookmark subscriptions
- **chat_link** - Chat linking configuration

### Content

- **novel** - Novel/text works from Pixiv
- **ranking** - Cached ranking data
- **telegraph** - Telegraph.ph page cache

### System

- **schema_migrations** - Migration tracking (auto-created)

## Indexes

Performance indexes are defined in `schema.sql`:

- **GIN indexes** - For array fields (tags)
- **Partial indexes** - For filtered queries (deleted = FALSE)
- **Composite indexes** - For common query patterns
- **Trigram indexes** - For fuzzy text search (pg_trgm extension)

## Maintenance

### Rebuild Indexes

If indexes become corrupted or need rebuilding:

```bash
psql pixiv_bot < sql/rebuild_indexes.sql
```

### Vacuum & Analyze

For optimal performance, run periodically:

```bash
psql pixiv_bot -c "VACUUM ANALYZE;"
```

### Check Index Usage

Monitor index usage:

```sql
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

## Best Practices

1. **Always test patches on development database first**
2. **Backup database before applying patches**
   ```bash
   pg_dump pixiv_bot > backup_$(date +%Y%m%d).sql
   ```
3. **Use transactions in patches** (BEGIN/COMMIT)
4. **Add English comments** explaining what and why
5. **Keep patches idempotent** when possible (IF NOT EXISTS, etc.)
6. **Document breaking changes** in patch comments
