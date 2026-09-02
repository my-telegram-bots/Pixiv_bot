import { randomBytes, randomInt } from 'node:crypto'

const MIN_REQUEST_ID = 1
const MAX_REQUEST_ID_EXCLUSIVE = 2147483648

function defaultToken() {
    return randomBytes(32).toString('base64url')
}

function sessionKey(userId, requestId) {
    return `${userId}:${requestId}`
}

export function createSettingsMiniAppSessionStore({
    clock = () => Date.now(),
    ttlMs = 15 * 60 * 1000,
    maxSessions = 1000,
    tokenFactory = defaultToken,
    requestIdFactory = () => randomInt(MIN_REQUEST_ID, MAX_REQUEST_ID_EXCLUSIVE)
} = {}) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('ttlMs must be positive')
    if (!Number.isInteger(maxSessions) || maxSessions <= 0) {
        throw new Error('maxSessions must be a positive integer')
    }

    const editSessions = new Map()
    const selectionSessions = new Map()
    let sequence = 0

    function isExpired(session) {
        return session.expiresAt <= clock()
    }

    function purgeExpired() {
        for (const [token, session] of editSessions) {
            if (isExpired(session)) editSessions.delete(token)
        }
        for (const [key, session] of selectionSessions) {
            if (isExpired(session)) selectionSessions.delete(key)
        }
    }

    function enforceLimit() {
        purgeExpired()
        while (editSessions.size + selectionSessions.size > maxSessions) {
            let oldest = null
            for (const [key, session] of editSessions) {
                if (!oldest || session.sequence < oldest.session.sequence) {
                    oldest = { collection: editSessions, key, session }
                }
            }
            for (const [key, session] of selectionSessions) {
                if (!oldest || session.sequence < oldest.session.sequence) {
                    oldest = { collection: selectionSessions, key, session }
                }
            }
            if (!oldest) break
            oldest.collection.delete(oldest.key)
        }
    }

    function createEditSession({ userId, targetId, targetType }) {
        purgeExpired()
        let token
        for (let attempt = 0; attempt < 64; attempt += 1) {
            token = tokenFactory()
            if (typeof token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(token) &&
                !editSessions.has(token)) break
            token = null
        }
        if (!token) throw new Error('Unable to allocate Mini App edit session')
        const session = {
            token,
            userId: Number(userId),
            targetId: Number(targetId),
            targetType,
            expiresAt: clock() + ttlMs,
            sequence: sequence++
        }
        editSessions.set(token, session)
        enforceLimit()
        return { ...session }
    }

    function getEditSession(token, userId) {
        purgeExpired()
        const session = editSessions.get(token)
        return session && session.userId === Number(userId) ? { ...session } : null
    }

    function consumeEditSession(token, userId) {
        const session = getEditSession(token, userId)
        if (!session) return null
        editSessions.delete(token)
        return session
    }

    function revokeEditSession(token) {
        editSessions.delete(token)
    }

    function createSelectionSession({ userId, expectedType }) {
        purgeExpired()
        let requestId
        for (let attempt = 0; attempt < 64; attempt += 1) {
            requestId = requestIdFactory()
            if (Number.isInteger(requestId) && requestId >= -2147483648 &&
                requestId <= 2147483647 &&
                !selectionSessions.has(sessionKey(userId, requestId))) break
            requestId = null
        }
        if (requestId === null) throw new Error('Unable to allocate Mini App chat request')
        const key = sessionKey(userId, requestId)
        const session = {
            requestId,
            userId: Number(userId),
            expectedType,
            expiresAt: clock() + ttlMs,
            sequence: sequence++
        }
        selectionSessions.set(key, session)
        enforceLimit()
        return { ...session }
    }

    function consumeSelectionSession(requestId, userId) {
        purgeExpired()
        const key = sessionKey(userId, requestId)
        const session = selectionSessions.get(key)
        if (!session) return null
        selectionSessions.delete(key)
        return { ...session }
    }

    function revokeSelectionSession(requestId, userId) {
        selectionSessions.delete(sessionKey(userId, requestId))
    }

    return {
        createEditSession,
        getEditSession,
        consumeEditSession,
        revokeEditSession,
        createSelectionSession,
        consumeSelectionSession,
        revokeSelectionSession
    }
}
