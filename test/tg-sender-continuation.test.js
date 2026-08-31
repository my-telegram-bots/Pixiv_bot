import test from 'ava'
import { runIndependentDeliveryItems } from '../handlers/telegram/tg-sender-continuation.js'

test('one independent delivery failure does not block later work', async t => {
    const attempted = []
    const failures = []
    await runIndependentDeliveryItems([101, 102, 103], async id => {
        attempted.push(id)
        if (id === 102) throw Object.assign(new Error('permission denied'), {
            code: 'TELEGRAM_PERMISSION_DENIED'
        })
    }, async (error, id, index) => {
        failures.push({ id, index, code: error.code })
    })

    t.deepEqual(attempted, [101, 102, 103])
    t.deepEqual(failures, [{ id: 102, index: 1, code: 'TELEGRAM_PERMISSION_DENIED' }])
})
