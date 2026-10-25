import {
    IllustrationLifecycleState,
    createIllustrationLifecycle,
    markIllustrationOutputQueued,
    markIllustrationOutputSent,
    markIllustrationPageSent
} from '#handlers/telegram/illustration-lifecycle'
import { logTelegramFailure } from '#handlers/telegram/delivery-telemetry'

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
    const errorIndex = runtime.deliveryErrors.length
    runtime.deliveryErrors.push(errorCode)
    try {
        const result = await runtime.reportError(error, runtime.chatId, runtime.ctx.l, {
            notifyUser: false,
            ...fields,
            errorCode
        })
        const reportedCode = result?.errorCode || errorCode
        runtime.deliveryErrors[errorIndex] = reportedCode
        return reportedCode
    } catch (reportError) {
        // Reporting is secondary to delivery; keep both failures observable locally.
        logTelegramFailure(runtime.logger, error, { ...fields, errorCode })
        logTelegramFailure(runtime.logger, reportError, {
            ...fields,
            errorCode: 'ADMIN_ERROR_REPORT_FAILED'
        })
        return errorCode
    }
}

export function addResolvedIllustration(runtime, illust) {
    const lifecycle = createIllustrationLifecycle(illust)
    if (runtime.lifecycles.has(lifecycle.id)) return
    runtime.illusts.push(lifecycle.illust)
    runtime.lifecycles.set(lifecycle.id, lifecycle)
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
