import { asyncForEach } from '#handlers/common'
import { _l } from '#handlers/telegram/i18n'
import { mg2telegraph } from '#handlers/telegram/telegraph'
import { reportIndependentFailure } from '#handlers/telegram/tg-sender-continuation'
import { deepLinkShareExtra } from '#handlers/telegram/deep-link-share'

function messageThreadOptions(ctx) {
    const messageThreadId = ctx.default_extra?.message_thread_id
    return messageThreadId ? { message_thread_id: messageThreadId } : {}
}

export async function sendTelegraph(bot, runtime) {
    const { ctx, chatId, userId, defaultExtra, illusts, mediaGroups } = runtime
    if (!ctx.us.telegraph_title && illusts.length === 1) {
        ctx.us.telegraph_title = illusts[0].title
        if (!ctx.us.telegraph_author_name) {
            ctx.us.telegraph_author_name = illusts[0].author_name
            ctx.us.telegraph_author_url = `https://www.pixiv.net/artworks/${illusts[0].id}`
        }
    }

    try {
        bot.api.sendChatAction(chatId, 'typing', messageThreadOptions(ctx)).catch(() => { })
        const result = await mg2telegraph(
            mediaGroups[0],
            ctx.us.telegraph_title,
            userId,
            ctx.us.telegraph_author_name,
            ctx.us.telegraph_author_url
        )
        if (!result) return null
        await asyncForEach(result, async item => {
            try {
                await bot.api.sendMessage(
                    chatId,
                    `${item.ids.join('\n')}\n${item.telegraph_url}`,
                    deepLinkShareExtra(
                        defaultExtra,
                        runtime.forceDeepLinkShareKeyboard,
                        item.ids[0],
                        ctx.us
                    )
                )
            } catch (error) {
                await reportIndependentFailure(runtime, error, {
                    illustIds: item.ids,
                    method: 'sendTelegraphLink',
                    errorCode: error?.code || 'TELEGRAPH_LINK_SEND_FAILED'
                })
            }
        })
        try {
            await bot.api.sendMessage(chatId, _l(ctx.l, 'telegraph_iv'), defaultExtra)
        } catch (error) {
            await reportIndependentFailure(runtime, error, {
                illustIds: mediaGroups[0]?.map(media => media.id),
                method: 'sendTelegraphNotice',
                errorCode: error?.code || 'TELEGRAPH_NOTICE_SEND_FAILED'
            })
        }
        return null
    } catch (error) {
        const errorCode = await reportIndependentFailure(runtime, error, {
            illustIds: mediaGroups[0]?.map(item => item.id),
            method: 'sendTelegraph',
            errorCode: 'TELEGRAPH_SEND_FAILED'
        })
        return { code: errorCode, error, attempts: 1 }
    }
}
