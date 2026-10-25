import test from 'ava'
import { createUpdateRunnerLifecycle } from '../update-runner-lifecycle.js'

test('shutdown drains updates before background work and database closure', async t => {
    const calls = []
    const lifecycle = createUpdateRunnerLifecycle({
        getRunner: () => ({ stop: async () => calls.push('runner') }),
        stopBackground: async () => calls.push('background'),
        closeDatabase: async () => calls.push('database'),
        log: { log() {}, error() {} },
        exit: code => calls.push(`exit:${code}`)
    })

    await lifecycle.shutdown('SIGTERM')

    t.deepEqual(calls, ['runner', 'background', 'database', 'exit:0'])
})

test('shutdown is idempotent across repeated signals', async t => {
    const calls = []
    let release
    const runnerStopped = new Promise(resolve => { release = resolve })
    const lifecycle = createUpdateRunnerLifecycle({
        getRunner: () => ({ stop: async () => {
            calls.push('runner')
            await runnerStopped
        } }),
        stopBackground: async () => calls.push('background'),
        closeDatabase: async () => calls.push('database'),
        log: { log() {}, error() {} },
        exit: code => calls.push(`exit:${code}`)
    })

    const first = lifecycle.shutdown('SIGTERM')
    const second = lifecycle.shutdown('SIGINT')
    t.is(first, second)
    t.true(lifecycle.isStopping())
    release()
    await first

    t.deepEqual(calls, ['runner', 'background', 'database', 'exit:0'])
})

test('shutdown still closes the database when an earlier stop fails', async t => {
    const calls = []
    const lifecycle = createUpdateRunnerLifecycle({
        getRunner: () => ({ stop: async () => {
            calls.push('runner')
            throw new Error('runner failure')
        } }),
        stopBackground: async () => calls.push('background'),
        closeDatabase: async () => calls.push('database'),
        log: { log() {}, error() {} },
        exit: code => calls.push(`exit:${code}`)
    })

    await lifecycle.shutdown('SIGTERM')

    t.deepEqual(calls, ['runner', 'background', 'database', 'exit:1'])
})

test('early shutdown waits for startup before closing the database', async t => {
    const calls = []
    let completeStartup
    let backgroundStarted
    const startup = new Promise(resolve => { completeStartup = resolve })
    const background = new Promise(resolve => { backgroundStarted = resolve })
    const lifecycle = createUpdateRunnerLifecycle({
        getRunner: () => undefined,
        stopBackground: async () => {
            calls.push('background')
            backgroundStarted()
        },
        waitForStartup: async () => startup,
        closeDatabase: async () => calls.push('database'),
        log: { log() {}, error() {} },
        exit: code => calls.push(`exit:${code}`)
    })

    const shutdown = lifecycle.shutdown('SIGTERM')
    await background
    t.deepEqual(calls, ['background'])
    completeStartup()
    await shutdown

    t.deepEqual(calls, ['background', 'database', 'exit:0'])
})
