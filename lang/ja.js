export default {
    start: "Pixiv botへようこそ\n" +
        "リンクを介してさまざまなイラストやうごイラを迅速に送信できます\n" +
        "ドキュメント： https://pixiv-bot.pages.dev\n" +
        "メンテナー： @makeding\n\n" +
        "ボットを設定するには/sを入力してください",
    illust_404: "Pixivでその作品は見つかりませんでした。",
    file_too_large: "ファイルが大きすぎてボットが直接送信できません。ファイルを手動でダウンロードしてください:\n{}",
    telegraph_iv: "生成が完了しました\nTelegram Instant View が表示されるまでしばらくお待ちください。",
    pm_to_generate_ugoira: "うごイラを生成するにはここをクリックしてください",
    pm_to_get_all_illusts: "すべてのイラストを取得するにはここをクリックしてください",
    error: "エラーが発生しました。",
    setting_open_link: "Web構成にアクセスするには、次のリンクをクリックしてください。",
    setting_reset: "設定がリセットされました。",
    setting_saved: "設定が正常に保存されました。",
    fanbox_not_support: "ボットはFanbox作品をサポートしていません。",
    link_start: "この操作は、この会話を他のグループ/チャンネルにリンクすることができます（現在は1つのみサポートされています）\n" +
        "この操作を実行するには、現在のグループの管理者である必要があります。リンクされたチャンネル/グループの管理者である必要もあります。\n" +
        "グループのIDをこのメッセージに返信するか、公開グループ/チャンネルの場合はユーザー名を提供してください",
    link_done: "グループが正常にリンクされました\n{} -> {}\n",
    link_setting: "次のスキームを選択してください：\n" +
        "同期モード：すべての作品がグループ/チャンネルにプッシュされます| @で言及された作品のみがグループ/チャンネルにプッシュされます\n" +
        "管理者のみ：管理者が送信した作品のみがグループ/チャンネルにプッシュされます| 誰でも送信した作品がグループ/チャンネルにプッシュされます\n" +
        "繰り返し：送信された作品はグループ内で再び送信されます| 成功/失敗のメッセージのみを返す| 何も返さない\n" +
        "同期モードと管理者のみモードはプライベート会話では無効です。",
    link_sync: "同期モード",
    link_sync_0: "すべて",
    link_sync_1: "言及されたリンクのみ（@で）",
    link_administrator_only: "管理者のみ",
    link_administrator_only_0: "❌",
    link_administrator_only_1: "✅",
    link_repeat: "繰り返しモード",
    link_repeat_0: "❌",
    link_repeat_1: "通知のみ",
    link_repeat_2: "✅",
    link_alias: "グループ/チャンネルの別名",
    link_unlink: "リンク解除 ❌",
    link_unlink_done: "リンク解除が成功しました",
    saved: "保存しました",
    sent: "送信しました",
    error_text_too_long: "送信に失敗しました、返信テキストが長すぎます。以下のステップにテキストを短縮してみてください：\n" +
        "1. /sでフォーマットを減らす（カスタマイズしている場合）\n" +
        "2. -tags（タグを非表示にする）\n" +
        "3. 一度に送信する作品の数を減らす",
    error_tlegraph_title_too_long: "生成に失敗しました、タイトルが長すぎます。",
    error_tlegraph_author: "生成に失敗しました、著者情報が長すぎるか間違っています。",
    error_not_a_administrator: "構成操作に失敗しました、あなたはこのグループの管理者ではありません。",
    error_format: "送信に失敗しました、返信のフォーマットエラーです。エスケープされていない文字があるかどうかを確認してください\n\n{}",
    error_anonymous: "現在匿名モードですので、この操作は実行できません。",
    error_not_enough_rights: "ボットにSend Media（メディアの送信）の権限がありません、画像を送信できません。設定で有効にしてください（Permissions/Send Media | Permissions/Exceptions/Pixiv_bot/Send Media）"
}