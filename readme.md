# Pixiv_bot
Link: https://t.me/Pixiv_bot

Document: https://pixiv-bot.pages.dev

(no stable build, only have master branch)
## requirement

- Node.js > 15
- ffmpeg
- mp4fpsmod
## install (ArchLinux)
    sudo pacman -S pnpm pm2 ffmpeg unzip
    yay -S mongodb-bin mp4fpsmod
    git clone https://github.com/my-telegram-bots/Pixiv_bot.git
    sudo systemctl enable pm2 mongodb --now
    cd Pixiv_bot
    pnpm i
    cp config_sample.js config.js
    # edit
    # vim config.js
    # nano config.js
    node initial.js # first run
    pm2 start --name pixiv_bot app.js
    pm2 save
    sudo pm2 startup
## Breaking Changes

### Version 2.1.0 (February 2025) - PostgreSQL Migration ⚠️ BREAKING

**Major database migration from MongoDB to PostgreSQL.**

⚠️ **This is a breaking change that requires manual migration.**

**What's Changed:**
- Database backend changed from MongoDB to PostgreSQL
- Removed MongoDB wrapper layer, using direct SQL for better performance
- New direct SQL API: `getIllust()`, `updateIllust()`
- SQL injection prevention with parameterized queries
- N+1 query optimization (40+ queries → 1 aggregated query)
- Fast random sampling with indexed random_value column
- Performance indexes for 2.2M+ dataset

**Migration Steps:**

1. **Install PostgreSQL** (if not already installed):
   ```bash
   # ArchLinux
   sudo pacman -S postgresql
   sudo -u postgres initdb -D /var/lib/postgres/data
   sudo systemctl enable postgresql --now

   # Create database
   sudo -u postgres createdb pixiv_bot
   ```

2. **Update config.js** - Add PostgreSQL configuration:
   ```javascript
   postgres: {
       uri: "postgresql://user:password@localhost:5432/pixiv_bot"
   }
   ```

3. **Run migration** (if upgrading from MongoDB):
   ```bash
   # Export MongoDB data
   node mongodb2pg.js

   # Or start fresh with PostgreSQL
   psql pixiv_bot < sql/schema.sql
   ```

4. **Restart bot**:
   ```bash
   pm2 restart pixiv_bot
   ```

**Environment Variables:**
- `AUTO_APPLY_PATCHES=0` - Disable auto-apply schema patches (default: enabled)
- `DBLESS=1` - Run without database (testing mode)

**Automatic Migration Check:**

The bot will automatically check for pending schema patches on startup:
- ✓ Normal patches → **Applied automatically** on startup (disable with `AUTO_APPLY_PATCHES=0`)
- ⚠ Dangerous patches (filename contains `manually`) → **Bot refuses to start** until manually applied
  - Example: `patch-002-drop-table-manually.sql`
- See [sql/README.md](sql/README.md) for patch guidelines

**See detailed migration guide:** [docs/POSTGRES-MIGRATION.md](docs/POSTGRES-MIGRATION.md)

---

## Upgrade History

> **Note:** Commands below are for MongoDB → PostgreSQL migration only.
> If you're on PostgreSQL (v2.1.0+), these are no longer needed.

### version 2.0.2 edit the illust collection in local database

    node mongodb-update update_db_2021_june

Version 2.0.3 has changed the file storage directory

    node mongodb-update move_ugoira_folder_and_index_2022_nov

Version 2.0.4 remove hard hostname `i-cf.pximg.net` and prefix will auto generate by handle_pximg_url function

    node mongodb-update set_imgs_without_i_cf_2023_may

Version 2.0.4 user settings' `album` migrate to `album_one`

    node mongodb-update override_user_setting_album_2024_may

and changed ugoira url in config.json (without /mp4/), you need modify the config.json.

Version 2.0.5 user format's version update to v2, v1(legacy) will still working at this time

    node mongodb-update update_user_format_format_2025_april

Version 2.0.6 (January 2025) removed deprecated fields from database to improve performance

    node mongodb-update remove_fsize_field_2025_january
    node mongodb-update remove_storage_endpoint_2025_january

Version 2.0.6 (February 2026) added tags index for faster inline search and fixed ugoira type mismatch bug

    node mongodb-update create_tags_index_2026_february
    node mongodb-update fix_ugoira_type_mismatch_2026_february

## config
### cookie
To subscribe author and popular search.  
You can login via your browser and open developer tools to select network tab and get the cookie you logined.  
## ua
get lastest chrome useragent: https://t.me/chrome_useragent
## pximgproxy
i.pximg.net proxy, telegraph and send ugoira maybe use it
#### token
https://t.me/botfather
#### master_id
Report error and no management function
#### access_token
`access_token` is telegraph token can help you create telegra.ph pages.  
see more https://telegra.ph
#### refetch_api
When bot recive a error message, it will try to send image link to refetch api.  
See my another repo: [makeding/WebpageBot-api](https://github.com/makeding/WebpageBot-api)
## translate (i18n)
    1. clone project
    2. copy lang/en.js -> lang/_lang_code_.js
    3. create pull request

## todolist
- cache control (./tmp) to instead of cleanner.sh
- subscribe (10%)
- error handle (50%)
- web version (5%)
- bookmarks (1%)
- channel support (link chat to channel) (30%)
- download author's all illusts (alpha OK)
- clean the code (with code style and comment)
- safe exit (wait ugoira_to_mp4 & download_file & tg and safe exit)
- unit test (ava.... jest...)
- ~~to Typescript~~
- Telegraph edit
# License
MIT


Made with ❤️