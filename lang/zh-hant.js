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

    link_start: "此操作可以連接此對話至其它群組/頻道（目前只支持連結一個)\n" +
        "您必須為當前群組管理員以及連接的頻道/群組的管理員才能執行此操作\n" +
        "請在此消息中回復群組的id，如果是公開群組/頻道也可以提供 @ 的",
    link_done: "連結群組成功\n{} -> {}\n",
    link_setting: "請選擇方案：\n" +
        "同步模式: 任何作品都會推送到群組/頻道 | 只有被@到的作品才會被推送到群組/頻道\n" +
        "管理員限定：只有管理員發送的會推送到群組/頻道 | 任何人發送的都會推送到群組/頻道\n" +
        "複讀: 發送的作品會在群裡面再發送一次 | 只返回發送成功/失敗的消息 | 什麼都不返回\n" +
        "其中 同步模式和管理員限定模式在私聊對話中是無效的。",
    link_sync: "同步模式",
    link_sync_0: "所有",
    link_sync_1: "僅被提及",
    link_administrator_only: "管理員限定",
    link_administrator_only_0: "❌",
    link_administrator_only_1: "✅",
    link_repeat: "複讀模式",
    link_repeat_0: "❌",
    link_repeat_1: "僅通知",
    link_repeat_2: "✅",
    link_alias: "群組/頻道別名",
    link_unlink: "取消連結 ❌",
    link_unlink_done: "取消連結成功",

    saved: "保存成功",
    sent: "已發送",

    error_text_too_long: "發送失敗，回復文本太長，請嘗試以下操作減少文本量\n" +
        "1. 在 /s 中減少格式量（如果您自訂了的話）\n" +
        "2. -tags (不顯示 tags )\n" +
        "3. 減少一次發送的作品數量",
    error_tlegraph_title_too_long: "生成失敗，標題太長。",
    error_tlegraph_author: "生成失敗，作者相關訊息太長或者有誤。",
    error_not_a_administrator: "配置操作失敗，您不是該群組的管理員。",
    error_format: "發送失敗，回復格式錯誤，請查閱是否有字元未被轉義\n\n{}",
    error_anonymous: "您目前為匿名狀態，無法執行此操作。",
}
