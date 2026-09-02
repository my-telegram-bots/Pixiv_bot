---
title: ガイド
---

# Pixiv bot

Telegram で Pixiv の作品を送信するための Bot です。

[Bot を開始](tg://resolve?domain=pixiv_bot&start=67953985) | [グループに追加](tg://resolve?domain=Pixiv_bot&startgroup=s)

## クイックスタート

### メッセージモード

![メッセージモード](../img/tourial-1-1.png)

Bot は Pixiv の作品 URL、`pixiv.net/i/:id`、旧形式の作品 URL、または数字だけの作品 ID に反応します。1 件のメッセージに複数の URL を含めることもできます。

### インラインモード

共有ボタンを押すか、任意のチャットで [@pixiv_bot](https://t.me/Pixiv_bot) と入力すると、Bot のチャットへ移動せずに利用できます。

![インラインモード](../img/tourial-1-2.png)

複数ページ作品、未変換のうごイラ、または `+spoiler` を使用する場合は、通常のメッセージモードへ切り替える案内が表示されます。

## 設定

作品 URL と一緒に `+tags` を付けるとタグを表示し、`-open` を付けると「開く」ボタンを非表示にできます。

永続設定は `/s` コマンドで保存します。

```text
/s +tags -share
```

グループやチャンネルの設定をメンバー全員に適用するには `/s +overwrite` を使います。その会話で一度だけ個人設定を使う場合は作品 URL に `+god` を加えてください。`+god` は永続保存できません。

### 主なオプション

| オプション | 内容 |
| --- | --- |
| `+tags` / `-tags` | タグを表示／非表示 |
| `+desc` / `-desc` | 説明を表示／非表示 |
| `+album` / `-album` | MediaGroup を使用／不使用 |
| `+sc` / `-sc` | 複数画像でキャプションを 1 件だけ表示／解除 |
| `+file` / `-file` | ファイルとして送信／解除 |
| `+af` / `-af` | 元ファイルを追加／解除 |
| `+graph` / `-graph` | Telegraph ページを作成／解除 |
| `+sp` / `-sp` | スポイラーを付ける／解除 |
| `+overwrite` / `-overwrite` | グループ設定による上書き／解除 |

### Telegraph の情報

`+telegraph` と同じメッセージで、改行区切りの `title=...`、`author_name=...`、`author_url=...` を指定できます。

```text
https://www.pixiv.net/artworks/91105889 +telegraph
title=White Swimsuit
author_name=syokuyou-mogura
author_url=https://www.pixiv.net/users/579672
```

## 作品の著作権

このページの画像は各 Pixiv 作品の作者に帰属します。
