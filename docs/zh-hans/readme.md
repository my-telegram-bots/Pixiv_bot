---
title: 指南
pageClass: guide
---

# Pixiv bot

一个 Telegram 机器人，可以帮助您在 Telegram 发送来自 Pixiv 的作品。

[点我开始体验](tg://resolve?domain=pixiv_bot&start=67953985) | [把 bot 添加至群组](tg://resolve?domain=Pixiv_bot&startgroup=s)

## 快速入门

### 普通消息模式

![message mode](../img/tourial-1-1.png)

当匹配到以下链接后 bot 会回复您：  

- pixiv.net/artworks/:id
- pixiv.net/artworks/en/:id
- pixiv.net/i/:id
- pixiv.net/member_illust.php?illust_id=:id
- pixiv.net/member_illust.php?illust_id=:id#manga
- :id （纯数字）

支持一个消息里包含多个链接，一次性全部发送给 bot 就行！

### inline 模式

bot 支持 Telegram inline 用法，可在不切换到聊天页面的时候使用 bot 发送作品。

点击 share 按钮或者在聊天窗口 [@pixiv_bot](https://t.me/Pixiv_bot)

> 您并不需要开头大写 `P`，只需要 `@pixiv_bot` 即可，用户名是大小写不敏感的。

![inline mode](../img/tourial-1-2.png)

此外，inline 模式目前有以下需要切换到普通消息模式的情况：

- 作品内包含多张图（多 P）
- 使用 `+spoiler` 属性
- 动图（ugoira）尚未被转码


> 需要切换到普通模式的时候会有和图片一样的提示：  
> ![inline pm alert](../img/tourial-1-3.png)  
> 请按需求点击切换到普通消息模式或者直接使用 inline 的结果。


> 此外，搜索功能暂未实现（需要 Pixiv Premium），因此搁置

## 进阶用法

机器人支持一些自定义配置，下面是配置说明。

自定义配置十分简单，您只需要在发送作品链接的同时输入一些关键词：
例如 `+tags`，那么输出的作品格式将会带上标签。不想要 open 按钮的时候，输入 `-open` 按钮就消失了：  
![demo](../img/tourial-2-1.png)

### `/s` 持久化保存配置

对于一些参数，比如说 `+tags` 您可能有持久化保存的需求，同样和上面一样非常简单。
例如:

```
/s +tags -share
```

在提示成功保存后，默认机器人就会以 `+tags` `-share` 的配置来输出作品。

此功能在群组也适用，并且有调整优先级的选项来让群里的格式统一，具体配置参考下个章节。

### `+overwrite` 在群组使用群组设置而非个人设置

您在群组/频道中想让群内的成员都使用统一格式的话，可以使用

```
/s +overwrite
```

来让所有群成员都使用群组内配置

如果单次在群组内想输出自己格式的消息，那么每次发送的时候带上 `+god` 即可

> +god 并没有持久化配置，请在每次使用时加上

### 自定义消息格式
TODO （参考配置页面）
## cheatsheet

| name        | alias                        | description                                        | remark                                                                                                       |
| ----------- | ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| -+tag       | tags                         | 显示作品标签                                       | 作品标签在遇到一些特殊字符时（例如《》（） - ・），不会被识别为可点击的链接                                  |
| +-id        | show_id                      | 显示作品 ID                                        | 默认显示格式中没有%id%字段，请通过自定义模板实现                                                             |
| -+rm        |                              | 只显示图片                                         | 不显示按钮和说明文字（caption）                                                                              |
| +-kb        | keyboard <br>remove_keyboard | 是否显示按钮                                       |                                                                                                              |
| +-cp        | remove_caption               | 是否显示说明文字                                   |                                                                                                              |
| +-open      |                              | 是否显示打开按钮                                   |                                                                                                              |
| +-share     |                              | 是否显示分享按钮                                   | 在 inline 切换时会被强制启用<br>在 channel 中会被强制禁用                                                    |
| -+sc        | single_caption               | 发送多张图片时只显示一个说明文字                   | 无法在 inline 模式使用                                                                                       |
| -+above     | caption_above                | 将说明文字显示在图片上方                           |                                                                                                              |
| -+desc      |                              | 倒序发送作品                                       | 不会改变作品内分p的顺序                                                                                   |
| -+file      | asfile                       | 以文件形式发送                                     | 无法在 inline 模式使用                                                                                       |
| -+af        | append_file                  | 在发送作品的基础上再发送图片                       | 无法在 inline 模式使用                                                                                       |
| -+graph     | telegraph                    | 解析成 Telegraph                                   | 无法在 inline 模式使用                                                                                       |
| +-album     |                              | 是否以 MediaGroup 形式发送作品                     | 无法在 inline 模式使用                                                                                       |
| -+one       | album_one                    | 是否以 MediaGroup 形式发送所有作品                 | 例如您发送了 2 个作品，bot 会将它们作为一个 MediaGroup 一起发送，而不是分开发送                              |
| -+equal     | album_equal                  | 尝试以均分方式发送 MediaGroup 作品                 | 例如需要发送 14 张图片时，系统会将其拆分成 7+7，而不是 10+4                                                  |
| -+sp        | spoiler                      | 将图片标记为隐藏（敏感）内容                               | 无法在 inline 模式使用                                                                                       |
| -+caption    | caption_extraction           | 解析图片说明文字并发送关联作品                     | 特殊需求，默认情况下不需要                                                                                   |
| +-overwrite |                              | 在群组或频道中覆盖用户的自定义设置                 | 无法在 inline 模式使用<br>使用 inline 模式在群里发图也不会触发覆盖行为（机器人无法知道用户当前的群组是什么） |
| +god        |                              | 在使用 `+overwrite` 的群组或者频道中使用自己的格式 | 无法在 inline 模式使用<br>不能使用 `/s +god` 持久化                                                          |

### `+album` 媒体组系列

bot 支持将多 p 作品合并到一个媒体组中。媒体组（MediaGroup）是 Telegram 的一个功能，可以在一个消息里显示多张媒体。

因此 `+album` 参数默认启用，此参数作用为单个作品中如果有差分（分 P）的情况，则将所有图片塞在一个媒体组中。  
此外 Telegram 限制 1 个媒体组中最多有 10 张图，因此在图片很多的情况下依旧会分开发送，只不过都是以媒体组的情况。  
在超过 20 张图片以上的情况，建议使用下文的 `+graph` 参数将作品转换为 Telegram 以供即时预览。  
::: details 百闻不如一见，点我查看演示来了解媒体组系列参数的具体作用
![](../img/album-summary.png)  
:::

#### `+one`

如果有多个作品则会将所有作品都合并到一个媒体组里面。

#### `+equal`

当 bot 一次发送超过 10 张图的时候会尝试均衡 mediagroup 里面的数量，比如说有 16 张图片，会分 2 次每次发送 8 张

#### `+sc`

在媒体组里显示说明文（caption）  
此功能在您需要直接看到当前发了什么，其中输出格式为仅显示作品名称以及 P 数的格式，您仍然可以自定义此格式。

### `+graph` `+telegraph` 将作品转换为 telegraph 页面

在消息中输入 `+graph` / `+telegraph` 机器人就会将多个作品集成到一个 telegraph 中。  
并且返回一个 telegraph 链接，手机可以快速预览。

> 此部分为 Telegram Instant View 服务，可能有抓取失败情况，建议一次低于 200 张。

> 此部分使用了 webp 转换服务器，直接访问 telegra.ph 页面可能会收集您的 IP ，更多详情请参考我们的隐私政策。

#### 在 `telegraph` 链接中自定义标题、作者名字以及作者链接

例如:

```
https://www.pixiv.net/artworks/91105889 +telegraph
title=白スクのやつ
author_name=syokuyou-mogura
author_url=https://www.pixiv.net/users/579672
```

格式，=号后面的内容全部都会被匹配到，以换行作为分割

![telegraph custom](../img/telegraph-1.jpg)

# 作品版权
本页面素材来源为：  
- [「見つけた」](https://www.pixiv.net/artworks/100316625)  
- [XX:Me](https://www.pixiv.net/artworks/67953985)
- [白スクのやつ](https://www.pixiv.net/artworks/91105889)

希望哪一天有预算以及机会可以去和歌山市旅游  
(⁠ﾉﾟ⁠0ﾟ⁠)⁠ﾉ⁠~