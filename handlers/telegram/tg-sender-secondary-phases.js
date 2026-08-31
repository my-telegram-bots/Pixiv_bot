import { handle_novel } from '#handlers/telegram/handle_novel'
import { _l } from '#handlers/telegram/i18n'
import { renderUserFacingError } from '#handlers/telegram/user-facing-error'
import {
    reportIndependentFailure,
    runIndependentDeliveryItems
} from '#handlers/telegram/tg-sender-continuation'

function messageThreadOptions(ctx) {
    const messageThreadId = ctx.default_extra?.message_thread_id
    return messageThreadId ? { message_thread_id: messageThreadId } : {}
}

export async function sendNovels(bot, runtime) {
    const { ctx, chatId, defaultExtra, ids } = runtime
    await runIndependentDeliveryItems(ids.novel, async id => {
        bot.api.sendChatAction(chatId, 'typing', messageThreadOptions(ctx)).catch(() => { })
        const novel = await handle_novel(id)
        if (!novel) {
            runtime.deliveryErrors.push('PIXIV_NOVEL_NOT_FOUND')
            await bot.api.sendMessage(chatId, _l(ctx.l, 'illust_404'), defaultExtra).catch(() => { })
            return
        }

        const extra = { ...defaultExtra }
        delete extra.parse_mode
        try {
            await bot.api.sendMessage(chatId, novel.telegraph_url, extra)
        } catch (error) {
            runtime.deliveryErrors.push(error.code || 'TELEGRAM_NOVEL_SEND_FAILED')
            await runtime.reportError(error, chatId, ctx.l, {
                method: 'sendNovel',
                errorCode: error.code || 'TELEGRAM_NOVEL_SEND_FAILED'
            })
        }
    }, async error => {
        const errorCode = await reportIndependentFailure(runtime, error, {
            method: 'resolveNovel',
            errorCode: error?.code || 'PIXIV_NOVEL_REQUEST_FAILED'
        })
        await bot.api.sendMessage(
            chatId,
            renderUserFacingError(ctx.l, { ...error, code: errorCode }),
            defaultExtra
        ).catch(() => { })
    })
}

export async function notifyFanbox(bot, runtime) {
    const { ctx, chatId, text, defaultExtra } = runtime
    if (!text.includes('fanbox.cc/') || chatId <= 0) return
    try {
        await bot.api.sendMessage(chatId, _l(ctx.l, 'fanbox_not_support'), defaultExtra)
    } catch (error) {
        await reportIndependentFailure(runtime, error, {
            method: 'notifyFanbox',
            errorCode: error?.code || 'TELEGRAM_FANBOX_NOTICE_FAILED'
        })
    }
}
