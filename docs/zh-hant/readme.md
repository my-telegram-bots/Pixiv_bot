---
title: 指南
---
<!-- translate by zhconvert.org -->
# Pixiv bot
一個 telegram 機器人，可以幫助您在 telegram 發送來自 pixiv 的作品。  
[點我開始體驗](tg://resolve?domain=pixiv_bot&start=67953985)  


目前支持匹配以下 Pixiv 連結，一般來說只有下面的連結會被匹配 識別到
- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illust_id=:id
- :id （就是純數字）
## 簡單用法
### 普通消息模式
僅需發送 pixiv 的連結給 bot 即可  
支持一個消息裡面包含多個連結，無腦地全部發送給我就行！

### inline 模式
bot 支持 telegram 的 inline 用法，點擊 share 按鈕或者在聊天窗口 `@Pixiv_bot` 即可體驗～  
目前 inline 只有每日榜圖以及查找id的功能，暫時還沒有直接搜索作品功能

> 這個需要填坑！

## 進階用法
機器人支持一些自訂用法，下面是用法介紹。

### 包含作品標籤 +tags
僅需在消息中輸入 `+tags` 即可顯示作品的標籤  
> 由於 telegram 的限制，作品標籤在遇到一些特殊字元的時候（比如 《》（））是不會成可以點擊的連結的，這個表示我沒有辦法解決。  

### 刪除分享按鈕 -share
在消息中輸入 `-share` 即可刪除分享按鈕，也就是只剩下 open 打開的按鈕了。

### 刪除按鈕和簡介 -rm

在消息中輸入 `-rm` 整個按鈕和簡介就不見了～

輸入 `-rmc` 簡介就不見了～

輸入 `-rmk` 整個按鈕就不見了～

### 使用文件發送作品 +file

在消息中輸入 `+file` ，機器人就會直接發送源文件給你。  
> 適合收藏原圖的小伙伴（網頁右鍵下載還更快？）

### 多個作品集成到一個媒體組（相冊）裡面 +album

在消息中輸入 `+album` 機器人就會將多個作品集成到一個媒體組中  
> 不過 telegram 有限制 一個媒體組最多只能有 10 張圖

### 將多個作品使用 telegraph 顯示 +graph +telegraph

在消息中輸入 `+graph` 或者 `+telegraph` 機器人就會將多個作品集成到一個 telegraph 中，並且返回一個 telegraph 連結，手機可以快速預覽。

> 圖太多的話 telegram 可能不會出現 IV 即時預覽的，建議一次低於 200 張。  
~~圖太多了我馬鈴薯伺服器也許會當機~~
