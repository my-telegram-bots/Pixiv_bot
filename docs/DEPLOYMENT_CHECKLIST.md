# PostgreSQL Migration - Production Deployment Checklist

## Pre-Deployment (30 minutes before)

- [ ] **Backup database**
  ```bash
  pg_dump pixiv_bot > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **Verify backup**
  ```bash
  ls -lh backup_*.sql
  ```

- [ ] **Test database connection**
  ```bash
  psql pixiv_bot -c "SELECT COUNT(*) FROM illust;"
  ```

## Deployment Steps (15 minutes)

### Step 1: Database Schema Updates

```bash
# Add performance indexes
psql pixiv_bot << 'EOF'
CREATE INDEX IF NOT EXISTS idx_illust_x_restrict ON illust(x_restrict);
CREATE INDEX IF NOT EXISTS idx_illust_type_deleted ON illust(type, deleted) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_illust_author_created ON illust(author_id, created_at DESC);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_illust_tags_trgm ON illust USING GIN(tags gin_trgm_ops);
EOF
```

**Expected output**:
- "CREATE INDEX" messages
- No errors

### Step 2: Code Deployment

```bash
# Pull latest code
git pull

# Install dependencies (if package.json changed)
pnpm install

# Restart services
pm2 restart all
```

**Expected output**:
- "✓ PostgreSQL connected"
- "✓ All system dependencies are installed"
- No errors

### Step 3: Immediate Verification (< 2 minutes)

- [ ] **Check bot started**
  ```bash
  pm2 logs --lines 20
  ```
  Look for: "bot @username started!"

- [ ] **Check database pool**
  ```bash
  psql pixiv_bot -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'pixiv_bot';"
  ```
  Should show: 5-10 connections (min pool size)

- [ ] **Test inline query** (via Telegram)
  Send any Pixiv URL to bot
  Expected: Response in < 1 second

- [ ] **Test random endpoint**
  ```bash
  time curl -s http://localhost:3000/api/illusts/random | jq '.ok'
  ```
  Expected: "true" in < 0.5 seconds

## Post-Deployment Monitoring (1 hour)

### Performance Metrics

- [ ] **Inline query response time** < 500ms
  ```bash
  # Check with multiple queries
  for i in {1..5}; do
    time curl -s 'http://localhost:3000/api/illusts/queue' \
      -H 'Content-Type: application/json' \
      -d '{"text":"123456"}' > /dev/null
  done
  ```

- [ ] **Random endpoint** < 200ms
  ```bash
  for i in {1..5}; do
    time curl -s http://localhost:3000/api/illusts/random > /dev/null
  done
  ```

- [ ] **Database connections** < 50
  ```bash
  watch -n 5 "psql pixiv_bot -c \"SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname = 'pixiv_bot';\""
  ```

- [ ] **No errors in logs**
  ```bash
  pm2 logs --lines 100 --nostream
  ```
  Look for:
  - ✓ No "pool exhausted" errors
  - ✓ No "timeout" errors
  - ✓ No SQL syntax errors

### Query Performance Verification

- [ ] **Enable query logging (optional)**
  ```bash
  psql pixiv_bot -c "ALTER DATABASE pixiv_bot SET log_min_duration_statement = 1000;"
  ```

- [ ] **Check slow queries**
  ```bash
  tail -f /var/log/postgresql/postgresql-*.log | grep "duration:"
  ```
  Expected: No queries > 1000ms

- [ ] **Verify N+1 fix**
  ```bash
  # Run inline search and check logs
  # Should see 1 aggregated query instead of 40+ queries
  psql pixiv_bot -c "SELECT query, calls FROM pg_stat_statements WHERE query LIKE '%illust%' ORDER BY calls DESC LIMIT 10;"
  ```

## Success Criteria

All of these must be true:

- ✅ Bot responds to commands
- ✅ Inline queries work (< 500ms)
- ✅ Random endpoint works (< 200ms)
- ✅ Database connections stable (< 50)
- ✅ No errors in logs for 1 hour
- ✅ Memory usage stable
- ✅ Query logs show single aggregated queries (not N+1)

## Rollback Procedure (if needed)

If ANY success criteria fails:

```bash
# Stop bot
pm2 stop all

# Rollback code
git checkout HEAD~1

# Restart
pm2 restart all

# Note: Schema changes are backward compatible (indexes only)
# Only restore database if absolutely necessary (will lose new data)
# psql pixiv_bot < backup_YYYYMMDD_HHMMSS.sql

# Notify team
echo "Rollback completed at $(date)" | tee -a rollback.log
```

## Common Issues & Solutions

### Issue: "pool exhausted" errors

**Solution**: Increase pool size
```javascript
// In config.js
postgres: {
    pool: { max: 100 }  // Increase from 50
}
```

### Issue: Slow random queries

**Verify**:
```bash
psql pixiv_bot -c "SELECT COUNT(*) FROM ugoira_meta WHERE random_value IS NOT NULL;"
```

**Fix**:
```bash
psql pixiv_bot -c "UPDATE ugoira_meta SET random_value = random() WHERE random_value IS NULL;"
```

### Issue: SQL injection errors

**Check logs**:
```bash
pm2 logs | grep "Invalid.*field"
```

**Solution**: Add missing field to allowedFields whitelist in db.js

### Issue: Connection leaks

**Check**:
```bash
psql pixiv_bot -c "SELECT pid, usename, application_name, state, state_change FROM pg_stat_activity WHERE datname = 'pixiv_bot';"
```

**Fix**:
```bash
pm2 restart all
```

## Contact

If issues persist after rollback:
1. Check detailed logs: `pm2 logs --lines 500`
2. Check database logs: `tail -100 /var/log/postgresql/*.log`
3. Check system resources: `htop`, `df -h`

## Sign-off

- [ ] Deployment completed by: ________________
- [ ] Date/Time: ________________
- [ ] All success criteria met: YES / NO
- [ ] Issues encountered: ________________
- [ ] Notes: ________________
