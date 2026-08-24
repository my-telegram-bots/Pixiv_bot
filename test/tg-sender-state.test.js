import test from 'ava'
import { readFileSync } from 'node:fs'
import {
    TgSenderState,
    createTgSenderMachine,
    failTgSender,
    runTgSenderStateMachine,
    summarizeTgSenderResult,
    transitionTgSender
} from '../handlers/telegram/tg-sender-state.js'

const happyPath = [
    TgSenderState.COLLECTING_ILLUSTRATIONS,
    TgSenderState.SENDING_ILLUSTRATIONS,
    TgSenderState.SENDING_NOVELS,
    TgSenderState.NOTIFYING_FANBOX,
    TgSenderState.COMPLETED
]

test('Telegram sender follows the complete ordered state path', t => {
    const machine = createTgSenderMachine()

    for (const state of happyPath) {
        transitionTgSender(machine, state)
    }

    t.is(machine.state, TgSenderState.COMPLETED)
    t.deepEqual(machine.history, [TgSenderState.INITIALIZING, ...happyPath])
})

test('Telegram sender can fail from every active state', t => {
    for (let index = 0; index < happyPath.length; index++) {
        const machine = createTgSenderMachine()
        for (const state of happyPath.slice(0, index)) {
            transitionTgSender(machine, state)
        }

        failTgSender(machine)
        t.is(machine.state, TgSenderState.FAILED)
        t.is(failTgSender(machine), machine)
    }
})

test('Telegram sender rejects skipped, reversed, terminal, and unknown transitions', t => {
    const skipped = createTgSenderMachine()
    t.throws(
        () => transitionTgSender(skipped, TgSenderState.SENDING_ILLUSTRATIONS),
        { message: /Illegal Telegram sender transition/ }
    )

    const completed = createTgSenderMachine()
    for (const state of happyPath) {
        transitionTgSender(completed, state)
    }
    t.throws(
        () => transitionTgSender(completed, TgSenderState.INITIALIZING),
        { message: /Illegal Telegram sender transition/ }
    )

    t.throws(
        () => transitionTgSender({ state: 'missing', history: [] }, TgSenderState.FAILED),
        { message: /Unknown Telegram sender state/ }
    )
    t.throws(
        () => transitionTgSender(createTgSenderMachine(), 'missing'),
        { message: /Unknown Telegram sender state/ }
    )
})

test('Telegram sender implementation stays outside app.js', t => {
    const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
    const senderSource = readFileSync(
        new URL('../handlers/telegram/tg-sender.js', import.meta.url),
        'utf8'
    )

    t.false(appSource.includes('export async function tg_sender'))
    t.true(appSource.includes("import { createTgSender } from '#handlers/telegram/tg-sender'"))
    t.true(senderSource.includes('export function createTgSender'))
})

test('Telegram sender runner invokes phases in order with one shared runtime', async t => {
    const machine = createTgSenderMachine()
    const runtime = { requestId: 'request-1' }
    const calls = []
    const phase = name => async value => {
        calls.push(name)
        t.is(value, runtime)
    }

    const result = await runTgSenderStateMachine(machine, {
        initialize: async () => {
            calls.push('initialize')
            return runtime
        },
        collectIllustrations: phase('collectIllustrations'),
        sendIllustrations: phase('sendIllustrations'),
        sendNovels: phase('sendNovels'),
        notifyFanbox: phase('notifyFanbox')
    })

    t.is(result, runtime)
    t.deepEqual(calls, [
        'initialize',
        'collectIllustrations',
        'sendIllustrations',
        'sendNovels',
        'notifyFanbox'
    ])
    t.is(machine.state, TgSenderState.COMPLETED)
})

test('Telegram sender runner stops and preserves errors from every phase', async t => {
    const phaseNames = [
        'initialize',
        'collectIllustrations',
        'sendIllustrations',
        'sendNovels',
        'notifyFanbox'
    ]

    for (const failingPhase of phaseNames) {
        const machine = createTgSenderMachine()
        const calls = []
        const failure = new Error(`${failingPhase} failed`)
        const phases = Object.fromEntries(phaseNames.map(name => [name, async () => {
            calls.push(name)
            if (name === failingPhase) {
                throw failure
            }
            return {}
        }]))

        const error = await t.throwsAsync(() => runTgSenderStateMachine(machine, phases))
        const failingIndex = phaseNames.indexOf(failingPhase)

        t.is(error, failure)
        t.deepEqual(calls, phaseNames.slice(0, failingIndex + 1))
        t.is(machine.state, TgSenderState.FAILED)
        t.is(machine.history.at(-1), TgSenderState.FAILED)
    }
})

test('Telegram sender result exposes handled delivery failures to callers', t => {
    t.deepEqual(summarizeTgSenderResult({
        lifecycles: new Map([[1, { state: 'completed', errorCode: null }]]),
        deliveryErrors: []
    }), { ok: true, errorCode: null })

    t.deepEqual(summarizeTgSenderResult({
        lifecycles: new Map([[1, { state: 'failed', errorCode: 'PIXIV_MEDIA_STALE' }]]),
        deliveryErrors: []
    }), { ok: false, errorCode: 'PIXIV_MEDIA_STALE' })

    t.deepEqual(summarizeTgSenderResult({
        lifecycles: new Map(),
        deliveryErrors: ['PIXIV_NOVEL_NOT_FOUND']
    }), { ok: false, errorCode: 'PIXIV_NOVEL_NOT_FOUND' })
})
