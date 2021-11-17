// translate by deepl and me(huggy)
export const start = "欢迎使用 Pixiv bot\n" +
    "我可以通过链接帮助你快速发送各类插图与动图\n" +
    "文档： https://pixiv-bot.pages.dev\n" +
    "维护者: @makeding\n\n" +
    "输入 /s 可对 bot 进行一些配置"
export const illust_404 = "该作品已被删除，或作品 ID 不存在。"
export const file_too_large = "文件太大，机器人不能直接把文件发给你，请尝试手动下载文件\n{}"
export const telegraph_iv = "生成完毕\n您需要等待一会儿 Telegram 的即时预览才会出现。"
export const pm_to_generate_ugoira = "点我私聊生成动图"
export const error = "发生了点错误"
export const setting_open_link = "请点击以下链接到网页配置。"
export const setting_reset = "配置已重置。"
export const setting_saved = "保存配置成功。"
export const fanbox_not_support = "机器人不支持 fanbox 作品。"
export const link_start = "此操作可以链接此对话至其它群组/频道（目前只支持链接一个)\n" +
    "您必须为当前群组管理员以及链接的频道/群组的管理员才能执行此操作\n" +
    "请在此消息中回复群组的id，如果是公开群组/频道也可以提供 @ 的"
export const link_done = "链接群组成功\n{} -> {}\n"
export const link_setting = "请选择方案：\n" +
    "同步模式: 任何作品都会推送到群组/频道 | 只有被@到的作品才会被推送到群组/频道\n" +
    "管理员限定：只有管理员发送的会推送到群组/频道 | 任何人发送的都会推送到群组/频道\n" +
    "复读: 发送的作品会在群里面再发送一次 | 只返回发送成功/失败的消息 | 什么都不返回\n" +
    "其中 同步模式和管理员限定模式在私聊对话中是无效的。"
export const link_sync = "同步模式"
export const link_sync_0 = "所有"
export const link_sync_1 = "仅被提及"
export const link_administrator_only = "管理员限定"
export const link_administrator_only_0 = "❌"
export const link_administrator_only_1 = "✅"
export const link_repeat = "复读模式"
export const link_repeat_0 = "❌"
export const link_repeat_1 = "仅通知"
export const link_repeat_2 = "✅"
export const link_alias = "群组/频道别名"
export const link_unlink = "取消链接 ❌"
export const link_unlink_done = "取消链接成功"
export const saved = "保存成功"
export const sent = "已发送"
export const error_text_too_long = "发送失败，回复文本太长，请尝试以下操作减少文本量\n" +
    "1. 在 /s 中减少格式量（如果您自定义了的话）\n" +
    "2. -tags (不显示 tags )\n" +
    "3. 减少一次发送的作品数量"
export const error_tlegraph_title_too_long = "生成失败，标题太长。"
export const error_tlegraph_author = "生成失败，作者相关信息太长或者有误。"
export const error_not_a_administrator = "配置操作失败，您不是该群组的管理员。"
export const error_format = "发送失败，回复格式错误，请查阅是否有字符未被转义\n\n{}"
export const error_anonymous = "您目前为匿名状态，无法执行此操作。"
export const error_not_enough_rights = "机器人未获得 Send Media (发送媒体) 的权限，发不了任何图片，请在设置里面打开 (权限/发送媒体 ｜ 权限/例外/Pixiv_bot/发送媒体)"
