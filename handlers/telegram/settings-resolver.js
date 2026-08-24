import {
    SETTING_FLAG_DEFINITIONS,
    hasNegativeDirective,
    hasPositiveDirective
} from '#handlers/telegram/settings-command-parser'

export function createDefaultUserSettings() {
    return {
        setting: {
            format: {
                message: false,
                mediagroup_message: false,
                inline: false
            },
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
    }
}

export function shouldQueryUserSetting(chatId, parsedInput, chatSetting) {
    return (chatId < 0 && hasPositiveDirective(parsedInput, 'god')) ||
        chatSetting?.default?.overwrite !== true
}

export function selectStoredSetting(chatSetting, userSetting) {
    if (!chatSetting || !userSetting) {
        return chatSetting
    }
    return userSetting
}

export function mergeStoredSetting(base, storedSetting) {
    if (!storedSetting) {
        return base
    }

    const setting = {
        ...storedSetting,
        format: storedSetting.format || {},
        default: {
            ...base.setting.default,
            ...storedSetting.default
        },
        dbless: false
    }
    delete setting._id
    delete setting.id

    return {
        ...base,
        setting
    }
}

function resolveSettingFlag(defaults, parsedInput, definition) {
    const { name, inverted = false } = definition
    const enableFlag = inverted
        ? hasNegativeDirective(parsedInput, name)
        : hasPositiveDirective(parsedInput, name)
    const disableFlag = inverted
        ? hasPositiveDirective(parsedInput, name)
        : hasNegativeDirective(parsedInput, name)

    if (disableFlag) {
        return false
    }
    if (enableFlag) {
        return true
    }
    return defaults[name] || false
}

export function resolveRequestSettings(base, parsedInput, type, chat) {
    const defaults = base.setting.default || {}
    const resolved = { ...base }
    for (const definition of SETTING_FLAG_DEFINITIONS) {
        resolved[definition.name] = resolveSettingFlag(defaults, parsedInput, definition)
    }

    if (chat?.id < 0) {
        resolved.overwrite = (defaults.overwrite &&
            !hasNegativeDirective(parsedInput, 'overwrite')) ||
            hasPositiveDirective(parsedInput, 'overwrite')
    }
    if (resolved.telegraph) {
        resolved.album = true
        resolved.tags = true
    }
    if (resolved.single_caption || resolved.album_one || resolved.album_equal) {
        resolved.album = true
    }
    if (hasPositiveDirective(parsedInput, 'rm')) {
        resolved.remove_caption = false
        resolved.remove_keyboard = false
    }
    if (hasNegativeDirective(parsedInput, 'rm')) {
        resolved.remove_caption = true
        resolved.remove_keyboard = true
    }
    if (resolved.remove_keyboard) {
        resolved.open = false
        resolved.share = false
    }
    if (resolved.append_file_immediate) {
        resolved.append_file = true
    }
    if (resolved.append_file) {
        resolved.asfile = false
    }
    if (resolved.asfile) {
        resolved.album = false
        resolved.album_one = false
        resolved.single_caption = false
    }
    if (type === 'channel') {
        resolved.share = false
    }
    if (type === 'inline') {
        resolved.single_caption = false
    }

    return resolved
}

export function applyTelegraphValues(settings, values) {
    const { title, author_name: authorName, author_url: authorUrl } = values
    if (title && title.length >= 256) {
        return { error: 'title_too_long' }
    }
    try {
        if ((authorName && authorName.length >= 128) ||
            (authorUrl && new URL(authorUrl) && authorUrl.length >= 512)) {
            return { error: 'author_invalid' }
        }
    } catch (error) {
        return { error: 'author_invalid' }
    }

    const defaults = settings.setting.default || {}
    const metadata = {
        telegraph_title: title || defaults.telegraph_title,
        telegraph_author_name: authorName || defaults.telegraph_author_name,
        telegraph_author_url: authorUrl || defaults.telegraph_author_url
    }
    for (const key in metadata) {
        if (metadata[key] === undefined) {
            delete metadata[key]
        }
    }

    return Object.keys(metadata).length > 0
        ? { settings: { ...settings, ...metadata, value_update_flag: true } }
        : { settings }
}

export function sanitizeSettingObject(value) {
    if (value === null || typeof value !== 'object') {
        return value
    }
    if (Array.isArray(value)) {
        return value.map(item => sanitizeSettingObject(item))
    }

    const sanitized = Object.create(null)
    for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key) ||
            ['__proto__', 'constructor', 'prototype'].includes(key)) {
            continue
        }
        sanitized[key] = sanitizeSettingObject(value[key])
    }
    return sanitized
}
