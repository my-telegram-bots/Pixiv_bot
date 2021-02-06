# Pixiv_bot
Link: https://t.me/Pixiv_bot

# install (ArchLinux)
    
    pacman -S yarn pm2 ffmpeg
    yay -S mongodb-bin mp4fpsmod
    git clone https://github.com/my-telegram-bots/Pixiv_bot.git
    systemctl enable pm2 mongodb --now
    cp config_sample.json config.json
    # edit
    # vim config.json
    pm2 start --name pixiv_bot app.js