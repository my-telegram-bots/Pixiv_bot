export default {
    start: "Welcome to Pixiv bot\n" +
        "I can help you quickly send Pixiv illustrations and ugoira through links you send\n" +
        "Documentation: https://pixiv-bot.pages.dev\n" +
        "Maintainer: @makeding\n\n" +
        "Type /s to configure the bot",
    illust_404: "The artwork was not found on Pixiv.",
    file_too_large: "The file is too large for the bot to send directly to you. Please try downloading the file manually:\n{}",
    telegraph_iv: "Generation completed\nYou need to wait a while for Telegram Instant View to appear.",
    pm_to_generate_ugoira: "Click me to generate an ugoira",
    pm_to_get_all_illusts: "Click me to get all illustrations",
    error: "Oops, Something went wrong :(",
    setting_open_link: "Please click the following link to access web configuration.",
    setting_reset: "Configuration has been reset.",
    setting_saved: "Configuration saved successfully.",
    fanbox_not_support: "The bot does not support Fanbox links.",
    link_start: "This operation can link this conversation to other groups/channels (currently only supports linking one)\n" +
        "You must be the administrator of the current group and the linked channel/group to perform this operation\n" +
        "Please reply to this message with the group's ID, or provide the username if it's a public group/channel",
    link_done: "Group linked successfully\n{} -> {}\n",
    link_setting: "Please choose a scheme:\n" +
        "Sync Mode: Any artworks will be pushed to the group/channel | Only artworks mentioned with @ will be pushed to the group/channel\n" +
        "Administrator Only: Only artworks sent by administrators will be pushed to the group/channel | Artworks sent by anyone will be pushed to the group/channel\n" +
        "Repeat: Sent artworks will be sent again in the group | Only return messages indicating success/failure of sending | Return nothing\n" +
        "Sync Mode and Administrator Only Mode are ineffective in private conversations.",
    link_sync: "Sync Mode",
    link_sync_0: "All",
    link_sync_1: "Mentioned Only",
    link_administrator_only: "Administrator Only",
    link_administrator_only_0: "❌",
    link_administrator_only_1: "✅",
    link_repeat: "Repeat Mode",
    link_repeat_0: "❌",
    link_repeat_1: "Notify Only",
    link_repeat_2: "✅",
    link_alias: "Group/Channel Alias",
    link_unlink: "Unlink ❌",
    link_unlink_done: "Unlink successful",
    saved: "Saved successfully",
    sent: "Sent successfully",
    error_text_too_long: "Sending failed, reply text is too long. Please try reducing the text with the following actions:\n" +
        "1. Reduce formatting in /s (if you have customized)\n" +
        "2. -tags (Hide tags)\n" +
        "3. Reduce the number of artworks sent at once",
    error_tlegraph_title_too_long: "Generation failed, title is too long.",
    error_tlegraph_author: "Generation failed, author information is too long or incorrect.",
    error_not_a_administrator: "Configuration operation failed, you are not an administrator of this group.",
    error_format: "Sending failed, reply format error, please check if there are unescaped characters\n\n{}",
    error_anonymous: "You are currently in anonymous mode and cannot perform this operation.",
    error_not_enough_rights: "The bot does not have permission to Send Photos. Please enable it in the settings (Permissions/Send Media | Permissions/Exceptions/Pixiv_bot/Send Media)"
}
