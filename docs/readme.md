---
title: Guide
pageClass: guide
--- 
<!-- translate by deepl -->
# Pixiv bot
A Telegram bot that helps you send pixiv illust on telegeam.  
[Get started!](tg://resolve?domain=pixiv_bot&start=67953985)  


! [r_1](... /img/r_1.jpg)  


The following Pixiv links are currently supported:
- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illustr_id=:id
- pixiv.net/member_illust.php?illustr_id=:id#manga
- :id
## Simple usage
### message mode
Just send pixiv link to bot  
Supports multiple links in one message, just send them all to me!

### inline mode
bot supports Telegram's inline mode, click the share button or `@Pixiv_bot` in the chat to experience it.  
At the moment, inline only has the function of daily ranking and illust id, there is no search function yet.


## Advanced usage
The bot supports some custom usage, which are described below.  

For example, if I want to show the tag in the reply, then type `+tag` and it will be shown.  
If I don't want the open button, then I type `-open` and the open button disappears

### Include work tags +tags
Just type `+tag` / `+tags` in the message to show the tags of the work  
> Due to Telegram's limitation, the tag does not become a clickable link when it encounters some special characters (e.g. `() - ・), which I can't fix.   

### Delete button -open -share -kb
Type `-open` in the message to remove the open button, which means that only share is left  
Type `-share` in the message to remove the share button  
Type `-kb` in the message to remove all two buttons  

> kb = keyboard

### Delete buttons and profile -rm

Type `-rm` in the message and the bot will only reply to the image without anything

### Send work using file +file

Type `+file` in the message and the bot will send the source file directly for you.  

### Integrate multiple artworks into one media group (album) +album (enabled by default)

Enter `+album` in the message and the bot will integrate multiple illusts into one media group  
If you want to disable this feature and send an id once, then enter `-album` and it will work.
> However, Telegram has a limit of 10 images per media group

### Show multiple illusts using telegraph +graph +telegraph

By typing `+graph` / `+telegraph` in the message the bot will integrate multiple illusts into one telegraph and return a telegraph link for a instant preview on your Telegram Mobile / macOS / Unigram App.

> If there are too many illusts, Telegram may not show the instant preview, so it is recommended to have less than 200 graphs at a time.  
~~Too many may bring down my potato server qaq~~