// translate by deepl and me(huggy)
module.exports = {
    start: "Welcome to use Pixiv bot\n" +
        "I can send pixiv illust / manga / ugoira quickly to you via the link you sent\n" +
        "Wiki： https://pixiv-bot.pages.dev\n" +
        "Maintainer: @makeding\n\n" +
        "Bot configuration: /s",
    illust_404: "Work has been deleted or the ID does not exist.",
    file_too_large: "File too large so bot can't send orininal file to you, try download manually.\n{}",
    telegraph_iv: "You need wait for a while and the Telegram instat view will be generated.",
    pm_to_generate_ugoira: "Click me to generate ugoira",
    error: "Something went wrong :(",
    setting_open_link: "Click the following link to configurate the bot.",
    setting_reset: "The configuration has been reset.",
    setting_saved: "Configurate saved.",
    fanbox_not_support: "Bot isn't support pixiv fanbox",

    // Link Start!
    link_start: "This action allows you to link this conversation to other groups/channels (currently only one link is supported)\n" + "You must be the current group administrator and the administrator of the linked channel/group to perform this action \n" +
        "You must be the current group administrator and the administrator of the connected channel/group to perform this action \n" +
        "Please reply to this message with the id of the group, you can also provide @+username if it is a public group/channel",
    link_done: "Link successfully \n{} -> {}\n",
    link_setting: "Please select option: \n" +
        "syncmode: Any work will be pushed to the group/channel | Only text that includes @Pixiv_bot to will be pushed to the group/channel\n" +
        "admin only:  illust sent by admins will be pushed to the group/channel | Every illusts sent by anyone will be pushed to the group/channel\n" +
        "repeat: The sent work will be sent again in this chat | Only the successful/failed message will be returned | Nothing will be returned\n" +
        "syncmode and admin only mode are disabled in private chat conversations." ,
    link_sync: "syncmode",
    link_sync_0: "all",
    link_sync_1: "mentioned only",
    link_administrator_only: "admin only",
    link_administrator_only_0: "❌",
    link_administrator_only_1: "✅",
    link_repeat: "Repeat",
    link_repeat_0: "❌",
    link_repeat_1: "Notice",
    link_repeat_2: "✅",
    link_alias: "group/channel alias",
    link_unlink: "unlink ❌",
    link_unlink_done: "Unlinked successfully",

    saved: "Saved",
    sent: "Sent",

    error_text_too_long: "Sending failed, text is too long, try the following actions to cut the text \n" +
        "1. cut the reply format in /s (if you customized it) \n" +
        "2. try -tags (not show in text)\n" +
        "3. reduce the number of illusts you sent at once",
    error_tlegraph_title_too_long: "Error: title is too long.",
    error_tlegraph_author: "Error, author's information is too long or incorrect.",
    error_not_a_administrator: "Configuration failed, you are not this group's administrator.",
    error_not_a_gc_administrator: "Configuration failed, you are not this/that group/channel 's administrator.",
    error_format: "Send failed, reply format error, please check if any characters are not escaped. \n\n{}",
    error_anonymous: "You are currently anonymous and cannot doing this action.",
    error_not_enough_rights: "I don't have permission to send media, so I can't send pixiv illust(s), please check the permission (permissions/send media or permissions/Exceptions/pixiv_bot/send media).",
}
