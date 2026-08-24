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

export function createIllustrationLifecycle(illust) {
    if (!illust?.id) {
        throw new Error('Illustration lifecycle requires an illustration with an id')
    }
    return {
        id: illust.id,
        illust,
        state: IllustrationLifecycleState.READY,
        refreshCount: 0,
        sentPages: new Set(),
        sentOutputs: new Set(),
        failedPage: null,
        errorCode: null,
        history: [IllustrationLifecycleState.READY]
    }
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
    if (!illust || illust.id !== lifecycle.id) {
        throw new Error(`Refreshed illustration does not match lifecycle ${lifecycle.id}`)
    }
    return transitionIllustration(lifecycle, IllustrationLifecycleState.RETRYING, {
        illust,
        errorCode: null
    })
}

export function completeIllustration(lifecycle) {
    return transitionIllustration(lifecycle, IllustrationLifecycleState.COMPLETED)
}

export function failIllustration(lifecycle, errorCode = 'ILLUSTRATION_SEND_FAILED') {
    const terminal = errorCode === 'PIXIV_ILLUSTRATION_NOT_FOUND'
        ? IllustrationLifecycleState.NOT_FOUND
        : IllustrationLifecycleState.FAILED
    return transitionIllustration(lifecycle, terminal, { errorCode })
}
