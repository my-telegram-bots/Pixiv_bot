# Pixiv_bot
Link: https://t.me/Pixiv_bot

[archived version](https://github.com/my-telegram-bots/Pixiv_bot_archived)
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
## config
To access R18(g) contents, You must fill the config.json->pixiv->cookie.  
You can login via your browser and open developer tools to select network tab and get the cookie your logined.
## todolist
    1. subscribe
    2. custom format
    3. error handle
    4. web version
    5. R18 alert
    6. bookmarks
# License
MIT


Made with ❤️