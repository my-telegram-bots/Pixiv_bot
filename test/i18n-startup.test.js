import test from 'ava'
import { _l, _lr } from '../handlers/telegram/i18n.js'
import { createSettingsMiniAppLifecycle } from '../handlers/telegram/settings-mini-app-lifecycle.js'

const CLOSE_BUTTONS = {
    en: '✕ Close',
    ja: '✕ 閉じる',
    'zh-hans': '✕ 关闭',
    'zh-hant': '✕ 關閉'
}

test('i18n tables are synchronously ready before Mini App lifecycle construction', t => {
    for (const [language, expected] of Object.entries(CLOSE_BUTTONS)) {
        t.is(_lr(language, 'setting_mini_app_close_button'), expected)
    }

    t.notThrows(() => createSettingsMiniAppLifecycle({
        bot: { api: {} },
        store: { collection: { chat_setting: {} } }
    }))
})

test('i18n falls back to English without crashing on unsupported locales or keys', t => {
    t.is(_lr('ko', 'setting_mini_app_close_button'), CLOSE_BUTTONS.en)
    t.is(_l(undefined, 'setting_mini_app_close_button'), CLOSE_BUTTONS.en)
    t.is(_l('en', 'unknown_message_key'), 'unknown_message_key')
    t.is(_lr('en', 'unknown_message_key'), 'unknown_message_key')
})
