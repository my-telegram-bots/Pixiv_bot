import { catchily } from '#handlers/telegram/sender'
import {
    IllustrationLifecycleState,
    markIllustrationOutputQueued,
    markIllustrationOutputSent,
    markIllustrationPageSent
} from '#handlers/telegram/illustration-lifecycle'

const terminalStates = new Set([
    IllustrationLifecycleState.COMPLETED,
    IllustrationLifecycleState.NOT_FOUND,
    IllustrationLifecycleState.FAILED
])

export function recordPageSent(lifecycle, page) {
    if (terminalStates.has(lifecycle.state)) lifecycle.sentPages.add(page)
    else markIllustrationPageSent(lifecycle, page)
}

export function recordOutputSent(lifecycle, output) {
    if (terminalStates.has(lifecycle.state)) lifecycle.sentOutputs.add(output)
    else markIllustrationOutputSent(lifecycle, output)
}

export function recordOutputQueued(lifecycle, output) {
    if (terminalStates.has(lifecycle.state)) lifecycle.queuedOutputs.add(output)
    else markIllustrationOutputQueued(lifecycle, output)
}

export async function reportIndependentFailure(runtime, error, fields = {}) {
    const errorCode = fields.errorCode || error?.code || 'UNEXPECTED_PROCESSING_FAILURE'
    runtime.deliveryErrors.push(errorCode)
    const result = await catchily(error, runtime.chatId, runtime.ctx.l, {
        notifyUser: false,
        illustIds: fields.illustIds,
        illustId: fields.illustId,
        page: fields.page,
        method: fields.method,
        errorCode,
        failedIndex: fields.failedIndex,
        attempt: fields.attempt
    })
    return result.errorCode
}

export async function runIndependentDeliveryItems(items, handler, onFailure) {
    for (let index = 0; index < items.length; index++) {
        try {
            await handler(items[index], index)
        } catch (error) {
            await onFailure(error, items[index], index)
        }
    }
}
