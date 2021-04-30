---
title: 指南
---
# Pixiv bot
一个 telegram 机器人，可以帮助您在 telegram 发送来自 pixiv 的作品。  
[link](https://t.me/pixiv_bot)  

目前支持匹配以下 Pixiv 链接，一般来说只有下面的链接会被匹配 识别到
- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illust_id=:id
- :id （就是纯数字）
## 简单用法
### 普通消息模式
仅需发送 pixiv 的链接给 bot 即可  
支持一个消息里面包含多个链接，无脑地全部发送给我就行！

### inline 模式
bot 支持 telegram 的 inline 用法，点击 share 按钮或者在聊天窗口 `@pixiv_bot` 即可体验～  
目前 inline 只有每日榜图以及查找id的功能，暂时还没有直接搜索作品功能

> 这个需要填坑！

## 进阶用法
机器人支持一些自定义用法，下面是用法介绍。

### 包含作品标签 +tags
仅需在消息中输入 `+tags` 即可显示作品的标签  
> 由于 telegram 的限制，作品标签在遇到一些特殊字符的时候（比如 《》（））是不会成可以点击的链接的，这个表示我没有办法解决。  

### 删除分享按钮 -share
在消息中输入 `-share` 即可删除分享按钮，也就是只剩下 open 打开的按钮了。

### 删除按钮和简介 -rm

在消息中输入 `-rm` 整个按钮和简介就不见了～

输入 `-rmc` 简介就不见了～

输入 `-rmk` 整个按钮就不见了～
### 使用文件发送作品 +file

在消息中输入 `+file` ，机器人就会直接发送源文件给你。  
> 适合收藏原图的小伙伴（网页右键下载还更快？）

### 多个作品集成到一个媒体组（相册）里面 +album

在消息中输入 `+album` 机器人就会将多个作品集成到一个媒体组中  
> 不过 telegram 有限制 一个媒体组最多只能有 10 张图

### 将多个作品使用 telegraph 显示 +graph +telegraph

在消息中输入 `+graph` 或者 `+telegraph` 机器人就会将多个作品集成到一个 telegraph 中，并且返回一个 telegraph 链接，手机可以快速预览。

> 图太多的话 telegram 可能不会出现 IV 即时预览的，建议一次低于 200 张。  
~~太多了我土豆服务器也许会宕机 qaq~~
