import test from 'ava'
import { ConfigValidator } from '../handlers/utils/config-validator.js'

function config(mediaCacheChatIds) {
    return {
        mongodb: { uri: 'mongodb://127.0.0.1:27017', dbname: 'pixiv_bot' },
        pixiv: { cookie: 'cookie', ua: 'ua' },
        tg: {
            token: '1:test-token',
            master_id: 1,
            media_cache_chat_ids: mediaCacheChatIds
        },
        web: { enabled: false }
    }
}

test('Telegram media cache channel IDs accept a unique negative integer array', t => {
    const validation = new ConfigValidator().validateConfig(config([-1001, -1002]))
    t.true(validation.isValid)
})

for (const invalid of [[1], [-1001, -1001], ['-1001'], null]) {
    test(`Telegram media cache channel IDs reject ${JSON.stringify(invalid)}`, t => {
        const validation = new ConfigValidator().validateConfig(config(invalid))
        t.false(validation.isValid)
        t.true(validation.errors.some(error => error.includes('media cache chat IDs')))
    })
}
