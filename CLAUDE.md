# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Telegram bot that bridges Pixiv and Telegram, allowing users to fetch and share Pixiv illustrations (including ugoira animations) through Telegram. The bot uses MongoDB for caching, supports inline queries, Telegraph integration, and includes automatic ranking features.

## Commands

### Installation & Setup
```bash
# Install dependencies
pnpm i

# Copy and edit configuration
cp config_sample.js config.js
# Edit config.js with your credentials

# First-time database initialization (creates indexes and directories)
node initial.js

# Run the bot (with PM2 in production)
pm2 start --name pixiv_bot app.js
# OR run directly for development
node app.js
```

### Run Scripts
```bash
# Run both bot and web server (default, 4GB memory)
pnpm all

# Run bot only (no web server)
pnpm bot

# Run web server only
pnpm web
```

### Database Migrations
When upgrading between versions, run migration scripts:
```bash
# Check update.js for available migrations
node update <migration_name>

# Example migrations:
node update update_db_2021_june
node update move_ugoira_folder_and_index_2022_nov
node update set_imgs_without_i_cf_2023_may
```

## System Dependencies

Required external tools (must be installed):
- **ffmpeg**: Video/image processing for ugoira conversion
- **mp4fpsmod**: Frame timing for MP4 files
- **MongoDB**: Data persistence (can be disabled with `DBLESS=1` env var)
- **Node.js**: Version 15+

## Architecture

### Modular Layer Architecture

The codebase follows a 4-layer architecture pattern (refactored in recent commits):

1. **API Layer** (`handlers/pixiv/api.js`): Raw Pixiv API calls
2. **Normalizer Layer** (`handlers/pixiv/normalizer.js`): Data transformation between Pixiv API format and internal format
3. **Service Layer** (`handlers/pixiv/illust-service.js`): Orchestration with cache, queue, and database management
4. **Handler Layer** (`handlers/telegram/*.js`): Telegram bot command handlers

### Key Components

**Entry Point**: `app.js`
- Loads configuration and validates system dependencies
- Creates bot instance with throttling and auto-retry middleware
- Sets up context properties (language, user_id, chat_id, text)
- Registers all bot command handlers and middleware
- Initializes file cleaner for temporary files

**Bot Factory**: `bot.js`
- Creates grammy Bot instance with throttling and auto-retry
- Configures custom Telegram API server if needed

**Database**: `db.js`
- MongoDB wrapper with collections: `illust`, `chat_setting`, `novel`, `ranking`, `author`, `telegraph`
- Supports DBLESS mode (dummy collections that return null/success)
- `update_setting()`: Handles complex user settings with prototype pollution protection

**Configuration**: `config.js` (copy from `config_sample.js`)
- `mongodb`: Database connection settings
- `pixiv`: Cookie, user-agent, proxy, CSRF token, ugoira URL settings
- `tg`: Bot token, Telegraph token, master_id for error reporting, refetch API

**Pixiv Module** (`handlers/pixiv/`):
- `illust-service.js`: Central orchestrator with queue management and 404 caching
  - `getQuick()`: Fast mode for inline queries (skips file probing)
  - `get()`: Full mode with file probing for accurate dimensions
- `illust.js`: Legacy illust fetching (being replaced by service layer)
- `tools.js`: Ugoira conversion utilities, URL transformations, file operations
  - `ugoira_to_mp4()`: Downloads ugoira zip and converts to MP4 using ffmpeg
  - `thumb_to_all()`: Converts thumbnail URLs to regular/original URLs
- `url-builder.js`: Fast URL generation (skips HEAD requests) and URL probing
- `ranking.js`: Fetches daily/weekly/monthly rankings from Pixiv
- `ranking-scheduler.js`: Automatic ranking updates with cron-like scheduling
- `user.js`: Author/user illustration fetching

**Telegram Module** (`handlers/telegram/`):
- `pre_handle.js`: URL/ID extraction from messages (supports multiple formats)
- `handle_illust.js`: Main illustration handling logic
- `mediagroup.js`: Media group (album) creation and management
- `telegraph.js`: Telegraph page generation for illustrations
- `format.js`: Message formatting with user-customizable templates (v1/v2 format system)
- `i18n.js`: Language support (en, ja, zh-hans, zh-hant)
- `keyboard.js`: Inline keyboard generation

