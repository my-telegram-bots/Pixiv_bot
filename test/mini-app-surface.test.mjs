import test from 'node:test'
import assert from 'node:assert/strict'
import { BOOLEAN_KEYS } from '../docs/.vitepress/mini-app/protocol.js'
import { createTelegramBridge } from '../docs/.vitepress/mini-app/telegram-bridge.js'
import {
  COPY,
  DEFAULT_PREVIEW_FORMATS,
  DEFAULT_TEMPLATE_CHOICES,
  FILE_DELIVERY_MODES,
  OPTION_LABELS,
  SUPPORTED_LOCALES,
  applyFileDeliveryMode,
  copyFor,
  createActionController,
  fileDeliveryModeFor,
  normalizeSettings,
  renderTemplatePreview,
  renderTemplateText,
  validateEditableSettings
} from '../docs/.vitepress/mini-app/settings-surface.js'

const settings = () => ({
  format: { message: 'm', mediagroup_message: 'g', inline: 'i', version: 'v1' },
  default: Object.fromEntries(BOOLEAN_KEYS.map(key => [key, false]))
})

test('visual preview renders v1 conditionals and reacts to delivery options', () => {
  const value = settings()
  Object.assign(value.default, { tags: true, description: true, show_id: true })
  const template = '%\\#NSFW |NSFW%%title% %ID: |id%\n%tags%\n%description%'
  const visible = renderTemplateText(template, value, 'Live description')
  assert.match(visible, /\\#NSFW/)
  assert.match(visible, /XX:Me/)
  assert.match(visible, /ID: 67953985/)
  assert.match(visible, /#DARLINGintheFRANXX/)
  assert.match(visible, /Live description/)

  value.default.tags = false
  value.default.description = false
  value.default.show_id = false
  const hidden = renderTemplateText(template, value, 'Live description')
  assert.doesNotMatch(hidden, /67953985|DARLING|Live description/)
})

test('preview produces safe rendered markup and presets change the rendered result', () => {
  const value = settings()
  Object.assign(value.default, { tags: true, description: true, show_id: true })
  assert.equal(DEFAULT_TEMPLATE_CHOICES.length, 6)
  const first = renderTemplatePreview(DEFAULT_TEMPLATE_CHOICES[0], value, 'Description')
  const second = renderTemplatePreview(DEFAULT_TEMPLATE_CHOICES[1], value, 'Description')
  assert.match(first, /<p>/)
  assert.match(first, /preview-link/)
  assert.notEqual(first, second)
  assert.doesNotMatch(
    renderTemplatePreview('![tracker](https://example.com/pixel) <script>x</script>', value),
    /<img|<script|https:\/\/example\.com/
  )
  assert.match(renderTemplatePreview(DEFAULT_PREVIEW_FORMATS.message, value), /XX:Me/)
})

test('Telegram expandable quote markers render as message content, never literal controls', () => {
  const value = settings()
  Object.assign(value.default, { tags: true, description: true })
  const html = renderTemplatePreview(
    '%title%%\n**>|description%',
    value,
    'description line 1\ndescription line 2'
  )
  assert.match(html, /<blockquote(?:\s[^>]*)?>/)
  assert.match(html, /description line 1/)
  assert.match(html, /description line 2/)
  assert.match(html, /description line 1<br>\s*description line 2/)
  assert.doesNotMatch(html, /\*\*&gt;|&gt;\*\*|\|\|/)

  const legacyExpandable = renderTemplatePreview(
    '%title%%\n>**|description%',
    value,
    'legacy description'
  )
  assert.match(legacyExpandable, /<blockquote(?:\s[^>]*)?>/)
  assert.doesNotMatch(legacyExpandable, /&gt;\*\*|\*\*/)
})

test('file delivery is one four-way exclusive choice', () => {
  const expected = {
    mediaOnly: [false, false, false],
    fileOnly: [true, false, false],
    mediaWithFiles: [false, true, false],
    mediaWithImmediateFiles: [false, true, true]
  }
  assert.deepEqual(FILE_DELIVERY_MODES, Object.keys(expected))
  for (const [mode, flags] of Object.entries(expected)) {
    const value = settings()
    Object.assign(value.default, {
      asfile: true,
      append_file: true,
      append_file_immediate: true,
      album: true,
      album_one: true,
      album_equal: true,
      single_caption: true
    })
    applyFileDeliveryMode(value.default, mode)
    assert.deepEqual([
      value.default.asfile,
      value.default.append_file,
      value.default.append_file_immediate
    ], flags)
    assert.equal(fileDeliveryModeFor(value.default), mode)
    if (mode === 'fileOnly') {
      assert.deepEqual([
        value.default.album,
        value.default.album_one,
        value.default.album_equal,
        value.default.single_caption
      ], [false, false, false, false])
    }
  }
  assert.throws(() => applyFileDeliveryMode(settings().default, 'invalid'))
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
    'targetCancelled', 'targetUnsupported', 'sendFailed', 'validationFailed',
    'tooLarge', 'terminal']) {
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

test('Telegraph metadata validation matches Bot limits and URL rules', () => {
  const value = settings()
  value.default.telegraph_title = 'x'.repeat(255)
  value.default.telegraph_author_name = 'x'.repeat(127)
  value.default.telegraph_author_url = 'https://example.com'
  assert.equal(validateEditableSettings(value), true)
  value.default.telegraph_author_url = 'not a URL'
  assert.equal(validateEditableSettings(value), false)
  value.default.telegraph_author_url = ''
  value.default.telegraph_title += 'x'
  assert.equal(validateEditableSettings(value), false)
})

test('bridge detects SDK capabilities and calls ready/send/close without identity data', () => {
  const calls = []
  const bridge = createTelegramBridge({
    themeParams: { bg_color: '#fff' },
    initDataUnsafe: { user: { photo_url: 'https://t.me/i/userpic/320/person.jpg' } },
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
  assert.equal(bridge.currentUserPhotoUrl, 'https://t.me/i/userpic/320/person.jpg')
})

test('bridge settles native selector cancellation when Telegram returns without callback', async () => {
  const listeners = new Map()
  const fakeWindow = {
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    addEventListener(name, listener) { listeners.set(name, listener) },
    removeEventListener(name) { listeners.delete(name) },
    setTimeout(callback) { callback(); return 1 },
    clearTimeout() {}
  }
  const bridge = createTelegramBridge({ requestChat() {} }, fakeWindow)
  const request = bridge.requestChat('prepared-id')
  listeners.get('blur')()
  listeners.get('focus')()
  assert.equal(await request, false)
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

test('controller can recover a selector whose client omits the cancel callback', async () => {
  const states = []
  let settleRequest
  const controller = createActionController({
    bridge: {
      canRequestChat: true,
      requestChat: () => new Promise(resolve => { settleRequest = resolve }),
      close() { throw new Error('stale success must not close') }
    },
    session: 'opaque-token',
    onState: (...state) => states.push(state)
  })
  const first = controller.requestTarget('group', 'prepared-id')
  assert.equal(controller.pendingTarget, true)
  assert.equal(controller.cancelTarget(), true)
  assert.equal(controller.pending, false)
  assert.equal(controller.pendingTarget, false)
  assert.deepEqual(states.at(-1), ['target', 'targetCancelled'])
  settleRequest(true)
  assert.equal(await first, false)
  assert.deepEqual(states.at(-1), ['target', 'targetCancelled'])
})
