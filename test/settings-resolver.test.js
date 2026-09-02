import test from 'ava'
import { readFileSync } from 'node:fs'
import { createSettingsLifecycle } from '../handlers/telegram/settings-lifecycle.js'
import {
    applyTelegraphValues,
    createDefaultUserSettings,
    mergeStoredSetting,
    resolveRequestSettings,
    sanitizeSettingObject,
    selectStoredSetting,
    shouldQueryUserSetting
} from '../handlers/telegram/settings-resolver.js'
import { parseSettingsInput } from '../handlers/telegram/settings-command-parser.js'

test('default settings are fresh and preserve the established request defaults', t => {
    const first = createDefaultUserSettings()
    const second = createDefaultUserSettings()

    t.not(first, second)
    t.not(first.setting, second.setting)
    t.not(first.setting.default, second.setting.default)
    t.deepEqual(first, {
        setting: {
            format: { message: false, mediagroup_message: false, inline: false },
            default: {
                open: true,
                share: true,
                show_id: true,
                album: true,
                single_caption: true,
                album_one: true
            },
            dbless: true
        },
        q_id: 0
    })
})

test('setting flags preserve aliases, disable priority, and inverted removal semantics', t => {
    const defaults = { tags: false, remove_keyboard: false, description: true }
    const resolve = text => resolveRequestSettings({
        ...createDefaultUserSettings(),
        setting: { default: defaults }
    }, parseSettingsInput(text), 'private', { id: 1 })

    t.true(resolve('+tag').tags)
    t.false(resolve('+tags -tag').tags)
    t.true(resolve('-kb').remove_keyboard)
    t.false(resolve('-kb +kb').remove_keyboard)
    t.true(resolve('').description)
    t.false(resolve('+tagged').tags)
})

test('dependent settings normalize in the established order', t => {
    const base = createDefaultUserSettings()
    base.setting.default = {
        open: true,
        share: true,
        album: false,
        album_one: false,
        album_equal: false,
        single_caption: false
    }

    const telegraph = resolveRequestSettings(base, parseSettingsInput('+graph -tags'), 'private', { id: 1 })
    t.true(telegraph.telegraph)
    t.true(telegraph.album)
    t.true(telegraph.tags)

    const append = resolveRequestSettings(base, parseSettingsInput('+afi +file'), 'private', { id: 1 })
    t.true(append.append_file_immediate)
    t.true(append.append_file)
    t.false(append.asfile)

    const fileOnly = resolveRequestSettings(base, parseSettingsInput('+file'), 'private', { id: 1 })
    t.true(fileOnly.asfile)
    t.false(fileOnly.album)
    t.false(fileOnly.album_one)
    t.false(fileOnly.album_equal)
    t.false(fileOnly.single_caption)

    const storedAppend = createDefaultUserSettings()
    storedAppend.setting.default.append_file = true
    storedAppend.setting.default.append_file_immediate = true
    const forcedFileOnly = resolveRequestSettings(
        storedAppend,
        parseSettingsInput('+file'),
        'private',
        { id: 1 }
    )
    t.true(forcedFileOnly.asfile)
    t.false(forcedFileOnly.append_file)
    t.false(forcedFileOnly.append_file_immediate)

    const channel = resolveRequestSettings(base, parseSettingsInput('+share'), 'channel', { id: -1 })
    t.false(channel.share)
    const inline = resolveRequestSettings(base, parseSettingsInput('+sc'), 'inline', null)
    t.false(inline.single_caption)
})

test('special setting controls preserve their established conflict priority', t => {
    const base = createDefaultUserSettings()
    base.setting.default = { overwrite: false }
    const resolved = resolveRequestSettings(
        base,
        parseSettingsInput('+rm -rm +overwrite, -overwrite;'),
        'group',
        { id: -1 }
    )

    t.true(resolved.remove_caption)
    t.true(resolved.remove_keyboard)
    t.true(resolved.overwrite)
})

