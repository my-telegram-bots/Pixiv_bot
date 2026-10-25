// Queue complete deliveries, not individual API calls or source update handlers.
export function createChatDeliveryQueue() {
    const tails = new Map()

    function run(chatId, work) {
        if (chatId === undefined || chatId === null) {
            return Promise.reject(new TypeError('Delivery requires a destination chat'))
        }
        const key = String(chatId)
        const previous = tails.get(key) || Promise.resolve()
        const result = previous.then(work)
        // A failed delivery must not poison the following request's queue.
        const tail = result.then(() => undefined, () => undefined).finally(() => {
            if (tails.get(key) === tail) tails.delete(key)
        })
        tails.set(key, tail)
        return result
    }

    return { run, get chatCount() { return tails.size } }
}
