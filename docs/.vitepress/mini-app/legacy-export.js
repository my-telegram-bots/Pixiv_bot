import { cloneSettings, validateSettings } from './protocol.js'

export function encodeLegacySettings(settings, time, {
  btoaImpl = globalThis.btoa,
  TextEncoderImpl = globalThis.TextEncoder
} = {}) {
  if (!validateSettings(settings) || !Number.isSafeInteger(time) || time < 0 ||
    typeof btoaImpl !== 'function' || typeof TextEncoderImpl !== 'function') {
    return { ok: false, reason: 'invalid' }
  }

  const snapshot = cloneSettings(settings)
  const json = JSON.stringify({
    format: snapshot.format,
    default: snapshot.default,
    time
  })
  const bytes = new TextEncoderImpl().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  try {
    return { ok: true, data: btoaImpl(binary), json, bytes: bytes.byteLength }
  } catch (error) {
    return { ok: false, reason: 'encode' }
  }
}

export function legacyTelegramShareUrl(payload) {
  if (typeof payload !== 'string' || payload.length === 0) return ''
  return `tg://msg_url?url=${encodeURIComponent(payload)}`
}

export async function copyLegacyPayload(payload, {
  clipboard = globalThis.navigator?.clipboard
} = {}) {
  if (typeof payload !== 'string' || payload.length === 0 ||
    typeof clipboard?.writeText !== 'function') return false
  try {
    await clipboard.writeText(payload)
    return true
  } catch (error) {
    return false
  }
}
