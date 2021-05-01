# Pixiv_bot
Link: https://t.me/Pixiv_bot

Document: https://pixiv-bot.pages.dev


## translate 
    1. clone project
    2. copy lang/en.json -> lang/_lang_code_.json
    3. create pull request
## install (ArchLinux)
    pacman -S yarn pm2 ffmpeg unzip
    yay -S mongodb-bin mp4fpsmod
    git clone https://github.com/my-telegram-bots/Pixiv_bot.git
    systemctl enable pm2 mongodb --now
    cp config_sample.json config.json
    # edit
    # vim config.json
    # nano config.json
    pm2 start --name pixiv_bot app.js
    pm2 save
    pm2 startup
## config
### pixiv
### cookie
To access R18(g) contents and subscribe author, You must fill the config.json->pixiv->cookie.  
You can login via your browser and open developer tools to select network tab and get the cookie you logined.  
## ua
get lastest chrome useragent: https://t.me/chrome_useragent
## pximgproxy
i.pximg.net proxy

### tg
#### token
@botfather
#### master_id
Report error and manage bot
#### access_token
`access_token` is telegraph token you can create it manually  
see more https://telegra.ph
## todolist
    1. subscribe (0%)
    2. custom format (66%)
    3. error handle (10%)
    4. web version (0%)
    5. bookmarks (1%)
# License
MIT


Made with ❤️