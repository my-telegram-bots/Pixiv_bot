import test from 'node:test'
import assert from 'node:assert/strict'
import { BOOLEAN_KEYS } from '../docs/.vitepress/mini-app/protocol.js'
import { createTelegramBridge } from '../docs/.vitepress/mini-app/telegram-bridge.js'
import {
  COPY,
  OPTION_LABELS,
  SUPPORTED_LOCALES,
  copyFor,
  createActionController,
  normalizeSettings
} from '../docs/.vitepress/mini-app/settings-surface.js'

const settings = () => ({
  format: { message: 'm', mediagroup_message: 'g', inline: 'i', version: 'v1' },
  default: Object.fromEntries(BOOLEAN_KEYS.map(key => [key, false]))
})

test('all four locales implement identical UI state keys and every option label', () => {
  const expected = Object.keys(COPY.en).sort()
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(Object.keys(copyFor(locale)).sort(), expected)
    assert.equal(OPTION_LABELS[locale].length, BOOLEAN_KEYS.length)
    assert.ok(OPTION_LABELS[locale].every(Boolean))
  }
  assert.throws(() => copyFor('fr'))
})

test('Japanese Mini App states and recovery guidance do not fall back to English', () => {
  const japanese = copyFor('ja')
  for (const key of ['loading', 'ready', 'invalid', 'noTelegram', 'unsupported',
    'targetCancelled', 'targetUnsupported', 'sendFailed', 'tooLarge', 'terminal']) {
    assert.match(japanese[key], /[\u3040-\u30ff\u3400-\u9fff]/, `${key} must contain Japanese copy`)
    assert.notEqual(japanese[key], COPY.en[key])
  }
})

test('dependency normalization matches persisted delivery invariants', () => {
  const value = settings()
  Object.assign(value.default, {
    single_caption: true,
    album: false,
    remove_keyboard: true,
    open: true,
    share: true,
    append_file_immediate: true,
    append_file: false,
    asfile: true
  })
  const normalized = normalizeSettings(value)
  assert.equal(normalized.default.album, true)
  assert.equal(normalized.default.open, false)
  assert.equal(normalized.default.share, false)
  assert.equal(normalized.default.append_file, true)
  assert.equal(normalized.default.asfile, false)
  assert.notEqual(normalized, value)

  value.default.append_file = false
  value.default.append_file_immediate = false
  value.default.asfile = true
  value.default.album = true
  value.default.album_one = true
  value.default.album_equal = true
  value.default.single_caption = true
  const fileOnly = normalizeSettings(value)
  assert.equal(fileOnly.default.album, false)
  assert.equal(fileOnly.default.album_one, false)
  assert.equal(fileOnly.default.album_equal, false)
  assert.equal(fileOnly.default.single_caption, false)
  assert.equal(normalizeSettings(settings(), 'channel').default.share, false)
})

test('bridge detects SDK capabilities and calls ready/send/close without identity data', () => {
  const calls = []
  const bridge = createTelegramBridge({
    themeParams: { bg_color: '#fff' },
    ready() { calls.push('ready') },
    sendData(data) { calls.push(['send', data]) },
    close() { calls.push('close') }
  })
  assert.equal(bridge.available, true)
  assert.equal(bridge.canSendData, true)
  assert.equal(bridge.canRequestChat, false)
  bridge.ready()
  bridge.sendData('{}')
  bridge.close()
  assert.deepEqual(calls, ['ready', ['send', '{}'], 'close'])
  assert.deepEqual(bridge.themeParams, { bg_color: '#fff' })
})

test('save/reset handoff is user-driven, terminal, and duplicate-safe', async () => {
  const sent = []
  const states = []
  const controller = createActionController({
    bridge: { sendData(data) { sent.push(JSON.parse(data)) } },
    session: 'opaque-token',
    onState: (...state) => states.push(state)
  })
  assert.equal(await controller.save(settings()), true)
  assert.equal(await controller.reset(), false)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].action, 'save')
  assert.deepEqual(states, [['submit', 'submitting'], ['submit', 'handedBack']])
})

test('send failure remains retryable and reports the stable failure state', async () => {
  const states = []
  const controller = createActionController({
    bridge: { sendData() { throw new Error('raw SDK error') } },
    session: 'opaque-token',
    onState: (...state) => states.push(state)
  })
  assert.equal(await controller.reset(), false)
  assert.equal(controller.pending, false)
  assert.deepEqual(states.at(-1), ['submit', 'sendFailed'])
})

test('requestChat handles success, cancellation, failure, and unsupported clients', async () => {
  for (const [outcome, expected, closes] of [[true, 'targetSent', 1], [false, 'targetCancelled', 0]]) {
    const states = []
    let closeCount = 0
    const controller = createActionController({
      bridge: {
        canRequestChat: true,
        requestChat: async () => outcome,
        close() { closeCount++ }
      },
      session: 'opaque-token',
      onState: (...state) => states.push(state)
    })
    assert.equal(await controller.requestTarget('group', 'prepared-id'), outcome)
    assert.equal(states.at(-1)[1], expected)
    assert.equal(closeCount, closes)
  }

  const unsupportedStates = []
  const unsupported = createActionController({
    bridge: { canRequestChat: false }, session: 'opaque-token',
    onState: (...state) => unsupportedStates.push(state)
  })
  assert.equal(await unsupported.requestTarget('channel', 'prepared-id'), false)
  assert.deepEqual(unsupportedStates, [['target', 'targetUnsupported']])

  const failureStates = []
  const failure = createActionController({
    bridge: { canRequestChat: true, requestChat: async () => { throw new Error('no') } },
    session: 'opaque-token', onState: (...state) => failureStates.push(state)
  })
  assert.equal(await failure.requestTarget('channel', 'prepared-id'), false)
  assert.equal(failureStates.at(-1)[1], 'targetCancelled')
})

test('bridge requestChat maps Telegram callback values without exposing chat IDs', async () => {
  const ids = []
  const bridge = createTelegramBridge({
    sendData() {},
    requestChat(id, callback) { ids.push(id); callback(true) }
  })
  assert.equal(await bridge.requestChat('prepared-only'), true)
  assert.deepEqual(ids, ['prepared-only'])
})
