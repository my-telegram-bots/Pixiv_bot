// 繁体化来自繁化姬 zhconvert.org
module.exports = {
    start: "歡迎使用 Pixiv bot\n" +
        "我可以通過連結幫助你快速發送各類插圖與動圖\n" +
        "文檔: https://pixiv-bot.pages.dev\n" +
        "維護者: @makeding\n\n" +
        "輸入 /s 可對 bot 進行一些配置",
    illust_404: "該作品已被刪除，或作品 ID 不存在。",
    file_too_large: "文件太大，機器人不能直接把文件發給你，請嘗試手動下載文件\n{}",
    telegraph_iv: "生成完畢\n您需要等待一會 Telegram 的即時預覽才會出現。",
    pm_to_generate_ugoira: "點我私聊生成動圖",
    error: "發生了點錯誤",
    setting_open_link: "請點擊以下連結到網頁配置。",
    setting_reset: "配置已重設。",
    setting_saved: "保存配置成功。",
    fanbox_not_support: "機器人不支持 fanbox 作品。",
    error_text_too_long: "發送失敗，回復文本太長，請嘗試以下操作減少文本量\n" +
        "1. 在 /s 中減少格式量（如果您自訂了的話）\n" +
        "2. -tags (不顯示 tags )\n" +
        "3. 減少一次發送的作品數量",
    error_tlegraph_title_too_long: '生成失敗，標題太長。',
    error_tlegraph_author: '生成失敗，作者相關訊息太長或者有誤。',
    error_not_a_administrator: '配置操作失敗，您不是群組的管理員。'
}