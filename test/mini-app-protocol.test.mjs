import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_PAYLOAD_BYTES,
  consumeInitialFragment,
  parseInitialFragment,
  serializeReset,
  serializeSave
} from '../docs/.vitepress/mini-app/protocol.js'

const initial = {
  v: 1,
  session: 'opaque-token',
  settings: {
    format: { message: '作品界', version: 'v1' },
    default: { tags: true, telegraph_title: '標題' }
  },
  target: {
    type: 'private',
    name: 'Example User',
    username: 'example_user',
    photo_url: 'https://t.me/i/userpic/320/example_user.jpg'
  },
  request_chat: { group: 'prepared-group', channel: 'prepared-channel' }
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

test('Base64URL fragment decoding preserves UTF-8 and accepts the exact v1 contract', () => {
  assert.deepEqual(parseInitialFragment(base64Url(initial)), { ok: true, value: initial })
})

test('fragment consumption reads once and immediately clears only the fragment', () => {
  const calls = []
  const source = {
    location: { hash: `#${base64Url(initial)}`, pathname: '/zh-hans/mini-app', search: '?x=1' },
    history: {
      state: { key: 1 },
      replaceState(...args) { calls.push(args) }
    }
  }
  assert.equal(consumeInitialFragment(source).ok, true)
  assert.deepEqual(calls, [[{ key: 1 }, '', '/zh-hans/mini-app?x=1']])
})

test('fragment consumption isolates the bot payload from Telegram Web App parameters', () => {
  const calls = []
  const payload = base64Url(initial)
  const source = {
    location: {
      hash: `#${payload}?tgWebAppData=query_id%3Dreal&tgWebAppVersion=10.3&tgWebAppPlatform=tdesktop`,
      pathname: '/mini-app',
      search: ''
    },
    history: {
      state: null,
      replaceState(...args) { calls.push(args) }
    }
  }

  assert.deepEqual(consumeInitialFragment(source), { ok: true, value: initial })
  assert.deepEqual(calls, [[null, '', '/mini-app']])
})

test('initial parser rejects malformed data, unknown fields, arrays, types, and versions', () => {
  const invalid = [
    '',
    '%%%not-base64',
    base64Url([]),
    base64Url({ ...initial, v: 2 }),
    base64Url({ ...initial, user_id: 7 }),
    base64Url({ ...initial, settings: { format: [], default: {} } }),
    base64Url({ ...initial, settings: { format: {}, default: { tags: 'yes' } } }),
    base64Url({ ...initial, settings: { format: { unknown: 'x' }, default: {} } }),
    base64Url({ ...initial, request_chat: { group: 'x' } }),
    base64Url({ ...initial, target: { ...initial.target, type: 'bot' } }),
    base64Url({ ...initial, target: { ...initial.target, name: '' } }),
    base64Url({ ...initial, target: { ...initial.target, photo_url: 'http://example.com/a.jpg' } }),
    base64Url({ ...initial, target: { ...initial.target, chat_id: 7 } })
  ]
  for (const fragment of invalid) assert.equal(parseInitialFragment(fragment).ok, false)
})

test('initial parser rejects dangerous keys at every depth', () => {
  const dangerous = [
    '{"v":1,"session":"opaque-token","settings":{"format":{},"default":{}},"target":{"type":"private","name":"User","username":"","photo_url":""},"request_chat":{"group":"g","channel":"c"},"__proto__":{}}',
    '{"v":1,"session":"opaque-token","settings":{"format":{"constructor":"x"},"default":{}},"target":{"type":"private","name":"User","username":"","photo_url":""},"request_chat":{"group":"g","channel":"c"}}',
    '{"v":1,"session":"opaque-token","settings":{"format":{},"default":{"prototype":false}},"target":{"type":"private","name":"User","username":"","photo_url":""},"request_chat":{"group":"g","channel":"c"}}'
  ]
  for (const json of dangerous) {
    assert.equal(parseInitialFragment(Buffer.from(json).toString('base64url')).ok, false)
  }
})

test('save and reset serialization are compact and contain no identity or UI fields', () => {
  const saved = serializeSave(initial.session, initial.settings)
  assert.equal(saved.ok, true)
  assert.equal(saved.data, JSON.stringify({
    v: 1,
    action: 'save',
    session: initial.session,
    settings: initial.settings
  }))
  assert.deepEqual(JSON.parse(serializeReset(initial.session).data), {
    v: 1,
    action: 'reset',
    session: initial.session
  })
})

test('save serialization enforces 4095, 4096, and 4097 UTF-8 byte boundaries', () => {
  const settings = { format: { message: '' }, default: {} }
  const overhead = serializeSave(initial.session, settings).bytes
  for (const boundary of [4095, 4096, 4097]) {
    settings.format.message = 'a'.repeat(boundary - overhead)
    const result = serializeSave(initial.session, settings)
    assert.equal(result.bytes, boundary)
    assert.equal(result.ok, boundary <= MAX_PAYLOAD_BYTES)
  }
  settings.format.message = '界'.repeat(1400)
  const utf8 = serializeSave(initial.session, settings)
  assert.equal(utf8.reason, 'too_large')
  assert.ok(utf8.bytes > MAX_PAYLOAD_BYTES)
})
