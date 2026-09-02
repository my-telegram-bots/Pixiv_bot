import { k_os } from '#handlers/telegram/keyboard'

function normalizeIllustrationId(value) {
    if (typeof value === 'string' && !/^[1-9]\d*$/.test(value)) return null
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function forceDeepLinkShare(ctx) {
    if (ctx?.command !== 'start' || typeof ctx.match !== 'string' ||
        !ctx.match.trim() || !ctx.us) {
        return false
    }
    ctx.us.share = true
    return true
}

export function deepLinkShareExtra(defaultExtra, enabled, illustId, settings) {
    const normalizedId = normalizeIllustrationId(illustId)
    if (!enabled || normalizedId === null) return defaultExtra
    return {
        ...defaultExtra,
        ...k_os(normalizedId, settings)
    }
}

export async function attachDeepLinkShareKeyboard({
    api,
    chatId,
    messageId,
    illustId,
    settings,
    onError = async () => {}
}) {
    const normalizedId = normalizeIllustrationId(illustId)
    if (!Number.isSafeInteger(messageId) || normalizedId === null) {
        return false
    }
    try {
        await api.editMessageReplyMarkup(
            chatId,
            messageId,
            k_os(normalizedId, settings)
        )
        return true
    } catch (error) {
        await Promise.resolve(onError(error)).catch(() => {})
        return false
    }
}

export async function attachDeepLinkKeyboard(bot, runtime, illustId, messageId) {
    if (!runtime.forceDeepLinkShareKeyboard) return false
    return attachDeepLinkShareKeyboard({
        api: bot.api,
        chatId: runtime.chatId,
        messageId,
        illustId,
        settings: runtime.ctx.us,
        onError: error => runtime.reportError(
            error,
            runtime.chatId,
            runtime.ctx.l,
            {
                notifyUser: false,
                illustId,
                method: 'attachDeepLinkShareKeyboard',
                errorCode: 'TELEGRAM_DEEP_LINK_SHARE_FAILED'
            }
        ).catch(() => {})
    })
}

export async function attachDeepLinkAlbumKeyboard(bot, runtime, mediaGroup, sentMessages) {
    return attachDeepLinkKeyboard(
        bot,
        runtime,
        mediaGroup?.[0]?.id,
        sentMessages?.[0]?.message_id
    )
}
