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
## upgrade
version 2.0.2 edit the illust collection in local database, you need exec the following command.

    node update update_db_2021_june

Version 2.0.3 has changed the file storage directory, you need exec the following command.

    node update move_ugoira_folder_and_index_2022_nov
Version 2.0.4 remove hard hostname `i-cf.pximg.net` and prefix will auto generate by handle_pximg_url function

    node update set_imgs_without_i_cf_2023_may

Version 2.0.4 user settings' `album` mirgate to `album_one`

    node update override_user_setting_album_2024_may

Version 2.0.5 user format's version update to v2, v1(legacy) will still working at this time

    node update update_user_format_format_2025_april
    
and changed ugoira url in config.json (without /mp4/), you need modify the config.json.
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