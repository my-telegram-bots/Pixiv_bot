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
    pm2 start --name pixiv_bot app.js
    pm2 save
    pm2 startup
## todolist
    1. subscribe
    2. inline query daily rank
    3. custom format
    4. error handle
    5. web version
## License
    MIT