test('stored setting selection preserves current chat and user precedence', t => {
    const chat = {
        id: -10,
        default: { overwrite: false, album: false }
    }
    const user = { id: 7, default: { album: true } }

    t.true(shouldQueryUserSetting(-10, parseSettingsInput(''), chat))
    t.false(shouldQueryUserSetting(-10, parseSettingsInput(''), {
        ...chat,
        default: { overwrite: true }
    }))
    t.true(shouldQueryUserSetting(-10, parseSettingsInput('+god'), {
        ...chat,
        default: { overwrite: true }
    }))
    t.true(shouldQueryUserSetting(-10, parseSettingsInput('+god,'), {
        ...chat,
        default: { overwrite: true }
    }))
    t.is(selectStoredSetting(null, user), null)
    t.is(selectStoredSetting(chat, user), user)

    const merged = mergeStoredSetting(createDefaultUserSettings(), chat)
    t.false(merged.setting.dbless)
    t.true(merged.setting.default.open)
    t.false(merged.setting.default.album)
    t.false(Object.hasOwn(merged.setting, 'id'))
})

test('Telegraph values validate limits and retain stored metadata', t => {
    const settings = createDefaultUserSettings()
    settings.setting.default.telegraph_title = 'Stored title'

    const inherited = applyTelegraphValues(settings, {})
    t.is(inherited.settings.telegraph_title, 'Stored title')
    t.true(inherited.settings.value_update_flag)
    t.is(applyTelegraphValues(settings, { title: 'x'.repeat(256) }).error, 'title_too_long')
    t.is(applyTelegraphValues(settings, { author_url: 'not a URL' }).error, 'author_invalid')
})

test('import sanitization recursively removes dangerous keys', t => {
    const input = JSON.parse('{"default":{"album":true,"constructor":{"bad":true}},"prototype":1}')
    const sanitized = sanitizeSettingObject(input)

    t.true(sanitized.default.album)
    t.false(Object.hasOwn(sanitized.default, 'constructor'))
    t.false(Object.hasOwn(sanitized, 'prototype'))
    t.is(Object.getPrototypeOf(sanitized), null)
})

function createLifecycleFixture({ chatSetting = null, userSetting = null } = {}) {
    const queries = []
    const updates = []
    const deletes = []
    const messages = []
    const store = {
        collection: {
            chat_setting: {
                async findOne({ id }) {
                    queries.push(id)
                    return id < 0 ? chatSetting : userSetting
                }
            }
        },
        async update_setting(setting, chatId, effectiveSettings) {
            updates.push({ setting, chatId, effectiveSettings })
            return true
        },
        async delete_setting(chatId) {
            deletes.push(chatId)
        }
    }
    const bot = {
        api: {
            async sendMessage(...args) {
                messages.push(args)
            },
            async getChatMember() {
                return { status: 'administrator' }
            }
        }
    }
    const logger = { dev() {}, warn() {} }
    const localize = (language, key) => key
    const lifecycle = createSettingsLifecycle({ bot, store, logger, localize })
    return { lifecycle, bot, queries, updates, deletes, messages }
}

test('settings lifecycle resolves stored precedence and writes the middleware contract', async t => {
    const fixture = createLifecycleFixture({
        chatSetting: {
            id: -10,
            default: { overwrite: false, album: false }
        },
        userSetting: { id: 7, default: { album: true, tags: true } }
    })
    const ctx = {
        chat_id: -10,
        user_id: 7,
        text: '',
        chat: { id: -10, type: 'supergroup' },
        from: { id: 7 }
    }

    const settings = await fixture.lifecycle.resolveUserSettings(ctx)

    t.deepEqual(fixture.queries, [-10, 7])
    t.is(ctx.us, settings)
    t.true(settings.album)
    t.true(settings.tags)
    t.false(Object.hasOwn(settings.setting, 'link_chat_list'))
})

test('settings lifecycle owns reset and save persistence without command fallthrough', async t => {
    const fixture = createLifecycleFixture()
    const baseContext = {
        chat_id: 7,
        chat: { id: 7, type: 'private' },
        from: { id: 7 },
        message: { message_id: 3 },
        l: 'en',
        us: createDefaultUserSettings()
    }

    await fixture.lifecycle.handleSettingsCommand({ ...baseContext, text: '/s reset' }, {})
    t.deepEqual(fixture.deletes, [7])
    t.is(fixture.updates.length, 0)
    t.is(fixture.messages[0][1], 'setting_reset')

    await fixture.lifecycle.handleSettingsCommand({
        ...baseContext,
        text: '/s +tags',
        us: { ...baseContext.us, tags: true }
    }, {})
    t.is(fixture.updates.length, 1)
    t.is(fixture.updates[0].chatId, 7)
    t.true(fixture.updates[0].setting.default.tags)
    t.is(fixture.messages[1][1], 'setting_saved')
})

