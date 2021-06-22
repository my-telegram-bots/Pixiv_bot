# Pixiv_bot
Link: https://t.me/Pixiv_bot

Document: https://pixiv-bot.pages.dev

## requirement

- Node.js > 15
- ffmpeg
- mp4fpsmod
## install (ArchLinux)
    sudo pacman -S yarn pm2 ffmpeg unzip
    yay -S mongodb-bin mp4fpsmod
    git clone https://github.com/my-telegram-bots/Pixiv_bot.git
    sudo systemctl enable pm2 mongodb --now
    cp config_sample.json config.json
    # edit
    # vim config.json
    # nano config.json
    node initial.js # first run
    pm2 start --name pixiv_bot app.js
    pm2 save
    sudo pm2 startup
## upgrade
version 2.0.2 edit the illust collection in local database, you need exec the following command.

    node update update_db_2021_june


## config
### cookie
To access R18(guro) contents and subscribe the author, You must fill the cookie field.  
You can login via your browser and open developer tools to select network tab and get the cookie you logined.  
## ua
get lastest chrome useragent: https://t.me/chrome_useragent
## pximgproxy
i.pximg.net proxy, telegraph and send file maybe use it
#### token
https://t.me/botfather
#### master_id
Report error and no management function
#### access_token
`access_token` is telegraph token can help you create telegra.ph pages.  
see more https://telegra.ph

## translate (i18n)
    1. clone project
    2. copy lang/en.json -> lang/_lang_code_.json
    3. create pull request

## todolist
    1. subscribe (0%)
    2. error handle (50%)
    3. web version (0%)
    4. bookmarks (1%)
    5. Group / Channel support
    6. Download author's all illusts
    7. clean the code (with code style and comment)
# License
MIT


Made with ❤️