const DEFAULT_GROUP_CAPACITY = 20
const DEFAULT_GROUP_WINDOW_MS = 60_000
const DEFAULT_MAX_FLOOD_WAIT_SECONDS = 10

export const TELEGRAM_FLOOD_GATE_ACTIVE = 'TELEGRAM_FLOOD_GATE_ACTIVE'

const nonDeliveryMethods = new Set(['sendChatAction', 'setMessageReaction'])
const defaultSchedule = (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs)
    timer.unref?.()
    return timer
}

function chatIdFromPayload(payload) {
    const chatId = Number(payload?.chat_id)
    return Number.isSafeInteger(chatId) ? chatId : null
}

function abortableWait(delayMs, signal) {
    if (delayMs <= 0) return Promise.resolve()
    return new Promise((resolve, reject) => {
        const timer = setTimeout(finish, delayMs)
        signal?.addEventListener('abort', abort, { once: true })

        function finish() {
            signal?.removeEventListener('abort', abort)
            resolve()
        }

        function abort() {
            clearTimeout(timer)
            reject(Object.assign(new Error('Telegram transport wait aborted'), {
                code: 'TELEGRAM_REQUEST_ABORTED'
            }))
        }
    })
}

export function telegramDeliveryWeight(method, payload, capacity = DEFAULT_GROUP_CAPACITY) {
    if (method !== 'sendMediaGroup' || !Array.isArray(payload?.media)) return 1
    return Math.max(1, Math.min(capacity, payload.media.length))
}

export function createTelegramMediaWeightGate(options = {}) {
    const capacity = options.capacity || DEFAULT_GROUP_CAPACITY
    const windowMs = options.windowMs || DEFAULT_GROUP_WINDOW_MS
    const now = options.now || Date.now
    const wait = options.wait || abortableWait
    const schedule = options.schedule || defaultSchedule
    const states = new Map()

    async function reserve(chatId, weight, signal) {
        while (true) {
            const currentTime = now()
            let state = states.get(chatId)
            if (!state || currentTime >= state.resetAt) {
                state = { available: capacity, resetAt: currentTime + windowMs }
                states.set(chatId, state)
                schedule(() => {
                    if (states.get(chatId) === state && now() >= state.resetAt) {
                        states.delete(chatId)
                    }
                }, windowMs)
            }
            if (state.available >= weight) {
                state.available -= weight
                return
            }
            await wait(Math.max(0, state.resetAt - currentTime), signal)
        }
    }

    return async (previous, method, payload, signal) => {
        const chatId = chatIdFromPayload(payload)
        if (chatId === null || chatId >= 0 || nonDeliveryMethods.has(method)) {
            return previous(method, payload, signal)
        }
        await reserve(chatId, telegramDeliveryWeight(method, payload, capacity), signal)
        return previous(method, payload, signal)
    }
}

function floodGateResponse(retryAfter) {
    return {
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: shared flood gate is active',
        parameters: {
            retry_after: retryAfter,
            flood_gate: true
        }
    }
}

export function createTelegramFloodGate(options = {}) {
    const maxWaitSeconds = options.maxWaitSeconds ?? DEFAULT_MAX_FLOOD_WAIT_SECONDS
    const now = options.now || Date.now
    const wait = options.wait || abortableWait
    const schedule = options.schedule || defaultSchedule
    const blockedUntil = new Map()

    function block(chatId, deadline) {
        blockedUntil.set(chatId, Math.max(blockedUntil.get(chatId) || 0, deadline))
        schedule(function cleanup() {
            const remainingMs = (blockedUntil.get(chatId) || 0) - now()
            if (remainingMs > 0) {
                schedule(cleanup, remainingMs)
            } else {
                blockedUntil.delete(chatId)
            }
        }, Math.max(0, deadline - now()))
    }

    return async (previous, method, payload, signal) => {
        const chatId = chatIdFromPayload(payload)
        if (chatId === null || nonDeliveryMethods.has(method)) {
            return previous(method, payload, signal)
        }

        while (true) {
            const remainingMs = Math.max(0, (blockedUntil.get(chatId) || 0) - now())
            if (remainingMs <= 0) break
            const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000))
            if (retryAfter > maxWaitSeconds) {
                return floodGateResponse(retryAfter)
            }
            await wait(remainingMs, signal)
        }

        const response = await previous(method, payload, signal)
        const retryAfter = Number(response?.parameters?.retry_after)
        if (response?.error_code === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
            block(chatId, now() + retryAfter * 1000)
        }
        return response
    }
}

export function createTelegramDeliveryGate(options = {}) {
    const weighted = createTelegramMediaWeightGate(options.mediaWeight)
    const flood = createTelegramFloodGate(options.flood)
    return (previous, method, payload, signal) => flood(
        (nextMethod, nextPayload, nextSignal) => weighted(
            previous,
            nextMethod,
            nextPayload,
            nextSignal
        ),
        method,
        payload,
        signal
    )
}
