// deeplと俺(huggy)からの翻訳です
// need help
module.exports = {
    start: "Pixiv bot へようこそ\n" +
        "このロボットはPixivのリングでイラストや動画を便利に送信できます。\n" +
        "ドキュメント：https://pixiv-bot.pages.dev\n" +
        "管理者: @makeding\n\n" +
        "Bot 設定: /s",
    illust_404: "該当作品は削除されたか、存在しない作品IDです。",
    file_too_large: "ファイルが大きすぎてボットが直接送ることができませんので、手動でファイルをダウンロードしてみてください\n{}",
    telegraph_iv: "しばらく待つと、Telegram instatview が生成されます。",
    pm_to_generate_ugoira: "クリックして動いらを生成する",
    error: "エラーが発生しました",
    setting_open_link: "以下のリンクをクリックして、ボットを設定してください。",
    setting_reset: "設定がリセットされました。",
    setting_saved: "保存されています。",
    fanbox_not_support: "Bot は fanbox に対応していません。",
    
    // Link Start!
    link_start: "このアクションでは、この会話を他のグループやチャンネルにリンクさせることができます（現在、リンクは1つしかサポートされていません）。\n" +
        "この操作を行うには、現在のグループ管理者であると同時に、接続しているチャンネル/グループの管理者である必要があります。\n" +
        "このメッセージには、グループのIDを返信してください。",
    link_done: "リンクグループの成功\n{} -> {}\n",
    link_setting: "選択してください：\n" +
        "同期モード：任意の作品がグループ/チャネルにプッシュされる｜＠がついた作品のみがグループ/チャネルにプッシュされる\n" +
        "管理者限定：管理者が送信したメッセージのみがグループ/チャネルにプッシュされる｜誰が送信したメッセージもグループ/チャネルにプッシュされる\n" +
        "リピートモード：送信された作品は、グループ内で再度送信されます｜成功／失敗のメッセージのみが返されます｜何も返されません\n" +
        "同期モードと管理者限定は、プライベートチャットの会話では利用できません。",
    // "别名",
    link_sync: "同期モード",
    link_sync_0: "すべて",
    link_sync_1: "言及のみ",
    link_administrator_only: "管理者限定",
    link_administrator_only_0: "❌",
    link_administrator_only_1: "✅",
    link_repeat: "リピート",
    link_repeat_0: "❌",
    link_repeat_1: "通知のみ",
    link_repeat_2: "✅",
    link_alias: "別名",
    link_unlink: "リンク解除 ❌",
    link_unlink_done: "キャンセル・リンク成功",

    saved: "保存成功",
    sent: "已发送",

    error_text_too_long: "送信に失敗しました。テキストが長すぎます。以下の方法でテキストをカットしてください。\n" +
        "1. /s 形式のテキスト量を減らす（設定した場合\n" +
        "2. -tags コマンドの使用\n" +
        "3. 一度に送イラストの数を減らす",
    error_tlegraph_title_too_long: "タイトルが長すぎるため、生成に失敗しました。",
    error_tlegraph_author: "作者の関連情報が長すぎるか、間違っているため、生成に失敗しました。",
    error_not_a_administrator: "設定操作に失敗し、あなたがグループ管理者ではないことを示しています。",
    error_format: "送信失敗、返信フォーマットエラー、エスケープされていない文字がないか確認してください。\n\n{}",
    error_anonymous: "あなたは現在匿名なので、このアクションを実行できません。",
}
