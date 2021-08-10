---
title: 指南
pageClass: guide
---
# Pixiv bot
一個 Telegram 機器人，可以幫助您在 Telegram 發送來自 pixiv 的作品。  
[點我開始體驗](tg://resolve?domain=pixiv_bot&start=67953985) | [把 bot 添加至群組](tg://resolve?domain=Pixiv_bot&startgroup=s)  

 
![r_1](../img/r_1.jpg)  


當匹配到以下 Pixiv 連結後 bot 會回復。
- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illust_id=:id
- pixiv.net/member_illust.php?illust_id=:id#manga
- :id （就是純數字）
## 簡單用法
### 普通消息模式
僅需發送 pixiv 的連結給 bot 即可  
支持一個消息裡面包含多個連結，無腦地全部發送給我就行！

### inline 模式
bot 支持 Telegram 的 inline 用法，點擊 share 按鈕或者在聊天窗口 [@Pixiv_bot](https://t.me/Pixiv_bot) 即可體驗～  
目前 inline 只有每日榜圖以及查找 id 的功能，暫時還沒有直接搜索作品功能

> 這個需要填坑！(會員帳號才能有熱門排序 暫時擱置了)

## 進階用法
機器人支持一些自訂用法，下面是用法介紹。  
簡單地來說，自訂用法就是在發送作品的時候再多打幾個字傳參數，例如我想在回復裡面顯示作品的標籤，那麼輸入 `+tag` 就會顯示了  
如果不想要打開(open)按鈕，那麼我輸入 `-open` 打開按鈕就消失了
### 持久化保存配置
（本來是應該做成網頁版的，不過網頁版還沒補坑）  
使用 `/s` 後面接配置
例如:
```
/s +tags -share
```
那麼後面 bot 就會默認以 `+tags` `-share` 配置輸出作品  

#### 在群組中優先使用群組自訂結果 +overwrite
```
/s +overwrite
```
即可覆蓋個人自訂結果（群組用）

如果在群組裡面還是想輸出自己格式的連結，那麼每次發送的時候帶上 `+god` 即可。
### 包含作品標籤 +tags
僅需在消息中輸入 `+tag` / `+tags` 即可顯示作品的標籤  
> 由於 Telegram 的限制，作品標籤在遇到一些特殊字元的時候（比如 《》（） - ・ ）是不會成可以點擊的連結的，這個表示我沒有辦法解決。   

### 倒序輸出作品 +desc
輸出的作品會和輸入連結順序相反（多p不影響）  
例子:  
輸入:  
- illust 1 link
- illust 2 link

返回:  
- illust 2's image 1
- illust 1's image 1
- illust 1's image 2

### 按需顯示系列 -open -share -kb -cp -rm
一張圖概括：
![r_2](../img/r_2.jpg)  
說明：  
- `-open` 不顯示 open 按鈕
- `-share` 不顯示 share 按鈕
- `-kb` open 和 share 按鈕都不顯示
> kb = keyboard
- `-cp` 不顯示圖片中的文本內容
- `-rm` 只顯示圖片

設置成默認設置了（/s -open ...) 後仍然可以在作品後面手動加上 `+open` 之類的來顯示對應的內容
### 使用文件形式發送作品 +file

輸入 `+file` ，機器人就會直接發送源文件給你。  
> 以及 `/s +file` 那麼就發送給機器人的作品每次都是直接發送文件給你
> 適合收藏原圖的小伙伴（網頁右鍵下載還更快？）

### 將多個作品集成到一個媒體組（相冊）裡面 +album （預設啟用）

在消息中輸入 `+album` 機器人就會將多個作品集成到一個媒體組中  
如果需要關閉這個功能 一個 id 發送一次 那麼輸入 `-album` 即可  
> `-album` 開啟後發圖順序可能有點變化，並且多p作品還是會在媒體組裡面  
> 另外 Telegram 有限制 一個媒體組最多只能有 10 張圖，所以還是會分p發送

### 將多個作品使用 telegraph 顯示 +graph +telegraph

在消息中輸入 `+graph` / `+telegraph` 機器人就會將多個作品集成到一個 telegraph 中，並且返回一個 telegraph 連結，手機可以快速預覽。

> 圖太多的話 Telegram 可能不會出現 IV 即時預覽的，建議一次低於 200 張。  
~~太多了我伺服器也許會當機 qaq~~
#### 在 telegraph 連結中自訂標題、作者名字以及作者連結
例子：

```
https://www.pixiv.net/artworks/91105889 +telegraph
title=白スクのやつ
author_name=syokuyou-mogura
author_url=https://www.pixiv.net/users/579672
```
格式，=號後面的內容全部都會被匹配到，以換行作為分割

![telegraph custom](../img/telegraph-1.jpg)  


