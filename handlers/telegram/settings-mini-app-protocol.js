export const SETTINGS_MINI_APP_PROTOCOL_VERSION = 1
export const SETTINGS_MINI_APP_MAX_BYTES = 4096

export const SETTINGS_FORMAT_KEYS = Object.freeze([
    'message',
    'mediagroup_message',
    'inline',
    'version'
])

export const SETTINGS_BOOLEAN_KEYS = Object.freeze([
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

export const SETTINGS_STRING_KEYS = Object.freeze([
    'telegraph_title',
    'telegraph_author_name',
    'telegraph_author_url'
])

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const ROOT_SAVE_KEYS = new Set(['v', 'action', 'session', 'settings'])
const ROOT_RESET_KEYS = new Set(['v', 'action', 'session'])
const SETTINGS_KEYS = new Set(['format', 'default'])
const FORMAT_KEYS = new Set(SETTINGS_FORMAT_KEYS)
const BOOLEAN_KEYS = new Set(SETTINGS_BOOLEAN_KEYS)
const STRING_KEYS = new Set(SETTINGS_STRING_KEYS)
const SESSION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

function hasExactKeys(value, allowed) {
    const keys = Object.keys(value)
    return keys.length === allowed.size && keys.every(key => allowed.has(key))
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
        Object.getPrototypeOf(value) === Object.prototype
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
    if (!isPlainObject(format)) return false
    for (const [key, value] of Object.entries(format)) {
        if (!FORMAT_KEYS.has(key) || typeof value !== 'string') return false
        if (key === 'version' && value !== 'v1') return false
    }
    return true
}

function validateDefaults(defaults) {
    if (!isPlainObject(defaults)) return false
    for (const [key, value] of Object.entries(defaults)) {
        if (BOOLEAN_KEYS.has(key)) {
            if (typeof value !== 'boolean') return false
            continue
        }
        if (STRING_KEYS.has(key)) {
            if (typeof value !== 'string') return false
            if (key === 'telegraph_title' && value.length >= 256) return false
            if (key === 'telegraph_author_name' && value.length >= 128) return false
            if (key === 'telegraph_author_url' && value.length > 0) {
                if (value.length >= 512) return false
                try {
                    new URL(value)
                } catch (error) {
                    return false
                }
            }
            continue
        }
        return false
    }
    return true
}

export function normalizeSettingsMiniAppDependencies(settings, targetType = 'private') {
    const normalized = JSON.parse(JSON.stringify(settings))
    const values = normalized.default
    if (values.single_caption || values.album_one || values.album_equal) {
        values.album = true
    }
    if (values.remove_keyboard) {
        values.open = false
        values.share = false
    }
    if (values.append_file_immediate) values.append_file = true
    if (values.append_file) values.asfile = false
    if (values.asfile) {
        values.album = false
        values.album_one = false
        values.album_equal = false
        values.single_caption = false
    }
    if (targetType === 'channel') values.share = false
    return normalized
}

function validateSettings(settings) {
    return isPlainObject(settings) && hasExactKeys(settings, SETTINGS_KEYS) &&
        validateFormat(settings.format) && validateDefaults(settings.default)
}

function invalid(reason) {
    return { ok: false, reason }
}

export function parseSettingsMiniAppPayload(data) {
    if (typeof data !== 'string') return invalid('type')
    if (Buffer.byteLength(data, 'utf8') > SETTINGS_MINI_APP_MAX_BYTES) {
        return invalid('too_large')
    }

    let payload
    try {
        payload = JSON.parse(data)
    } catch (error) {
        return invalid('json')
    }
    if (!isPlainObject(payload) || hasDangerousKey(payload)) return invalid('object')
    if (payload.v !== SETTINGS_MINI_APP_PROTOCOL_VERSION) return invalid('version')
    if (!SESSION_PATTERN.test(payload.session || '')) return invalid('session')

    if (payload.action === 'reset') {
        return hasExactKeys(payload, ROOT_RESET_KEYS)
            ? { ok: true, value: payload }
            : invalid('fields')
    }
    if (payload.action === 'save') {
        if (!hasExactKeys(payload, ROOT_SAVE_KEYS)) return invalid('fields')
        if (!validateSettings(payload.settings)) return invalid('settings')
        return { ok: true, value: payload }
    }
    return invalid('action')
}

export function projectStoredSettings(storedSetting, defaultFormats, defaultValues) {
    const stored = isPlainObject(storedSetting) ? storedSetting : {}
    const storedFormat = isPlainObject(stored.format) ? stored.format : {}
    const storedDefault = isPlainObject(stored.default) ? stored.default : {}
    const format = {}
    const defaults = {}

    for (const key of SETTINGS_FORMAT_KEYS) {
        const value = storedFormat[key] ?? defaultFormats[key]
        if (typeof value === 'string' && (key !== 'version' || value === 'v1')) {
            format[key] = value
        }
    }
    for (const key of SETTINGS_BOOLEAN_KEYS) {
        const value = storedDefault[key] ?? defaultValues[key] ?? false
        defaults[key] = typeof value === 'boolean' ? value : false
    }
    for (const key of SETTINGS_STRING_KEYS) {
        const value = storedDefault[key]
        if (typeof value === 'string') defaults[key] = value
    }
    return { format, default: defaults }
}
