-- Rebuild all indexes and foreign keys for Pixiv Bot PostgreSQL database
-- Use this script if migration failed and indexes/foreign keys were not rebuilt

-- ============================================
-- 1. Rebuild Indexes
-- ============================================

-- Drop existing indexes (just in case)
DROP INDEX IF EXISTS idx_author_name;
DROP INDEX IF EXISTS idx_author_status;
DROP INDEX IF EXISTS idx_illust_author;
DROP INDEX IF EXISTS idx_illust_type;
DROP INDEX IF EXISTS idx_illust_tags;
DROP INDEX IF EXISTS idx_illust_deleted;
DROP INDEX IF EXISTS idx_illust_image_illust;
DROP INDEX IF EXISTS idx_subscribe_author_chat;
DROP INDEX IF EXISTS idx_subscribe_author_author;
DROP INDEX IF EXISTS idx_subscribe_bookmarks_chat;
DROP INDEX IF EXISTS idx_chat_link_source;
DROP INDEX IF EXISTS idx_ranking_mode_date;
DROP INDEX IF EXISTS idx_telegraph_user;
DROP INDEX IF EXISTS idx_illust_x_restrict;
DROP INDEX IF EXISTS idx_illust_type_deleted;
DROP INDEX IF EXISTS idx_illust_author_created;
DROP INDEX IF EXISTS idx_illust_tags_trgm;
DROP INDEX IF EXISTS idx_ugoira_random;

-- Rebuild indexes
CREATE INDEX idx_author_name ON author(author_name);
CREATE INDEX idx_author_status ON author(status);
CREATE INDEX idx_illust_author ON illust(author_id);
CREATE INDEX idx_illust_type ON illust(type);
CREATE INDEX idx_illust_tags ON illust USING GIN(tags);
CREATE INDEX idx_illust_deleted ON illust(deleted) WHERE deleted = TRUE;
CREATE INDEX idx_illust_image_illust ON illust_image(illust_id);
CREATE INDEX idx_subscribe_author_chat ON chat_subscribe_author(chat_id);
CREATE INDEX idx_subscribe_author_author ON chat_subscribe_author(author_id);
CREATE INDEX idx_subscribe_bookmarks_chat ON chat_subscribe_bookmarks(chat_id);
CREATE INDEX idx_chat_link_source ON chat_link(source_chat_id);
CREATE INDEX idx_ranking_mode_date ON ranking(mode, date);
CREATE INDEX idx_telegraph_user ON telegraph(user_id);

-- Performance indexes for 2.2M+ dataset
CREATE INDEX idx_illust_x_restrict ON illust(x_restrict);
CREATE INDEX idx_illust_type_deleted ON illust(type, deleted) WHERE deleted = FALSE;
CREATE INDEX idx_illust_author_created ON illust(author_id, created_at DESC);

-- Fast tag search with trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_illust_tags_trgm ON illust USING GIN(tags gin_trgm_ops);

-- Fast random sampling for ugoira
CREATE INDEX idx_ugoira_random ON ugoira_meta(random_value);

-- ============================================
-- 2. Rebuild Foreign Keys
-- ============================================

-- Drop existing foreign keys (just in case)
ALTER TABLE illust DROP CONSTRAINT IF EXISTS illust_author_id_fkey;
ALTER TABLE illust_image DROP CONSTRAINT IF EXISTS illust_image_illust_id_fkey;
ALTER TABLE ugoira_meta DROP CONSTRAINT IF EXISTS ugoira_meta_illust_id_fkey;

-- Rebuild foreign keys
ALTER TABLE illust ADD CONSTRAINT illust_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES author(author_id);

ALTER TABLE illust_image ADD CONSTRAINT illust_image_illust_id_fkey
    FOREIGN KEY (illust_id) REFERENCES illust(id) ON DELETE CASCADE;

ALTER TABLE ugoira_meta ADD CONSTRAINT ugoira_meta_illust_id_fkey
    FOREIGN KEY (illust_id) REFERENCES illust(id) ON DELETE CASCADE;

-- ============================================
-- 3. Analyze tables to update statistics
-- ============================================

ANALYZE author;
ANALYZE illust;
ANALYZE illust_image;
ANALYZE ugoira_meta;
ANALYZE chat_setting;
ANALYZE chat_subscribe_author;
ANALYZE chat_subscribe_bookmarks;
ANALYZE chat_link;
ANALYZE novel;
ANALYZE ranking;
ANALYZE telegraph;
