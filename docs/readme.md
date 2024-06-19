---
title: Guide
pageClass: guide
---
# Pixiv bot
A Telegram bot that helps you send illustrations from Pixiv on Telegram.
[Click here to start](tg://resolve?domain=pixiv_bot&start=67953985) | [Add bot to group](tg://resolve?domain=Pixiv_bot&startgroup=s)

![r_1](../img/r_1.jpg)

The bot will reply when it matches the following Pixiv link.
- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illust_id=:id
- pixiv.net/member_illust.php?illust_id=:id#manga
- :id (just numbers)

## Simple usage
### Normal message mode
Just send the pixiv link to bot
Supports multiple links in one message, just send them all to bot!

### Inline mode
Bot supports Telegram inline , click the share button or [@Pixiv_bot](https://t.me/Pixiv_bot) in the chat window to experience it.
Currently, inline only has a daily chart and id search function, but not a direct search function.

> This needs to be filled in! (Only member accounts can have popularity sorting, but it's on hold for now.)

## Advanced Usage
The bot supports some customisation, here are the instructions.
Simply put, a custom configuration is to type a few more words to pass parameters when sending a work, for example, if I want to show the tag of the work in the reply, then type `+tag` and it will be shown.
If you don't want the open button, type `-open` and the open button disappears.

### Persistently save configuration
(Originally it should be made into a web version, but the web version has not been patched yet)
Use `/s` followed by configuration
For example:
```
/s +tags -share
```
Then the bot will output works in the format of `+tags` `-share` by default
After setting it to custom configuration (such as /s -open -kb ...), you can still manually add `+open` `+kb` after the link / id to display the corresponding content

#### Give priority to group custom results in groups +overwrite
```
/s +overwrite
```
You can overwrite your own customized results (for groups)

If you want to output a message in your own format in a group at one time, you can bring `+god` every time you send it
> For persistent configuration, please use `/s -overwrite`
> instead of `/s +god`!

### Display series on demand
One picture summary:
![r_2](../img/r_2.jpg)
Description:
- `open` controls whether to display the open button
- `share` controls whether to display the share button
- `kb` controls both the open and share buttons
> kb = keyboard
- `cp` `rm` controls whether to add a description of the image
> `+sc` adds a description to the first image only for multiple images
- `+above` show_caption_above_media
For example:
- `+open -share` displays the open button but not the share button

### Support reading links in caption +caption
`+caption` bot can read Pixiv work links in the message caption

### Include work tags +tags
Just enter `+tag` / `+tags` in the message to display the tags of the work
> Due to the limitations of Telegram, the work tags will not be displayed when encountering some special characters (such as 《》() - ・) will not be recognized as a clickable link, and I have no way to solve this.

### Add a mask to the image +sp
Type `+sp` and the bot will add a spoiler effect to the sent image
> Due to Telegram issues, it still cannot be used inline

### Send the work in the form of a file +file
Type `+file` and the bot will directly send the original image file to you.
> and `/s +file`, then the bot will directly send the original image file to you every time
> Suitable for friends who collect original images (right-click on the web page to download is faster?)

Enter `+af` `+appendf`, the bot will send the original image file to you after sending the image
> It also supports persistent configuration

### Output works in reverse order +desc
The output works will be in the opposite order of the input links (multiple p will not be affected)
For example:
Input:
- illust 1 link
- illust 2 link

Return:
- illust 2's image 1
- illust 1's image 1
- illust 1's image 2

### Integrate multiple works into one media group (album) +album / +one (enabled by default)
Enter `+album` / `+one` in the message, and the robot will integrate multiple works into one mediagroup
If you need to turn off this function and send one id once, then enter `-album`
> After `-album`, the order of sending pictures may change a bit, and multi-page works will still be in the media group

In addition, Telegram has a limit that a mediagroup can only have a maximum of 10 pictures, so they will still be sent in pieces

> `+equal` When the bot sends more than 10 pictures at a time, it will try to balance the number in the mediagroup. For example, if there are 16 pictures, it will be sent in 2 times, 8 pictures each time

### Display multiple works using telegraph +graph +telegraph
Enter `+graph` / `+telegraph` in the message, and the bot will integrate multiple works into a telegraph and return a telegraph link, which can be quickly previewed on the phone.

> If there are too many pictures, Telegram may not show the instant preview of the message. It is recommended to be less than 200 pictures at a time.
~~Too many, my Tudou server might crash qaq~~

#### Customize the title, author name and author link in the telegraph link
For example:

```
https://www.pixiv.net/artworks/91105889 +telegraph
title=白スクのやつ
author_name=syokuyou-mogura
author_url=https://www.pixiv.net/users/579672
```
Format, all the content after the = sign will be matched, and the line break is used as the separator

![telegraph custom](../img/telegraph-1.jpg)
