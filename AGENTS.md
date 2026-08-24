# Repository Guide

## Project Overview

This repository contains a Node.js Telegram bot that retrieves Pixiv illustrations,
manga, novels, rankings, authors, and ugoira animations and delivers them through
Telegram messages, inline queries, media groups, files, and Telegraph pages.

The project is an ES module package. Use the import aliases declared in
`package.json` (`#handlers/*`, `#handlers/pixiv/*`, `#handlers/telegram/*`,
`#handlers/utils/*`, `#config`, and `#db`) instead of introducing deep relative
imports.

## Architecture and Data Flow

- `app.js` is the main process. It loads and validates configuration, creates the
  Grammy bot, registers middleware and handlers, initializes PostgreSQL, checks
  and applies migrations, checks media tools, starts ranking updates and file
  cleanup, and handles graceful shutdown.
- `bot.js` constructs the Grammy bot and configures API throttling and automatic
  retries.
- `handlers/pixiv/` owns Pixiv requests, normalization, illustration caching and
  orchestration, URL generation, author and ranking retrieval, and ugoira
  conversion.
- `handlers/telegram/` owns input parsing, user settings, localization, formatting,
  keyboards, media groups, document and photo sending, and Telegraph publishing.
- `handlers/telegram/tg-sender.js` owns the state-oriented send workflow. Keep
  `app.js` limited to update routing and sender construction; do not move the
  workflow back into the bootstrap file.
- `handlers/telegram/settings-lifecycle.js` owns effective-setting resolution and
  authorized configuration commands. Pure precedence, flag, normalization, and
  sanitization rules live in `settings-resolver.js`; the `/s` grammar and flag
  registry live in `settings-command-parser.js`; Pixiv input parsing remains
  separate in `input-parser.js`.
- `handlers/telegram/input-parser.js` owns staged Pixiv/Phixiv URL and standalone
  ID extraction. Keep supported routes in its declarative matcher table rather
  than growing global replacement chains.
- `handlers/telegram/link-lifecycle.js` owns `/link` creation, management, and
  linked-message dispatch. Its PostgreSQL operations live in
  `chat-link-store.js`; do not return link state to generic settings updates.
- `handlers/common.js` contains shared download, concurrency, cache, logging, and
  memory-monitoring utilities.
- `db.js` is the PostgreSQL access layer. It exposes direct illustration APIs and
  MongoDB-shaped collection adapters still used by existing application code.
- `sql/schema.sql` is the complete schema for new installations.
  `sql/patches/` contains ordered incremental migrations.

The normal illustration path is: Telegram input -> Pixiv ID extraction -> cache or
PostgreSQL lookup -> Pixiv request -> normalization and URL construction ->
PostgreSQL update -> Telegram or Telegraph output.

## Setup and Commands

Use pnpm and a modern Node.js version that supports ES modules and package import
maps. The README documents Node.js greater than 15, but prefer a currently
supported Node.js release.

```bash
pnpm install
cp config_sample.js config.js
node initial.js
pnpm bot
pnpm test
```

- `node initial.js` creates the local media working directories.
- `pnpm bot` runs `app.js` with `WEBLESS=1` and is the reliable bot-only entry
  point.
- `pnpm all` runs `node app.js` and may attempt to load the currently missing
  `web.js` when web support is enabled.
- `pnpm web` currently targets a missing `web.js`; do not report it as working
  without restoring and validating that entry point.
- Production documentation uses PM2, but no PM2 ecosystem file, container file,
  CI workflow, or systemd unit is tracked in this repository.

Ugoira conversion requires `ffmpeg`, `mp4fpsmod`, and `unzip`. Startup checks for
these programs unless `DEPENDIONLESS=1` or development mode is enabled. Do not use
dependency-bypass modes as production validation.

## Configuration and Secrets

Create the ignored `config.js` from `config_sample.js`. Never commit or print real
PostgreSQL credentials, Pixiv cookies or CSRF values, Telegram bot tokens,
Telegraph tokens, salts, or private API endpoints.

Configuration may also be overridden by environment variables in
`handlers/utils/config-validator.js`. Relevant runtime flags include:

- `DBLESS=1`: use dummy database collections; this is not a production mode.
- `AUTO_APPLY_PATCHES=0`: refuse startup when automatic patches are pending.
- `WEBLESS=1`: do not start the optional web entry point.
- `TELEGRAM_API_SERVER`: use a custom Telegram Bot API root.
- `DEPENDIONLESS=1`: skip external media-tool checks.
- `dev=1`: enable development logging and skip dependency checks.

Verify configuration behavior from the current source before changing it. The
repository is in an incomplete PostgreSQL migration state:

- Runtime database initialization uses PostgreSQL, while validation still
  requires legacy MongoDB configuration.
- `config_sample.js` has no `web` object, although `app.js` reads
  `config.web.enabled` after startup.
- `config.js` is intentionally untracked, but `db.js` imports it at module load
  time. A checkout without local configuration cannot currently start the AVA
  database tests.

Do not hide these mismatches with new fallbacks. Fix the owning contract and
remove superseded behavior when working in this area.

## PostgreSQL and Migration Rules

- Treat PostgreSQL as the canonical runtime data store.
- Keep `sql/schema.sql`, test schemas, fixtures, migration patches, and runtime
  queries consistent.
