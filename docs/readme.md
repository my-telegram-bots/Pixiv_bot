---
title: Guide
pageClass: guide
---
# Pixiv bot
A Telegram bot that helps you send entries from Pixiv in Telegram.  
[Click me to start experience](tg://resolve?domain=pixiv_bot&start=67953985) | [Add bot to group](tg://resolve?domain=Pixiv_bot&startgroup=s)  

 
! [r_1](. /img/r_1.jpg)  


The bot will reply when it matches the following Pixiv link.
- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illust_id=:id
- pixiv.net/member_illust.php?illust_id=:id#manga
- :id (that's just plain numbers)

## Simple usage
### Normal message mode
Simply send a pixiv link to bot.  
Support multiple links in one message, just send them all to bot!

### inline mode
bot supports Telegram inline, click the share button or [@Pixiv_bot](https://t.me/Pixiv_bot) in the chat window to experience it.  
Currently, inline only has a daily chart and id search function, but not a direct search function.

> This needs to be filled in! (Only member accounts can have popularity sorting, but it's on hold for now.)

## Advanced Usage
The bot supports some custom configurations.
Simply put, customizing the configuration is to type a few more words to pass the parameters when sending the work, for example, if I want to show the tag of the work in the reply, then type `+tag` and it will be shown.
If you don't want the open button, type `-open` and the open button disappears.

### Persistent save configuration
(This was supposed to be a web version, but the web version hasn't been patched yet)
Use `/s` followed by the configuration
For example:  
``
/s +tags -share
```
Then the bot will default to `+tags` `-share`.
Set it to a custom configuration (e.g. /s -open -kb ...) After that, you can still manually add `+open` `+kb` etc. to the link / id to display the corresponding content.

#### Preferred group customization results in groups +overwrite
```
/s +overwrite
```
This overrides the individual customized results (for groups).

If you want to output your own formatted message in a group, send it with `+god` every time.
> For persistent configurations, use `/s -overwrite`
> instead of `/s +god`!

### Show series on demand
In a nutshell.  
! [r_2](... /img/r_2.jpg)  
Description:  
- `open` Controls whether the open button is displayed.
- `share` Controls whether the share button is displayed.
- `kb` Controls both the open and share buttons.
> kb = keyboard
- `cp` `rm` Controls whether to add a description to an image.
> `+sc` Add descriptions to multiple images, only the first one.
- `+above` show_caption_above_media
For example:  
- `+open -share` Show the open button but not the share button.

### Support for reading links in captions +caption
The `+caption` bot can read the link to the Pixiv work in the caption of a message.

### Include caption tags +tags
Just type `+tag` / `+tags` in the message to show the tags of the work.
> Due to Telegram's limitation, the tags will not be recognized as clickable links when encountering some special characters (e.g. "() - ・), I have no solution for this.

### Add a mask to an image +sp
Typing `+sp` bot adds a spoiler effect to the sent image.
> Inline still doesn't work due to Telegram issues.

### Send work as a file +file
Type `+file` and bot will send you the original file directly.
> and `/s +file` then bot will send you the original file every time.
> For those of you who have the original image in your collection (right-click on a web page to download it faster?).

Type `+af` `+appendf` and bot will send you the original file after sending the image.
> Also supports persistent configuration

### Output works in reverse order +desc
Output works will be in reverse order of the input links (multi-p does not affect)
For example:  
Input: illust 1 link  
- illust 1 link
- illust 2 link

Returns: illust 2's image 1  
- illust 2's image 1
- illust 1's image 1
- illust 1's image 2

### Integrate multiple creations into one media group (album) +album / +one (enabled by default)
Type `+album` / `+one` in the message and the bot will integrate multiple works into one mediagroup.  
If you want to disable this feature and send it once for each id, then type `-album`.
After > `-album` the order of posting may change a bit, and multiples will still be in the mediagroup.

Also Telegram has a limit of 10 images in a mediagroup, so it will still be sent in p's.
> `+equal` When bot sends more than 10 images at a time, it tries to equalize the number of images in the mediagroup, e.g. if there are 16 images, it will send 8 images in 2 batches.

### Use telegraph to display multiple entries +graph +telegraph
Type `+graph` / `+telegraph` in the message and the bot will integrate multiple works into a single telegraph and return a link to the telegraph, which can be quickly previewed by your phone.

> If you have too many telegraphs, Telegram may not show instant preview in messages, so it's recommended to have less than 200 telegraphs at a time.
It's recommended to have less than 200 telegraphs at a time. ~~If there are too many, my potato server might go down qaq~~!
#### Customize the title, author name and author link in the telegraph link
For example:  

```
https://www.pixiv.net/artworks/91105889 +telegraph
title=Shirakanoyatsu
author_name=syokuyou-mogura
author_url=https://www.pixiv.net/users/579672
```
format, everything after the = sign will be matched, separated by a new line

! [telegraph custom](... /img/telegraph-1.jpg)
