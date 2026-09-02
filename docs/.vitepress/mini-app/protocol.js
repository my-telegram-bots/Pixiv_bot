export const PROTOCOL_VERSION = 1
export const MAX_PAYLOAD_BYTES = 4096

export const FORMAT_KEYS = Object.freeze([
  'message',
  'mediagroup_message',
  'inline',
  'version'
])

export const BOOLEAN_KEYS = Object.freeze([
  'tags',
  'description',
  'open',
  'share',
  'remove_keyboard',
  'remove_caption',
  'single_caption',
  'album',
  'album_one',
  'album_equal',
  'reverse',
  'overwrite',
  'asfile',
  'append_file',
  'append_file_immediate',
  'caption_extraction',
  'caption_above',
  'show_id',
  'auto_spoiler'
])

export const STRING_KEYS = Object.freeze([
  'telegraph_title',
  'telegraph_author_name',
  'telegraph_author_url'
])

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const INITIAL_KEYS = new Set(['v', 'session', 'settings', 'target', 'request_chat'])
const SETTINGS_KEYS = new Set(['format', 'default'])
const REQUEST_CHAT_KEYS = new Set(['group', 'channel'])
const TARGET_KEYS = new Set(['type', 'name', 'username', 'photo_url'])
const TARGET_TYPES = new Set(['private', 'group', 'supergroup', 'channel'])
const FORMAT_KEY_SET = new Set(FORMAT_KEYS)
const BOOLEAN_KEY_SET = new Set(BOOLEAN_KEYS)
const STRING_KEY_SET = new Set(STRING_KEYS)

function ordinaryObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
}

function hasExactKeys(value, expected) {
  const keys = Object.keys(value)
  return keys.length === expected.size && keys.every(key => expected.has(key))
}

function hasDangerousKey(value) {
  const pending = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === null || typeof current !== 'object') continue
    for (const key of Object.keys(current)) {
      if (DANGEROUS_KEYS.has(key)) return true
      pending.push(current[key])
    }
  }
  return false
}

function validateFormat(format) {
  if (!ordinaryObject(format)) return false
  return Object.entries(format).every(([key, value]) =>
    FORMAT_KEY_SET.has(key) && typeof value === 'string' &&
    (key !== 'version' || value === 'v1'))
}

function validateDefaults(defaults) {
  if (!ordinaryObject(defaults)) return false
  return Object.entries(defaults).every(([key, value]) => {
    if (BOOLEAN_KEY_SET.has(key)) return typeof value === 'boolean'
    if (STRING_KEY_SET.has(key)) return typeof value === 'string'
    return false
  })
}

export function validateSettings(settings) {
  return ordinaryObject(settings) && !hasDangerousKey(settings) &&
    hasExactKeys(settings, SETTINGS_KEYS) && validateFormat(settings.format) &&
    validateDefaults(settings.default)
}

function validateTarget(target) {
  if (!ordinaryObject(target) || !hasExactKeys(target, TARGET_KEYS) ||
    !TARGET_TYPES.has(target.type) || typeof target.name !== 'string' ||
    target.name.length === 0 || target.name.length > 128 ||
    typeof target.username !== 'string' || target.username.length > 64 ||
    typeof target.photo_url !== 'string' || target.photo_url.length > 2048) {
    return false
  }
  if (target.photo_url.length === 0) return true
  try {
    return new URL(target.photo_url).protocol === 'https:'
  } catch (error) {
    return false
  }
}

function decodeBase64Url(fragment, atobImpl) {
  if (typeof fragment !== 'string' || fragment.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(fragment)) {
    throw new Error('encoding')
  }
  const remainder = fragment.length % 4
  if (remainder === 1) throw new Error('encoding')
  const base64 = fragment.replaceAll('-', '+').replaceAll('_', '/') +
    '='.repeat((4 - remainder) % 4)
  const binary = atobImpl(base64)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export function parseInitialFragment(fragment, {
  atobImpl = globalThis.atob,
  TextDecoderImpl = globalThis.TextDecoder
} = {}) {
  try {
    if (typeof atobImpl !== 'function' || typeof TextDecoderImpl !== 'function') {
      return { ok: false, reason: 'environment' }
    }
    const bytes = decodeBase64Url(fragment, atobImpl)
    const json = new TextDecoderImpl('utf-8', { fatal: true }).decode(bytes)
    const value = JSON.parse(json)
    if (!ordinaryObject(value) || hasDangerousKey(value) ||
      !hasExactKeys(value, INITIAL_KEYS)) return { ok: false, reason: 'fields' }
    if (value.v !== PROTOCOL_VERSION) return { ok: false, reason: 'version' }
    if (typeof value.session !== 'string' || value.session.length === 0) {
      return { ok: false, reason: 'session' }
    }
    if (!validateSettings(value.settings)) return { ok: false, reason: 'settings' }
    if (!validateTarget(value.target)) return { ok: false, reason: 'target' }
    if (!ordinaryObject(value.request_chat) ||
      !hasExactKeys(value.request_chat, REQUEST_CHAT_KEYS) ||
      !Object.values(value.request_chat).every(item =>
        typeof item === 'string' && item.length > 0)) {
      return { ok: false, reason: 'request_chat' }
    }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, reason: 'decode' }
  }
}

export function consumeInitialFragment({ location, history }, dependencies = {}) {
  const rawFragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  // Telegram treats a bare custom fragment as its _path and appends Web App
  // initialization parameters after `?`. Only the path is our private payload.
  const separator = rawFragment.indexOf('?')
  const fragment = separator === -1 ? rawFragment : rawFragment.slice(0, separator)
  history.replaceState(history.state, '', `${location.pathname}${location.search}`)
  return parseInitialFragment(fragment, dependencies)
}

function serialize(payload, TextEncoderImpl = globalThis.TextEncoder) {
  if (typeof TextEncoderImpl !== 'function') return { ok: false, reason: 'environment' }
  const data = JSON.stringify(payload)
  const bytes = new TextEncoderImpl().encode(data).byteLength
  return bytes <= MAX_PAYLOAD_BYTES
    ? { ok: true, data, bytes }
    : { ok: false, reason: 'too_large', bytes }
}

export function serializeSave(session, settings, dependencies = {}) {
  if (typeof session !== 'string' || session.length === 0 || !validateSettings(settings)) {
    return { ok: false, reason: 'invalid' }
  }
  return serialize({ v: PROTOCOL_VERSION, action: 'save', session, settings },
    dependencies.TextEncoderImpl)
}

export function serializeReset(session, dependencies = {}) {
  if (typeof session !== 'string' || session.length === 0) {
    return { ok: false, reason: 'invalid' }
  }
  return serialize({ v: PROTOCOL_VERSION, action: 'reset', session },
    dependencies.TextEncoderImpl)
}

export function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings))
}
