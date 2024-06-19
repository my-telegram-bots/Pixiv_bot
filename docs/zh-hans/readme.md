---
title: 指南
pageClass: guide
---
# Pixiv bot
一个 Telegram 机器人，可以帮助您在 Telegram 发送来自 Pixiv 的作品。  
[点我开始体验](tg://resolve?domain=pixiv_bot&start=67953985) | [把 bot 添加至群组](tg://resolve?domain=Pixiv_bot&startgroup=s)  

 
![r_1](../img/r_1.jpg)  


当匹配到以下 Pixiv 链接后 bot 会回复。
- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illust_id=:id
- pixiv.net/member_illust.php?illust_id=:id#manga
- :id （就是纯数字）

## 简单用法
### 普通消息模式
仅需发送 pixiv 的链接给 bot 即可  
支持一个消息里面包含多个链接，无脑地全部发送给 bot 就行！

### inline 模式
bot 支持 Telegram inline 用法，点击 share 按钮或者在聊天窗口 [@Pixiv_bot](https://t.me/Pixiv_bot) 即可体验～  
目前 inline 只有每日榜图以及查找 id 的功能，暂时还没有直接搜索作品功能

> 这个需要填坑！(会员账号才能有热门排序 暂时搁置了)

## 进阶用法
机器人支持一些自定义配置，下面是配置说明
简单地来说，自定义配置就是在发送作品的时候再多打几个字传参数，例如我想在回复里面显示作品的标签，那么输入 `+tag` 就会显示了
如果不想要打开 (open) 按钮，那么输入 `-open` 打开按钮就消失了

### 持久化保存配置
（本来是应该做成网页版的，不过网页版还没补坑）
使用 `/s` 后面接配置
例如:  
```
/s +tags -share
```
那么后面 bot 就会默认以 `+tags` `-share` 的格式输出作品
设置成 自定义配置（如 /s -open -kb ...) 后 仍然可以在 链接 / id 后面手动加上 `+open` `+kb` 等来显示对应的内容

#### 在群组中优先使用群组自定义结果 +overwrite
```
/s +overwrite
```
即可覆盖个人自定义结果（群组用）

如果单次在群组里面想输出自己格式的消息，那么每次发送的时候带上 `+god` 即可
> 持久化配置 请使用 `/s -overwrite`
> 而不是 `/s +god` ！

### 按需显示系列
一张图概括:  
![r_2](../img/r_2.jpg)  
说明:  
- `open` 控制是否显示 open 按钮
- `share` 控制是否显示 share 按钮
- `kb` 同时控制 open 和 share 按钮
> kb = keyboard
- `cp` `rm` 控制是否添加图片的描述
> `+sc` 多张图片只为第一张图片增加描述
- `+above` show_caption_above_media
例如:  
- `+open -share` 显示 open 按钮 不显示 share 按钮

### 支持读取 caption 中的链接 +caption
`+caption` bot 就能读取消息 caption 中的 Pixiv 作品链接

### 包含作品标签 +tags
仅需在消息中输入 `+tag` / `+tags` 即可显示作品的标签
> 由于 Telegram 的限制，作品标签在遇到一些特殊字符的时候（比如 《》（） - ・ ）是不会识别为可以点击的链接的，这个我没有办法解决。

### 给图片加上遮罩 +sp
输入 `+sp` bot 就会给发送的图片增加 spoiler 效果
> 由于 Telegram 问题 inline 下仍不能使用

### 使用文件形式发送作品 +file
输入 `+file` ，bot 就会直接发送原图文件给你。
> 以及 `/s +file` 那么 bot 每次都是直接发送原图文件给你
> 适合收藏原图的小伙伴（网页右键下载还更快？）

输入 `+af` `+appendf` ，bot 会发送完图片后再发送原图文件给你
> 同时支持持久化配置

### 倒序输出作品 +desc
输出的作品会和输入链接顺序相反（多p不影响）
例如:  
输入:  
- illust 1 link
- illust 2 link

返回:  
- illust 2's image 1
- illust 1's image 1
- illust 1's image 2

### 将多个作品集成到一个媒体组（相册）里面 +album / +one（默认启用）
在消息中输入 `+album` / `+one` 机器人就会将多个作品集成到一个 mediagroup 中  
如果需要关闭这个功能 一个 id 发送一次 那么输入 `-album` 即可
> `-album` 后发图顺序可能有点变化，并且多p作品还是会在媒体组里面

另外 Telegram 有限制 一个 mediagroup 最多只能有 10 张图，所以还是会分p发送
> `+equal` 当 bot 一次发送超过10张图的时候会尝试均衡 mediagroup 里面的数量，比如说有 16 张图片，会分 2 次每次发送 8 张

### 将多个作品使用 telegraph 显示 +graph +telegraph
在消息中输入 `+graph` / `+telegraph` 机器人就会将多个作品集成到一个 telegraph 中，并且返回一个 telegraph 链接，手机可以快速预览。

> 图太多的话 Telegram 可能不会出现消息即时预览，建议一次低于 200 张。
~~太多了我土豆服务器也许会宕机 qaq~~
#### 在 telegraph 链接中自定义标题、作者名字以及作者链接
例如:  

```
https://www.pixiv.net/artworks/91105889 +telegraph
title=白スクのやつ
author_name=syokuyou-mogura
author_url=https://www.pixiv.net/users/579672
```
格式，=号后面的内容全部都会被匹配到，以换行作为分割

![telegraph custom](../img/telegraph-1.jpg)
