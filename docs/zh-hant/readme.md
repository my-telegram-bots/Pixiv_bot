---
title: 指南
pageClass: guide
---

# Pixiv bot

一個 Telegram 機器人，可以幫助您在 Telegram 發送來自 Pixiv 的作品。

[點我開始體驗](tg://resolve?domain=pixiv_bot&start=67953985) | [把 bot 添加至群組](tg://resolve?domain=Pixiv_bot&startgroup=s)

## 快速入門

### 普通消息模式

![message mode](../img/tourial-1-1.png)

當匹配到以下連結後 bot 會回覆您：  

- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illust_id=:id
- pixiv.net/member_illust.php?illust_id=:id#manga
- :id （純數字）

支持一個消息裡包含多個連結，一次性全部發送給 bot 就行！

### inline 模式

bot 支持 Telegram inline 用法，可在不切換到聊天頁面的時候使用 bot 發送作品。

點擊 share 按鈕或者在聊天窗口 [@pixiv_bot](https://t.me/Pixiv_bot)

> 您並不需要開頭大寫 `P`，只需要 `@pixiv_bot` 即可，使用者名稱是大小寫不敏感的。

![inline mode](../img/tourial-1-2.png)

此外，inline 模式目前有以下需要切換到普通消息模式的情況：

- 作品內包含多張圖（多 P）
- 使用 `+spoiler` 屬性
- 動圖（ugoira）尚未被轉檔


> 需要切換到普通模式的時候會有和圖片一樣的提示：  
> ![inline pm alert](../img/tourial-1-3.png)  
> 請按需求點擊切換到普通消息模式或者直接使用 inline 的結果。


> 此外，搜索功能暫未實現（需要 Pixiv Premium），因此擱置

## 進階用法

機器人支持一些自訂配置，下面是配置說明。

自訂配置十分簡單，您只需要在發送作品連結的同時輸入一些關鍵字：
例如 `+tags`，那麼輸出的作品格式將會帶上標籤。不想要 open 按鈕的時候，輸入 `-open` 按鈕就消失了：  
![demo](../img/tourial-2-1.png)

### `/s` 持久化保存配置

對於一些參數，比如說 `+tags` 您可能有持久化保存的需求，同樣和上面一樣非常簡單。
例如:

```
/s +tags -share
```

在提示成功保存後，默認機器人就會以 `+tags` `-share` 的配置來輸出作品。

此功能在群組也適用，並且有調整優先度的選項來讓群裡的格式統一，具體配置參考下個章節。

### `+overwrite` 在群組使用群組設置而非個人設定

您在群組/頻道中想讓群內的成員都使用統一格式的話，可以使用

```
/s +overwrite
```

來讓所有群成員都使用群組內配置

如果單次在群組內想輸出自己格式的消息，那麼每次發送的時候帶上 `+god` 即可

> +god 並沒有持久化配置，請在每次使用時加上

### 自訂消息格式
TODO （參考配置頁面）
## cheatsheet

| name        | alias                        | description                                        | remark                                                                                                       |
| ----------- | ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| -+tag       | tags                         | 顯示作品標籤                                       | 作品標籤在遇到一些特殊字元時（例如《》（） - ・），不會被識別為可點擊的連結                                  |
| -+desc      | description                  | 顯示作品描述                                       |                                                                                                              |
| +-id        | show_id                      | 顯示作品 ID                                        | 默認顯示格式中沒有%id%欄位，請通過自訂模板實現                                                               |
| -+rm        |                              | 只顯示圖片                                         | 不顯示按鈕和說明文字（caption）                                                                              |
| +-kb        | keyboard <br>remove_keyboard | 是否顯示按鈕                                       |                                                                                                              |
| +-cp        | remove_caption               | 是否顯示說明文字                                   |                                                                                                              |
| +-open      |                              | 是否顯示打開按鈕                                   |                                                                                                              |
| +-share     |                              | 是否顯示分享按鈕                                   | 在 inline 切換時會被強制啟用<br>在 channel 中會被強制禁用                                                    |
| -+sc        | single_caption               | 發送多張圖片時只顯示一個說明文字                   | 無法在 inline 模式使用                                                                                       |
| -+above     | caption_above                | 將說明文字顯示在圖片上方                           |                                                                                                              |
| -+reverse   |                              | 倒序發送作品                                       | 不會改變作品內分p的順序                                                                                      |
| -+file      | asfile                       | 以文件形式發送                                     | 無法在 inline 模式使用                                                                                       |
| -+af        | append_file                  | 在發送作品的基礎上再發送圖片                       | 無法在 inline 模式使用                                                                                       |
| -+graph     | telegraph                    | 解析成 Telegraph                                   | 無法在 inline 模式使用                                                                                       |
| +-album     |                              | 是否以 MediaGroup 形式發送作品                     | 無法在 inline 模式使用                                                                                       |
| -+one       | album_one                    | 是否以 MediaGroup 形式發送所有作品                 | 例如您發送了 2 個作品，bot 會將它們作為一個 MediaGroup 一起發送，而不是分開發送                              |
| -+equal     | album_equal                  | 嘗試以均分方式發送 MediaGroup 作品                 | 例如需要發送 14 張圖片時，系統會將其拆分成 7+7，而不是 10+4                                                  |
| -+sp        | spoiler                      | 將圖片標記為隱藏（敏感）內容                       | 無法在 inline 模式使用                                                                                       |
| -+caption   | caption_extraction           | 解析圖片說明文字並發送關聯作品                     | 特殊需求，默認情況下不需要                                                                                   |
| +-overwrite |                              | 在群組或頻道中覆蓋用戶的自訂設置                   | 無法在 inline 模式使用<br>使用 inline 模式在群裡發圖也不會觸發覆蓋行為（機器人無法知道用戶當前的群組是什麼） |
| +god        |                              | 在使用 `+overwrite` 的群組或者頻道中使用自己的格式 | 無法在 inline 模式使用<br>不能使用 `/s +god` 持久化                                                          |

### `+album` 媒體組系列

bot 支持將多 p 作品合併到一個媒體組中。媒體組（MediaGroup）是 Telegram 的一個功能，可以在一個消息裡顯示多張媒體。

因此 `+album` 參數預設啟用，此參數作用為單個作品中如果有差分（分 P）的情況，則將所有圖片塞在一個媒體組中。  
此外 Telegram 限制 1 個媒體組中最多有 10 張圖，因此在圖片很多的情況下依舊會分開發送，只不過都是以媒體組的情況。  
在超過 20 張圖片以上的情況，建議使用下文的 `+graph` 參數將作品轉換為 Telegram 以供即時預覽。  
::: details 百聞不如一見，點我查看示範來了解媒體組系列參數的具體作用
![](../img/album-summary.png)  
:::

#### `+one`

如果有多個作品則會將所有作品都合併到一個媒體組裡面。

#### `+equal`

當 bot 一次發送超過 10 張圖的時候會嘗試均衡 mediagroup 裡面的數量，比如說有 16 張圖片，會分 2 次每次發送 8 張

#### `+sc`

在媒體組裡顯示說明文（caption）  
此功能在您需要直接看到當前發了什麼，其中輸出格式為僅顯示作品名稱以及 P 數的格式，您仍然可以自訂此格式。

### `+graph` `+telegraph` 將作品轉換為 telegraph 頁面

在消息中輸入 `+graph` / `+telegraph` 機器人就會將多個作品集成到一個 telegraph 中。  
並且返回一個 telegraph 連結，手機可以快速預覽。

> 此部分為 Telegram Instant View 服務，可能有抓取失敗情況，建議一次低於 200 張。

> 此部分使用了 webp 轉換伺服器，直接訪問 telegra.ph 頁面可能會收集您的 IP ，更多詳情請參考我們的隱私政策。

#### 在 `telegraph` 連結中自訂標題、作者名字以及作者連結

例如:

```
https://www.pixiv.net/artworks/91105889 +telegraph
title=白スクのやつ
author_name=syokuyou-mogura
author_url=https://www.pixiv.net/users/579672
```

格式，=號後面的內容全部都會被匹配到，以換行作為分割

![telegraph custom](../img/telegraph-1.jpg)

# 作品版權
本頁面素材來源為：  
- [「見つけた」](https://www.pixiv.net/artworks/100316625)  
- [XX:Me](https://www.pixiv.net/artworks/67953985)
- [白スクのやつ](https://www.pixiv.net/artworks/91105889)

希望哪一天有預算以及機會可以去和歌山市旅遊  
(⁠ﾉﾟ⁠0ﾟ⁠)⁠ﾉ⁠~