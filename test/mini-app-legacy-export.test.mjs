import test from 'node:test'
import assert from 'node:assert/strict'
import {
  copyLegacyPayload,
  encodeLegacySettings,
  legacyTelegramShareUrl
} from '../docs/.vitepress/mini-app/legacy-export.js'

const settings = {
  format: {
    message: '作品：%title%',
    mediagroup_message: '相簿：%title%',
    inline: '検索：%title%',
    version: 'v1'
  },
  default: {
    tags: true,
    description: false,
    telegraph_title: '標題'
  }
}

test('legacy export is standard UTF-8 Base64 with the exact importable JSON shape', () => {
  const encoded = encodeLegacySettings(settings, 1_725_000_000_000)
  assert.equal(encoded.ok, true)
  assert.match(encoded.data, /^[A-Za-z0-9+/]+={0,2}$/)
  assert.deepEqual(
    JSON.parse(Buffer.from(encoded.data, 'base64').toString('utf8')),
    {
      format: settings.format,
      default: settings.default,
      time: 1_725_000_000_000
    }
  )
  assert.equal(encoded.bytes, Buffer.byteLength(encoded.json, 'utf8'))
})

test('legacy export contains no Mini App session, target, prepared IDs, or identity', () => {
  const encoded = encodeLegacySettings(settings, 1)
  const decoded = JSON.parse(Buffer.from(encoded.data, 'base64').toString('utf8'))
  assert.deepEqual(Object.keys(decoded), ['format', 'default', 'time'])
  for (const forbidden of [
    'session', 'target', 'request_chat', 'chat_id', 'user_id',
    'photo_url', 'username', 'permission'
  ]) assert.equal(JSON.stringify(decoded).includes(forbidden), false)
})

test('legacy Telegram share URL uses the existing destination picker protocol', () => {
  const payload = 'YWJj+/=='
  assert.equal(
    legacyTelegramShareUrl(payload),
    `tg://msg_url?url=${encodeURIComponent(payload)}`
  )
  assert.equal(legacyTelegramShareUrl(''), '')
})

test('legacy copy reports success and leaves manual selection as the failure path', async () => {
  const writes = []
  assert.equal(await copyLegacyPayload('payload', {
    clipboard: { async writeText(value) { writes.push(value) } }
  }), true)
  assert.deepEqual(writes, ['payload'])

  assert.equal(await copyLegacyPayload('payload', { clipboard: undefined }), false)
  assert.equal(await copyLegacyPayload('payload', {
    clipboard: { async writeText() { throw new Error('denied') } }
  }), false)
})

test('legacy export rejects invalid settings and invalid timestamps', () => {
  assert.deepEqual(encodeLegacySettings({ format: [], default: {} }, 1), {
    ok: false,
    reason: 'invalid'
  })
  assert.deepEqual(encodeLegacySettings(settings, -1), {
    ok: false,
    reason: 'invalid'
  })
})
