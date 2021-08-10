---
title: 指南
pageClass: guide
---
# Pixiv bot
一个 Telegram 机器人，可以帮助您在 Telegram 发送来自 pixiv 的作品。  
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
支持一个消息里面包含多个链接，无脑地全部发送给我就行！

### inline 模式
bot 支持 Telegram 的 inline 用法，点击 share 按钮或者在聊天窗口 [@Pixiv_bot](https://t.me/Pixiv_bot) 即可体验～  
目前 inline 只有每日榜图以及查找 id 的功能，暂时还没有直接搜索作品功能

> 这个需要填坑！(会员账号才能有热门排序 暂时搁置了)

## 进阶用法
机器人支持一些自定义用法，下面是用法介绍。  
简单地来说，自定义用法就是在发送作品的时候再多打几个字传参数，例如我想在回复里面显示作品的标签，那么输入 `+tag` 就会显示了  
如果不想要打开(open)按钮，那么我输入 `-open` 打开按钮就消失了
### 持久化保存配置
（本来是应该做成网页版的，不过网页版还没补坑）  
使用 `/s` 后面接配置
例如:
```
/s +tags -share
```
那么后面 bot 就会默认以 `+tags` `-share` 配置输出作品  

#### 在群组中优先使用群组自定义结果 +overwrite
```
/s +overwrite
```
即可覆盖个人自定义结果（群组用）

如果在群组里面还是想输出自己格式的链接，那么每次发送的时候带上 `+god` 即可。
### 包含作品标签 +tags
仅需在消息中输入 `+tag` / `+tags` 即可显示作品的标签  
> 由于 Telegram 的限制，作品标签在遇到一些特殊字符的时候（比如 《》（） - ・ ）是不会成可以点击的链接的，这个表示我没有办法解决。   

### 倒序输出作品 +desc
输出的作品会和输入链接顺序相反（多p不影响）  
例子:  
输入:  
- illust 1 link
- illust 2 link

返回:  
- illust 2's image 1
- illust 1's image 1
- illust 1's image 2

### 按需显示系列 -open -share -kb -cp -rm
一张图概括：
![r_2](../img/r_2.jpg)  
说明：  
- `-open` 不显示 open 按钮
- `-share` 不显示 share 按钮
- `-kb` open 和 share 按钮都不显示
> kb = keyboard
- `-cp` 不显示图片中的文本内容
- `-rm` 只显示图片

设置成默认设置了（/s -open ...) 后仍然可以在作品后面手动加上 `+open` 之类的来显示对应的内容
### 使用文件形式发送作品 +file

输入 `+file` ，机器人就会直接发送源文件给你。  
> 以及 `/s +file` 那么就发送给机器人的作品每次都是直接发送文件给你
> 适合收藏原图的小伙伴（网页右键下载还更快？）

### 将多个作品集成到一个媒体组（相册）里面 +album （默认启用）

在消息中输入 `+album` 机器人就会将多个作品集成到一个媒体组中  
如果需要关闭这个功能 一个 id 发送一次 那么输入 `-album` 即可  
> `-album` 开启后发图顺序可能有点变化，并且多p作品还是会在媒体组里面  
> 另外 Telegram 有限制 一个媒体组最多只能有 10 张图，所以还是会分p发送

### 将多个作品使用 telegraph 显示 +graph +telegraph

在消息中输入 `+graph` / `+telegraph` 机器人就会将多个作品集成到一个 telegraph 中，并且返回一个 telegraph 链接，手机可以快速预览。

> 图太多的话 Telegram 可能不会出现 IV 即时预览的，建议一次低于 200 张。  
~~太多了我土豆服务器也许会宕机 qaq~~
#### 在 telegraph 链接中自定义标题、作者名字以及作者链接
例子：

```
https://www.pixiv.net/artworks/91105889 +telegraph
title=白スクのやつ
author_name=syokuyou-mogura
author_url=https://www.pixiv.net/users/579672
```
格式，=号后面的内容全部都会被匹配到，以换行作为分割

![telegraph custom](../img/telegraph-1.jpg)  