- Name patches `patch-NNN-description.sql`. Include `-manually` in the filename
  for destructive operations, breaking schema changes, large data rewrites, or
  work requiring downtime or operator review.
- Make patches transactional and idempotent where PostgreSQL permits it. The
  startup runner owns the transaction for automatic patches, so their SQL files
  must not contain `BEGIN`, `COMMIT`, or `ROLLBACK`; manual patches own their
  explicit operator-reviewed transaction. Add English comments explaining the
  reason and operational impact.
- Test migrations against a representative development database and take a
  verified backup before production application.
- Normal patches are applied at startup by `db-migration-check.js` unless
  `AUTO_APPLY_PATCHES=0`. Any pending filename containing `manually` blocks
  startup until an operator applies it.
- Review the size and lock impact of every automatic patch. The existing random
  value patch performs a whole-table update and is not evidence that other large
  updates are safe to auto-apply.
- `mongodb2pg.js` is a one-time migration tool. Its force mode can drop and
  recreate PostgreSQL tables; never run it against an unverified target or while
  the bot is writing data.
- `mongodb-update.js`, MongoDB configuration, and MongoDB-shaped adapters are
  migration residue. Do not extend them or add dual-read or dual-write paths
  without a concrete external compatibility requirement. A migration or refactor
  is complete only when the obsolete path, fixtures, tests, dependencies, and
  documentation are removed together.

## Media and Local Storage

Media work is performed under the ignored `tmp/` tree:

- `tmp/file/`, `tmp/ugoira/`, and `tmp/timecode/` are temporary working data and
  are periodically age-cleaned by the running application.
- `tmp/mp4_0/` is an intermediate conversion location.
- `tmp/mp4/` stores converted ugoira MP4 files and is deliberately preserved.
- Palette and GIF outputs may also persist.

Do not treat all of `tmp/` as disposable during maintenance. Preserve cached MP4
outputs unless the requested operation explicitly includes their removal. Avoid
adding generated files, package stores, database dumps, or alternate build roots
inside the repository. Any new cleanup behavior needs bounded ownership and tests
that distinguish temporary inputs from retained outputs.

## Localization and User-Facing Behavior

User-visible strings are defined in:

- `lang/en.js`
- `lang/ja.js`
- `lang/zh-hans.js`
- `lang/zh-hant.js`

Keep all four language files synchronized when adding, removing, or changing a
message key. English is the fallback language. Check formatting and Markdown
escaping in the actual Telegram path, including private chats, groups, channels,
callbacks, inline queries, media groups, and error recovery where affected.

Do not replace specific Pixiv, Telegram, conversion, or database failures with a
generic message when a safe reason can be shown. User-facing failures should say
what failed, why, and what the user can do next. Avoid duplicate sends while a
request is pending and keep retry or recovery actions next to the failure.

## Testing and Validation

`pnpm test` runs AVA. The current test suite primarily validates PostgreSQL CRUD
and reconstruction through `pg-mem`; it does not prove bot startup, migrations,
Pixiv or Telegram API behavior, ugoira conversion, scheduling, localization, or
deployment.

For every change:

1. Run the narrowest relevant tests, then `pnpm test` when the local ignored
   configuration needed by the test process is available.
2. If the suite cannot start because `config.js` is absent, report that as a
   blocked check. Do not create or commit fake credentials merely to obtain a
   green result.
3. Validate `sql/schema.sql`, patch application, and a real PostgreSQL boundary
   for database or migration changes; `pg-mem` alone is insufficient.
4. Exercise the real Telegram update type and Pixiv content type affected by
   handler changes. Include ugoira, multi-page media, inline mode, channels, or
   Telegraph only when those paths are in scope.
5. For media changes, validate the actual external command, output file, Telegram
   upload or URL path, cleanup behavior, and failure handling.
6. For scheduler, deployment, or startup changes, verify process lifecycle,
   shutdown, database closure, observable logs, and the deployed runtime
   separately from unit tests.

Never describe a skipped, dependency-blocked, credential-blocked, mocked, or
locally undeployed check as a pass.

## Code Organization and Change Discipline

- Preserve unrelated staged, unstaged, and untracked user work.
- Do not trust stale migration summaries over current source, schema, package
  scripts, and runtime behavior. The README still contains MongoDB-era setup and
  claims the wrapper layer was removed even though adapters remain.
- Avoid expanding monoliths. `db.js` already exceeds 1,000 lines, and `app.js`
  was reduced by extracting the sender workflow; continue extracting coherent
  startup, routing, persistence, or compatibility responsibilities instead of
  adding large new sections. No file may exceed 2,000 lines.
- Use parameterized SQL and preserve the field allowlists and prototype-pollution
  protections at user-setting boundaries.
- Keep retries, rate limits, request queues, Telegram auto-retry, and graceful
  shutdown semantics intact unless the task explicitly changes them.
- Do not introduce silent compatibility tails. When replacing a path, remove the
  old branch, resolver, fallback, fixture, test, dependency, and documentation in
  the same change unless a named external dependency requires a time-bounded
  compatibility boundary.
- Update documentation when commands, configuration, schema, deployment, or
  observable bot behavior changes.
