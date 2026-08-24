export const TgSenderState = Object.freeze({
    INITIALIZING: 'initializing',
    COLLECTING_ILLUSTRATIONS: 'collecting_illustrations',
    SENDING_ILLUSTRATIONS: 'sending_illustrations',
    SENDING_NOVELS: 'sending_novels',
    NOTIFYING_FANBOX: 'notifying_fanbox',
    COMPLETED: 'completed',
    FAILED: 'failed'
})

const transitions = Object.freeze({
    [TgSenderState.INITIALIZING]: new Set([
        TgSenderState.COLLECTING_ILLUSTRATIONS,
        TgSenderState.FAILED
    ]),
    [TgSenderState.COLLECTING_ILLUSTRATIONS]: new Set([
        TgSenderState.SENDING_ILLUSTRATIONS,
        TgSenderState.FAILED
    ]),
    [TgSenderState.SENDING_ILLUSTRATIONS]: new Set([
        TgSenderState.SENDING_NOVELS,
        TgSenderState.FAILED
    ]),
    [TgSenderState.SENDING_NOVELS]: new Set([
        TgSenderState.NOTIFYING_FANBOX,
        TgSenderState.FAILED
    ]),
    [TgSenderState.NOTIFYING_FANBOX]: new Set([
        TgSenderState.COMPLETED,
        TgSenderState.FAILED
    ]),
    [TgSenderState.COMPLETED]: new Set(),
    [TgSenderState.FAILED]: new Set()
})

export function createTgSenderMachine() {
    return {
        state: TgSenderState.INITIALIZING,
        history: [TgSenderState.INITIALIZING]
    }
}

export function transitionTgSender(machine, nextState) {
    if (!machine || !transitions[machine.state]) {
        throw new Error(`Unknown Telegram sender state: ${machine?.state}`)
    }
    if (!transitions[nextState]) {
        throw new Error(`Unknown Telegram sender state: ${nextState}`)
    }
    if (!transitions[machine.state].has(nextState)) {
        throw new Error(`Illegal Telegram sender transition: ${machine.state} -> ${nextState}`)
    }

    machine.state = nextState
    machine.history.push(nextState)
    return machine
}

export function failTgSender(machine) {
    if (machine.state === TgSenderState.FAILED) {
        return machine
    }
    return transitionTgSender(machine, TgSenderState.FAILED)
}

export async function runTgSenderStateMachine(machine, phases) {
    try {
        const runtime = await phases.initialize()
        transitionTgSender(machine, TgSenderState.COLLECTING_ILLUSTRATIONS)
        await phases.collectIllustrations(runtime)
        transitionTgSender(machine, TgSenderState.SENDING_ILLUSTRATIONS)
        await phases.sendIllustrations(runtime)
        transitionTgSender(machine, TgSenderState.SENDING_NOVELS)
        await phases.sendNovels(runtime)
        transitionTgSender(machine, TgSenderState.NOTIFYING_FANBOX)
        await phases.notifyFanbox(runtime)
        transitionTgSender(machine, TgSenderState.COMPLETED)
        return runtime
    } catch (error) {
        failTgSender(machine)
        throw error
    }
}

export function summarizeTgSenderResult(runtime) {
    const failedIllustration = [...runtime.lifecycles.values()].find(
        lifecycle => lifecycle.state !== 'completed'
    )
    const errorCode = failedIllustration?.errorCode || runtime.deliveryErrors[0] || null
    return { ok: errorCode === null, errorCode }
}
