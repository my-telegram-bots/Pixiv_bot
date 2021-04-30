---
title: Guide
--- 
<!-- translate by deepl -->
# Pixiv bot
A telegram bot that helps you send pixiv illust on telegeam.  
[link](https://t.me/pixiv_bot)  

The following Pixiv links are currently supported:
- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illustr_id=:id
- :id
## Simple usage
### message mode
Simply send pixiv's link to bot  
Support multiple links in one message, just send all to me!

### inline mode
bot supports telegram's inline usage, click the share button or `@pixiv_bot` in the chat.  
At the moment, inline only has the function of daily illusts and id, there is no search function yet.

## Advanced Usage
The bot supports some custom usage, here is the usage introduction.

### Include work tags +tags
Just type `+tags` in the message to show the tags of the work  
> Due to telegram's limitation, the tag will not become a clickable link when it encounters some special characters (e.g. "()").  

### Remove share button -share
Type `-share` in the message to remove the share button, which means that only the open button remains.

### Remove keyboard and caqption -rm

Type `-rm` in the message and the whole button and caption are gone.  

`-rmc` only caption is gone.  

`-rmk` only keyboard is gone.   

### Send work using file +file

Type `+file` in the message and the bot will send the source file directly to you.  
> good for collection of original images (right-click on web page to download is even faster?)

### Integrate multiple illusts into one media group (album) +album

Type `+album` in the message, the bot will integrate multiple entries into mediagroup.  
> but telegram has a limit of 10 images per mediagroup

### Convert multiple illusts to telegraph +graph +telegraph

Type `+graph` or `+telegraph` in the message and the bot will integrate multiple illusts into telegraph.ph and bot will send a telegra.ph link for a quick preview on your mobile devices and macOS client.

> If there are too many illusts, telegram may not show instant preview, it is recommended to have less than 200 graphs at a time. 