**Utilities** (`handlers/utils/`):
- `config-validator.js`: Validates configuration and checks system dependencies on startup
- `file-cleaner.js`: Automatic cleanup of temporary files (temp files only, preserves MP4s)

**Common** (`handlers/common.js`):
- Shared utilities: `asyncForEach`, `sleep`, `exec`, `download_file`
- `honsole`: Custom console wrapper for logging
- `MemoryMonitor`: Tracks memory usage and sends alerts to master

### Path Aliases (ES Modules Imports)

Defined in `package.json` imports field:
- `#handlers/*` → `./handlers/*.js`
- `#handlers/utils/*` → `./handlers/utils/*.js`
- `#handlers/pixiv/*` → `./handlers/pixiv/*.js`
- `#handlers/telegram/*` → `./handlers/telegram/*.js`
- `#config` → `./config.js`
- `#db` → `./db.js`

Always use these aliases when importing, never relative paths like `../../db.js`.

### Data Flow: Pixiv → Telegram

1. User sends Pixiv URL/ID to bot
2. `pre_handle.js` extracts IDs from message
3. `illust-service.js` orchestrates:
   - Check 404 cache → Check database → Queue Pixiv API call → Fetch from API
   - Normalize data → Build URLs → Save to database → Return
4. `handle_illust.js` processes illust data
5. `mediagroup.js` or Telegraph generates output
6. Bot sends media/message to user

### Ugoira Processing

Ugoira (Pixiv animations) are converted to MP4:
1. Download ugoira ZIP file from Pixiv
2. Extract frames to `./tmp/ugoira/`
3. Generate timecode file for variable frame rates
4. Use ffmpeg to merge frames with timecodes
5. Use mp4fpsmod to fix frame timing
6. Cache result in `./tmp/mp4/` with directory sharding by ID prefix
7. Serve to Telegram via upload or URL (depending on `ugoira_remote` config)

### File Storage

- `./tmp/file/`: Downloaded images (temporary, auto-cleaned)
- `./tmp/ugoira/`: Extracted ugoira frames (temporary, auto-cleaned)
- `./tmp/timecode/`: Frame timing files (temporary, auto-cleaned)
- `./tmp/mp4/`: Converted MP4 files (permanent, organized by ID prefix)
  - Example: illust 87466156 → `./tmp/mp4/0874/87466156.mp4`

### Settings & Format System

Users can customize output format using v1 (legacy) or v2 (current) format strings:
- Message format: Caption text with variables like `{title}`, `{author}`, `{tags}`
- Mediagroup format: Album captions
- Inline format: Inline query results

Settings stored per chat/user in `chat_setting` collection with prototype pollution protection.

## Important Patterns

### Queue Management
The bot implements request queuing to avoid Pixiv rate limiting (429 errors). IllustService manages a Map-based queue with timestamp tracking and retry logic.

### Security
- Prototype pollution prevention in `update_setting()` and `sanitizeObject()`
- Blocks dangerous property names: `__proto__`, `constructor`, `prototype`

### Error Handling
- Failed API requests are reported to master_id via Telegram
- 404 responses are cached for 10 minutes to reduce API calls
- Refetch API fallback for failed image uploads

### Memory Management
- MemoryMonitor tracks heap usage and sends alerts at thresholds
- FileCleaner periodically removes old temporary files
- TTLCache with automatic expiration for 404s and other transient data

### Bot Middleware Pattern
app.js uses middleware pattern:
1. Context initialization (language, user_id, chat_id)
2. Command parsing (removes @botname from commands)
3. Route to specific handlers (start, help, illust, ranking, etc.)

## Configuration Notes

- `config.pixiv.cookie`: Required for authenticated requests (author subscriptions, rankings)
- `config.pixiv.pximgproxy`: Proxy URL for i.pximg.net (required in regions where Pixiv images are blocked)
- `config.tg.access_token`: Telegraph API token for creating telegra.ph pages
- `config.tg.refetch_api`: Fallback API endpoint when direct image sending fails

## Environment Variables

- `DBLESS=1`: Run without MongoDB (in-memory only, not recommended for production)
- `WEBLESS=1`: Run bot only, skip web server
- `TELEGRAM_API_SERVER`: Custom Telegram API server URL
- `dev=1`: Enable development logging (honsole.dev messages)
