-- PostgreSQL Schema for Pixiv Bot
-- Migration from MongoDB to PostgreSQL

-- ============================================
-- 0. schema_migrations 表 (Migration Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,  -- Migration version/name (e.g., '20250215_add_random_value')
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    execution_time_ms INT,  -- How long did it take to run
    batch INT DEFAULT 1     -- Batch number for grouping migrations
);

CREATE INDEX idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX idx_schema_migrations_batch ON schema_migrations(batch);

-- ============================================
-- 1. author 表
-- ============================================
CREATE TABLE author (
    author_id BIGINT PRIMARY KEY,
    author_name TEXT NOT NULL,
    author_avatar_url TEXT,
    comment TEXT,
    comment_html TEXT,
    status SMALLINT DEFAULT 0,  -- 0=unknown, 1=active, 2=banned
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_author_name ON author(author_name);
CREATE INDEX idx_author_status ON author(status);

-- ============================================
-- 2. illust 表
-- ============================================
CREATE TABLE illust (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    type SMALLINT NOT NULL DEFAULT 0,  -- 0=image, 1=manga, 2=ugoira
    comment TEXT,
    description TEXT,
    author_id BIGINT REFERENCES author(author_id),
    tags TEXT[] DEFAULT '{}',
    sl SMALLINT DEFAULT 0,
    restrict SMALLINT DEFAULT 0,        -- 兼容旧字段
    x_restrict SMALLINT DEFAULT 0,      -- 0=normal, 1=R18, 2=R18-G
    ai_type SMALLINT DEFAULT 0,         -- 0=not AI, 1=AI, 2=other
    page_count SMALLINT DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    random_value FLOAT DEFAULT random(), -- For fast random sampling
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_illust_author ON illust(author_id);
CREATE INDEX idx_illust_type ON illust(type);
CREATE INDEX idx_illust_tags ON illust USING GIN(tags);
CREATE INDEX idx_illust_deleted ON illust(deleted) WHERE deleted = TRUE;

-- Performance indexes for 2.2M+ dataset
CREATE INDEX idx_illust_x_restrict ON illust(x_restrict);
CREATE INDEX idx_illust_type_deleted ON illust(type, deleted) WHERE deleted = FALSE;
CREATE INDEX idx_illust_author_created ON illust(author_id, created_at DESC);
CREATE INDEX idx_illust_random ON illust(random_value);

-- Fast tag search with trigram (requires IMMUTABLE function for indexing)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create IMMUTABLE wrapper function for array_to_string
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT array_to_string($1, $2)
$$;

CREATE INDEX idx_illust_tags_trgm ON illust USING GIN(immutable_array_to_string(tags, ' ') gin_trgm_ops);

-- ============================================
-- 3. illust_image 表
-- ============================================
CREATE TABLE illust_image (
    id BIGSERIAL PRIMARY KEY,
    illust_id BIGINT NOT NULL REFERENCES illust(id) ON DELETE CASCADE,
    page_index SMALLINT NOT NULL DEFAULT 0,  -- 第几页，0-based

    -- URLs (可能会变化)
    thumb_url TEXT,
    regular_url TEXT,
    original_url TEXT,

    -- 尺寸
    width INT,
    height INT,

    -- Telegram file_id 缓存
    tg_file_id TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(illust_id, page_index)
);

CREATE INDEX idx_illust_image_illust ON illust_image(illust_id);

-- ============================================
-- 4. ugoira_meta 表
-- ============================================
CREATE TABLE ugoira_meta (
    illust_id BIGINT PRIMARY KEY REFERENCES illust(id) ON DELETE CASCADE,
    cover_img_url TEXT,
    width INT,
    height INT,
    tg_file_id TEXT,           -- 动画 file_id
    mp4_path TEXT,             -- 本地 MP4 路径
    random_value FLOAT DEFAULT random(),  -- Fast random sampling
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ugoira_random ON ugoira_meta(random_value);

-- ============================================
-- 5. chat_setting 表
-- ============================================
CREATE TABLE chat_setting (
    id BIGINT PRIMARY KEY,     -- chat_id 或 user_id

    -- format 设置
    format_message TEXT,
    format_mediagroup_message TEXT,
    format_inline TEXT,
    format_version TEXT DEFAULT 'v2',

    -- default 布尔设置 (扁平化)
    default_tags BOOLEAN DEFAULT FALSE,
    default_description BOOLEAN DEFAULT FALSE,
    default_open BOOLEAN DEFAULT FALSE,
    default_share BOOLEAN DEFAULT FALSE,
    default_remove_keyboard BOOLEAN DEFAULT FALSE,
    default_remove_caption BOOLEAN DEFAULT FALSE,
    default_single_caption BOOLEAN DEFAULT FALSE,
    default_album BOOLEAN DEFAULT FALSE,
    default_album_one BOOLEAN DEFAULT FALSE,
    default_album_equal BOOLEAN DEFAULT FALSE,
    default_reverse BOOLEAN DEFAULT FALSE,
    default_overwrite BOOLEAN DEFAULT FALSE,
    default_asfile BOOLEAN DEFAULT FALSE,
    default_append_file BOOLEAN DEFAULT FALSE,
    default_append_file_immediate BOOLEAN DEFAULT FALSE,
    default_caption_extraction BOOLEAN DEFAULT FALSE,
    default_caption_above BOOLEAN DEFAULT FALSE,
    default_show_id BOOLEAN DEFAULT FALSE,
    default_auto_spoiler BOOLEAN DEFAULT FALSE,

    -- telegraph 设置
    default_telegraph_title TEXT,
    default_telegraph_author_name TEXT,
    default_telegraph_author_url TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. chat_subscribe_author 表
-- ============================================
CREATE TABLE chat_subscribe_author (
    chat_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (chat_id, author_id)
);

CREATE INDEX idx_subscribe_author_chat ON chat_subscribe_author(chat_id);
CREATE INDEX idx_subscribe_author_author ON chat_subscribe_author(author_id);

-- ============================================
-- 7. chat_subscribe_bookmarks 表
-- ============================================
CREATE TABLE chat_subscribe_bookmarks (
    chat_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (chat_id, author_id)
);

CREATE INDEX idx_subscribe_bookmarks_chat ON chat_subscribe_bookmarks(chat_id);

-- ============================================
-- 8. chat_link 表
-- ============================================
CREATE TABLE chat_link (
    source_chat_id BIGINT NOT NULL,      -- 原始聊天 ID
    linked_chat_id BIGINT NOT NULL,      -- 链接的聊天 ID
    sync SMALLINT DEFAULT 0,             -- 0=双向, 1=仅提及
    administrator_only SMALLINT DEFAULT 0,
    repeat SMALLINT DEFAULT 0,           -- 0/1/2
    chat_type TEXT,                      -- 'private'/'group'/'supergroup'/'channel'
    mediagroup_count SMALLINT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (source_chat_id, linked_chat_id)
);

CREATE INDEX idx_chat_link_source ON chat_link(source_chat_id);

-- ============================================
-- 9. novel 表
-- ============================================
CREATE TABLE novel (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    series_type TEXT,
    user_name TEXT,
    user_id BIGINT,
    restrict SMALLINT DEFAULT 0,
    x_restrict SMALLINT DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    create_date TEXT,
    cover_url TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. ranking 表
-- ============================================
CREATE TABLE ranking (
    id TEXT PRIMARY KEY,           -- mode+date_page, e.g., "daily20240115_1"
    mode TEXT NOT NULL,            -- 'daily', 'weekly', 'monthly'
    date TEXT NOT NULL,            -- YYYYMMDD
    contents JSONB NOT NULL,       -- 保持 JSON 结构
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ranking_mode_date ON ranking(mode, date);

-- ============================================
-- 11. telegraph 表
-- ============================================
CREATE TABLE telegraph (
    telegraph_url TEXT PRIMARY KEY,
    illust_ids BIGINT[] NOT NULL,
    user_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_telegraph_user ON telegraph(user_id);

-- ============================================
-- 更新时间触发器函数
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要 updated_at 的表创建触发器
CREATE TRIGGER update_author_updated_at BEFORE UPDATE ON author
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_illust_updated_at BEFORE UPDATE ON illust
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_illust_image_updated_at BEFORE UPDATE ON illust_image
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ugoira_meta_updated_at BEFORE UPDATE ON ugoira_meta
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_setting_updated_at BEFORE UPDATE ON chat_setting
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_link_updated_at BEFORE UPDATE ON chat_link
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
