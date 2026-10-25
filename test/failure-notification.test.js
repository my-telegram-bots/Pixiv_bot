import test from 'ava'
import {
    FailureNotificationState,
    notifyFailureOnce
} from '../handlers/telegram/failure-notification.js'

function lifecycle(errorCode = 'TELEGRAM_MEDIA_SEND_FAILED') {
    return { errorCode }
}

const quietLogger = { warn() {} }

test('shares a pending notification and marks failureNotified only after send succeeds', async t => {
    const state = lifecycle()
    let release
    let sends = 0
    const send = () => {
        sends++
        return new Promise(resolve => { release = resolve })
    }
    const first = notifyFailureOnce({ lifecycle: state, send, logger: quietLogger })
    const second = notifyFailureOnce({ lifecycle: state, send, logger: quietLogger })
    t.is(first, second)
    t.is(state.failureNotificationState, FailureNotificationState.PENDING)
    t.false(Boolean(state.failureNotified))
    await Promise.resolve()
    t.is(sends, 1)
    release({ message_id: 1 })
    t.is(await first, FailureNotificationState.SENT)
    t.true(state.failureNotified)
    t.is(state.failureNotificationState, FailureNotificationState.SENT)
})

test('retries one confirmed Telegram 4xx rejection at a later boundary', async t => {
    const state = lifecycle()
    let sends = 0
    const send = async () => {
        sends++
        if (sends === 1) throw { error_code: 403, method: 'sendMessage' }
        return { message_id: 2 }
    }
    t.is(await notifyFailureOnce({ lifecycle: state, send, logger: quietLogger }), FailureNotificationState.FAILED)
    t.false(Boolean(state.failureNotified))
    t.true(state.failureNotificationRetryable)
    t.is(await notifyFailureOnce({ lifecycle: state, send, logger: quietLogger }), FailureNotificationState.SENT)
    t.is(sends, 2)
    t.true(state.failureNotified)
})

test('does not resend after an uncertain timeout or server failure', async t => {
    for (const error of [
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', method: 'sendMessage' }),
        { error_code: 503, method: 'sendMessage' }
    ]) {
        const state = lifecycle()
        let sends = 0
        const send = async () => {
            sends++
            throw error
        }
        t.is(await notifyFailureOnce({ lifecycle: state, send, logger: quietLogger }), FailureNotificationState.FAILED)
        t.is(await notifyFailureOnce({ lifecycle: state, send, logger: quietLogger }), FailureNotificationState.FAILED)
        t.is(sends, 1)
        t.false(Boolean(state.failureNotified))
    }
})

test('suppresses the user notification while the flood gate is active', async t => {
    const state = lifecycle('TELEGRAM_FLOOD_GATE_ACTIVE')
    const result = await notifyFailureOnce({
        lifecycle: state,
        send: () => t.fail('flood gate must not send'),
        logger: quietLogger
    })
    t.is(result, FailureNotificationState.SUPPRESSED)
    t.is(state.failureNotificationState, FailureNotificationState.SUPPRESSED)
    t.false(Boolean(state.failureNotified))
})

test('a repeated definite rejection has a strict two-attempt ceiling', async t => {
    const state = lifecycle()
    let sends = 0
    for (let index = 0; index < 4; index++) {
        await notifyFailureOnce({ lifecycle: state, logger: quietLogger, send: async () => {
            sends++
            throw { error_code: 403 }
        } })
    }
    t.is(sends, 2)
    t.false(Boolean(state.failureNotified))
})
