// deeplと俺(huggy)からの翻訳です
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
    error_text_too_long: "送信に失敗しました。テキストが長すぎます。以下の方法でテキストをカットしてください。\n" +
        "1. /s 形式のテキスト量を減らす（設定した場合\n" +
        "2. -tags コマンドの使用\n" +
        "3. 一度に送イラストの数を減らす",
    error_tlegraph_title_too_long: 'タイトルが長すぎるため、生成に失敗しました。',
    error_tlegraph_author: '作者の関連情報が長すぎるか、間違っているため、生成に失敗しました。',
    error_not_a_administrator: '設定操作に失敗し、あなたがグループ管理者ではないことを示しています。',
    error_format: '送信失敗、返信フォーマットエラー、エスケープされていない文字がないか確認してください。\n\n{}'
}
