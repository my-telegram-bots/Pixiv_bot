export const IllustrationLifecycleState = Object.freeze({
    READY: 'ready',
    SENDING: 'sending',
    REFRESHING: 'refreshing',
    RETRYING: 'retrying',
    COMPLETED: 'completed',
    NOT_FOUND: 'not_found',
    FAILED: 'failed'
})

const terminalStates = new Set([
    IllustrationLifecycleState.COMPLETED,
    IllustrationLifecycleState.NOT_FOUND,
    IllustrationLifecycleState.FAILED
])

const transitions = Object.freeze({
    [IllustrationLifecycleState.READY]: new Set([
        IllustrationLifecycleState.SENDING,
        IllustrationLifecycleState.NOT_FOUND,
        IllustrationLifecycleState.FAILED
    ]),
    [IllustrationLifecycleState.SENDING]: new Set([
        IllustrationLifecycleState.REFRESHING,
        IllustrationLifecycleState.COMPLETED,
        IllustrationLifecycleState.NOT_FOUND,
        IllustrationLifecycleState.FAILED
    ]),
    [IllustrationLifecycleState.REFRESHING]: new Set([
        IllustrationLifecycleState.RETRYING,
        IllustrationLifecycleState.NOT_FOUND,
        IllustrationLifecycleState.FAILED
    ]),
    [IllustrationLifecycleState.RETRYING]: new Set([
        IllustrationLifecycleState.COMPLETED,
        IllustrationLifecycleState.NOT_FOUND,
        IllustrationLifecycleState.FAILED
    ]),
    [IllustrationLifecycleState.COMPLETED]: new Set(),
    [IllustrationLifecycleState.NOT_FOUND]: new Set(),
    [IllustrationLifecycleState.FAILED]: new Set()
})

function normalizeIllustrationIdentity(illust) {
    const id = Number(illust?.id)
    if (!Number.isSafeInteger(id) || id <= 0) return null
    return {
        ...illust,
        id,
        ...(Array.isArray(illust.mediagroup) && {
            mediagroup: illust.mediagroup.map(item => ({ ...item, id }))
        })
    }
}

export function createIllustrationLifecycle(illust) {
    const normalized = normalizeIllustrationIdentity(illust)
    if (!normalized) {
        throw new Error('Illustration lifecycle requires an illustration with an id')
    }
    return {
        id: normalized.id,
        illust: normalized,
        state: IllustrationLifecycleState.READY,
        refreshCount: 0,
        sentPages: new Set(),
        queuedOutputs: new Set(),
        sentOutputs: new Set(),
        deliveryFailures: [],
        failedPage: null,
        errorCode: null,
        history: [IllustrationLifecycleState.READY]
    }
}

export function recordIllustrationDeliveryFailure(
    lifecycle,
    errorCode = 'ILLUSTRATION_SEND_FAILED',
    details = {}
) {
    lifecycle.deliveryFailures.push({ errorCode, ...details })
    lifecycle.errorCode ||= errorCode
    Object.assign(lifecycle, details)
    return lifecycle
}

export function transitionIllustration(lifecycle, nextState, details = {}) {
    if (!lifecycle || !transitions[lifecycle.state]) {
        throw new Error(`Unknown illustration state: ${lifecycle?.state}`)
    }
    if (!transitions[nextState]) {
        throw new Error(`Unknown illustration state: ${nextState}`)
    }
    if (!transitions[lifecycle.state].has(nextState)) {
        throw new Error(`Illegal illustration transition: ${lifecycle.state} -> ${nextState}`)
    }
    lifecycle.state = nextState
    lifecycle.history.push(nextState)
    Object.assign(lifecycle, details)
    return lifecycle
}

export function beginIllustrationSend(lifecycle) {
    return transitionIllustration(lifecycle, IllustrationLifecycleState.SENDING)
}

export function markIllustrationPageSent(lifecycle, page) {
    if (terminalStates.has(lifecycle.state)) {
        throw new Error(`Cannot record a sent page in terminal state: ${lifecycle.state}`)
    }
    lifecycle.sentPages.add(page)
    lifecycle.failedPage = null
    return lifecycle
}

export function markIllustrationOutputSent(lifecycle, output) {
    if (terminalStates.has(lifecycle.state)) {
        throw new Error(`Cannot record output in terminal state: ${lifecycle.state}`)
    }
    lifecycle.sentOutputs.add(output)
    return lifecycle
}

export function markIllustrationOutputQueued(lifecycle, output) {
    if (terminalStates.has(lifecycle.state)) {
        throw new Error(`Cannot queue output in terminal state: ${lifecycle.state}`)
    }
    lifecycle.queuedOutputs.add(output)
    return lifecycle
}

export function pendingIllustrationPages(lifecycle) {
    return lifecycle.illust.mediagroup
        .map((_, page) => page)
        .filter(page => !lifecycle.sentPages.has(page))
}

export function replaceRefreshedAlbumItems(mediaGroup, refreshed) {
    for (let index = 0; index < mediaGroup.length; index++) {
        const item = mediaGroup[index]
        if (item.id !== refreshed.id) continue
        const replacement = refreshed.mediagroup.find(candidate => candidate.p === item.p)
        if (replacement) mediaGroup[index] = replacement
    }
}

export function beginIllustrationRefresh(lifecycle, failedPage = null) {
    if (terminalStates.has(lifecycle.state) || lifecycle.refreshCount >= 1) {
        return false
    }
    transitionIllustration(lifecycle, IllustrationLifecycleState.REFRESHING, {
        refreshCount: lifecycle.refreshCount + 1,
        failedPage
    })
    return true
}

export function applyIllustrationRefresh(lifecycle, illust) {
    const normalized = normalizeIllustrationIdentity(illust)
    if (!normalized || normalized.id !== lifecycle.id) {
        const error = new Error(`Refreshed illustration does not match lifecycle ${lifecycle.id}`)
        error.code = 'ILLUSTRATION_REFRESH_ID_MISMATCH'
        throw error
    }
    return transitionIllustration(lifecycle, IllustrationLifecycleState.RETRYING, {
        illust: normalized,
        errorCode: null
    })
}

export function completeIllustration(lifecycle) {
    return transitionIllustration(lifecycle, IllustrationLifecycleState.COMPLETED)
}

export function failIllustration(lifecycle, errorCode = 'ILLUSTRATION_SEND_FAILED', details = {}) {
    const terminal = errorCode === 'PIXIV_ILLUSTRATION_NOT_FOUND'
        ? IllustrationLifecycleState.NOT_FOUND
        : IllustrationLifecycleState.FAILED
    return transitionIllustration(lifecycle, terminal, { errorCode, ...details })
}
