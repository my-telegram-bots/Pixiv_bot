import { createChatDeliveryQueue } from '#handlers/telegram/chat-delivery-queue'

export function createQueuedContentDispatcher(options) {
    const queue = createChatDeliveryQueue()
    const dispatch = createSourceMessageDispatcher(options)
    return {
        dispatchSource: (ctx, chatId) => queue.run(chatId, () => dispatch(ctx, chatId)),
        sendLinked: ctx => queue.run(ctx.chat_id ?? ctx.chat?.id ?? ctx.message?.chat?.id,
            () => options.send(ctx))
    }
}

export function createSourceMessageDispatcher({ bot, send, reportError, renderError }) {
    return async function dispatchSourceMessage(ctx, chatId) {
        if (chatId > 0 && ctx.ids && (ctx.ids.illust.length > 0 || ctx.ids.novel.length > 0)) {
            const action = ctx.ids.illust.length > 0 ? 'upload_photo' : 'typing'
            bot.api.sendChatAction(chatId, action, ctx.default_extra.message_thread_id ? {
                message_thread_id: ctx.default_extra.message_thread_id
            } : {}).catch(() => {})
        }
        try {
            return await send(ctx)
        } catch (error) {
            await reportError(error, {
                chatId,
                languageCode: ctx.l,
                illustIds: ctx.ids?.illust
            })
            await bot.api.sendMessage(chatId, renderError(ctx.l, error), ctx.default_extra).catch(() => {})
        }
    }
}