test('settings lifecycle preserves export and valid Base64 import behavior', async t => {
    const fixture = createLifecycleFixture()
    const baseContext = {
        chat_id: 7,
        chat: { id: 7, type: 'private' },
        from: { id: 7 },
        message: { message_id: 3 },
        l: 'en',
        us: createDefaultUserSettings()
    }

    await fixture.lifecycle.handleSettingsCommand({ ...baseContext, text: '/s' }, {})
    t.is(fixture.messages[0][1], 'setting_open_link')
    const exportedUrl = fixture.messages[0][2].reply_markup.inline_keyboard[0][0].url
    t.true(exportedUrl.startsWith('https://pixiv-bot.pages.dev/s#'))
    const exportedSettings = JSON.parse(Buffer.from(exportedUrl.split('#')[1], 'base64').toString('utf8'))
    t.deepEqual(Object.keys(exportedSettings), ['format', 'default', 'time'])
    t.true(Number.isSafeInteger(exportedSettings.time))
    t.truthy(exportedSettings.default)

    const imported = Buffer.from(JSON.stringify({
        format: { message: 'custom' },
        default: { tags: true }
    }), 'utf8').toString('base64')
    await fixture.lifecycle.handleSettingsCommand({ ...baseContext, text: imported }, {})
    t.is(fixture.updates.length, 1)
    t.is(fixture.updates[0].chatId, 7)
    t.is(fixture.updates[0].setting.format.message, 'custom')
    t.true(fixture.updates[0].setting.default.tags)
    t.is(fixture.messages[1][1], 'setting_saved')
})

test('settings lifecycle preserves group administrator authorization', async t => {
    const fixture = createLifecycleFixture()
    fixture.bot.api.getChatMember = async () => ({ status: 'member' })
    await fixture.lifecycle.handleSettingsCommand({
        chat_id: -10,
        chat: { id: -10, type: 'supergroup' },
        from: { id: 7 },
        message: { message_id: 3 },
        l: 'en',
        text: '/s reset',
        us: createDefaultUserSettings()
    }, {})

    t.is(fixture.deletes.length, 0)
    t.is(fixture.updates.length, 0)
    t.is(fixture.messages[0][1], 'error_not_a_gc_administrator')
})

test('malformed imported settings report one error and never reach persistence', async t => {
    const fixture = createLifecycleFixture()
    const ctx = {
        chat_id: 7,
        chat: { id: 7, type: 'private' },
        from: { id: 7 },
        message: { message_id: 3 },
        l: 'en',
        text: 'eyJ',
        us: createDefaultUserSettings()
    }

    await fixture.lifecycle.handleSettingsCommand(ctx, {})

    t.is(fixture.updates.length, 0)
    t.is(fixture.messages.length, 1)
    t.is(fixture.messages[0][1], 'error')
})

test('unknown settings flags explain the error and never reach persistence', async t => {
    const fixture = createLifecycleFixture()
    const ctx = {
        chat_id: 7,
        chat: { id: 7, type: 'private' },
        from: { id: 7 },
        message: { message_id: 3 },
        l: 'en',
        text: '/s +tags +unknown,',
        us: createDefaultUserSettings()
    }

    await fixture.lifecycle.handleSettingsCommand(ctx, {})

    t.is(fixture.updates.length, 0)
    t.is(fixture.messages.length, 1)
    t.is(fixture.messages[0][1], 'setting_unknown_directive')
})

test('settings lifecycle stays outside input parsing and removes pre_handle', t => {
    const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
    const indexSource = readFileSync(new URL('../handlers/index.js', import.meta.url), 'utf8')

    t.true(appSource.includes('createSettingsLifecycle({ bot, store: db, logger: honsole })'))
    t.false(appSource.includes('read_user_setting'))
    t.false(appSource.includes('handle_new_configuration'))
    t.false(indexSource.includes('pre_handle.js'))
    t.throws(() => readFileSync(new URL('../handlers/telegram/pre_handle.js', import.meta.url)))
})
