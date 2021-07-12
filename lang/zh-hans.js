module.exports = {
    start: "欢迎使用 Pixiv bot\n" +
        "我可以通过链接帮助你快速发送各类插图与动图\n" +
        "文档： https://pixiv-bot.pages.dev\n" +
        "维护者: @makeding\n\n" +
        "输入 /s 可对 bot 进行一些配置",
    illust_404: "该作品已被删除，或作品 ID 不存在。",
    file_too_large: "文件太大，机器人不能直接把文件发给你，请尝试手动下载文件\n{}",
    telegraph_iv: "生成完毕\n您需要等待一会儿 Telegram 的即时预览才会出现。",
    pm_to_generate_ugoira: "点我私聊生成动图",
    error: "发生了点错误",
    setting_open_link: "请点击以下链接到网页配置。",
    setting_reset: "配置已重置。",
    setting_saved: "保存配置成功。",
    fanbox_not_support: "机器人不支持 fanbox 作品。",
    error_text_too_long: "发送失败，回复文本太长，请尝试以下操作减少文本量\n" +
        "1. 在 /s 中减少格式量（如果您自定义了的话）\n" +
        "2. -tags (不显示 tags )\n" +
        "3. 减少一次发送的作品数量",
    error_tlegraph_title_too_long: '生成失败，标题太长。',
    error_tlegraph_author: '生成失败，作者相关信息太长或者有误。',
    error_not_a_administrator: '配置操作失败，您不是群组的管理员。'
}