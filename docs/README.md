# Documentation

## PostgreSQL Migration

This directory contains documentation related to the MongoDB → PostgreSQL migration.

### Migration Documents

- **[POSTGRES-MIGRATION.md](./POSTGRES-MIGRATION.md)** - Original migration plan and architecture
- **[MIGRATION_FIXES_SUMMARY.md](./MIGRATION_FIXES_SUMMARY.md)** - Production readiness fixes implementation summary
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Step-by-step deployment guide
- **[db-mirgate.md](./db-mirgate.md)** - Database migration notes

### Migration Status

✅ **Completed Features:**
- Database wrapper layer with MongoDB-compatible API
- Connection pooling and graceful shutdown
- SQL injection prevention (field whitelists)
- N+1 query optimization (aggregated JOINs)
- Fast random sampling (indexed random_value)
- Performance indexes for 2.2M+ dataset
- Direct SQL API functions:
  - `getIllust(id)` - Fetch illust by ID
  - `updateIllust(id, data, options)` - Update/insert illust with upsert support
- Test coverage with ava + pg-mem

### Database Schema

Schema files are located in `/sql/`:
- `sql/schema.sql` - Full PostgreSQL schema (for new installations)
- `sql/rebuild_indexes.sql` - Index rebuild script
- `sql/patches/` - Migration patches (incremental schema updates)
- `sql/README.md` - Schema documentation and patch guidelines

**Applying schema patches:**
```bash
# Apply specific patch
psql pixiv_bot < sql/patches/patch-001-xxx.sql

# Check migration status
psql pixiv_bot -c "SELECT * FROM schema_migrations ORDER BY id;"
```

### Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

Test files are in `/test/`:
- `test/db.test.js` - Database function tests
- `test/helpers/db-setup.js` - Test database setup (pg-mem)
- `test/helpers/test-schema.sql` - Simplified schema for testing
