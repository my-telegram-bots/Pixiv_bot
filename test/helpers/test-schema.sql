-- Simplified schema for pg-mem testing
-- Only includes basic tables without advanced PostgreSQL features

CREATE TABLE author (
    author_id BIGINT PRIMARY KEY,
    author_name TEXT NOT NULL,
    author_avatar_url TEXT,
    comment TEXT,
    comment_html TEXT,
    status SMALLINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE illust (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    type SMALLINT NOT NULL DEFAULT 0,
    comment TEXT,
    description TEXT,
    author_id BIGINT REFERENCES author(author_id),
    tags TEXT[] DEFAULT '{}',
    sl SMALLINT DEFAULT 0,
    restrict SMALLINT DEFAULT 0,
    x_restrict SMALLINT DEFAULT 0,
    ai_type SMALLINT DEFAULT 0,
    page_count SMALLINT DEFAULT 1,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE illust_image (
    id BIGSERIAL PRIMARY KEY,
    illust_id BIGINT NOT NULL REFERENCES illust(id) ON DELETE CASCADE,
    page_index SMALLINT NOT NULL DEFAULT 0,
    thumb_url TEXT,
    regular_url TEXT,
    original_url TEXT,
    width INT,
    height INT,
    tg_file_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(illust_id, page_index)
);

CREATE TABLE ugoira_meta (
    illust_id BIGINT PRIMARY KEY REFERENCES illust(id) ON DELETE CASCADE,
    cover_img_url TEXT,
    width INT,
    height INT,
    tg_file_id TEXT,
    mp4_path TEXT,
    random_value FLOAT DEFAULT random(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_setting (
    id BIGINT PRIMARY KEY,
    format_message TEXT,
    format_mediagroup_message TEXT,
    format_inline TEXT,
    format_version TEXT DEFAULT 'v2',
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
    default_telegraph_title TEXT,
    default_telegraph_author_name TEXT,
    default_telegraph_author_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_subscribe_author (
    chat_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (chat_id, author_id)
);

CREATE TABLE chat_subscribe_bookmarks (
    chat_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (chat_id, author_id)
);

CREATE TABLE chat_link (
    source_chat_id BIGINT NOT NULL,
    linked_chat_id BIGINT NOT NULL,
    sync SMALLINT DEFAULT 0,
    administrator_only SMALLINT DEFAULT 0,
    repeat SMALLINT DEFAULT 0,
    chat_type TEXT,
    mediagroup_count SMALLINT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (source_chat_id, linked_chat_id)
);

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

CREATE TABLE ranking (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    date TEXT NOT NULL,
    contents JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE telegraph (
    telegraph_url TEXT PRIMARY KEY,
    illust_ids BIGINT[] NOT NULL,
    user_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
