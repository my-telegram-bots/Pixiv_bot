import { extractAdjacentPixivSettingTokenGroups } from '#handlers/telegram/input-parser'

export const SettingsCommand = Object.freeze({
    EXPORT: 'export',
    RESET: 'reset',
    IMPORT: 'import',
    SAVE: 'save',
    NONE: 'none'
})

export const SETTING_FLAG_DEFINITIONS = Object.freeze([
    { name: 'tags', aliases: ['tag'] },
    { name: 'description', aliases: ['desc'] },
    { name: 'open', aliases: [] },
    { name: 'caption_extraction', aliases: ['caption'] },
    { name: 'caption_above', aliases: ['above'] },
    { name: 'share', aliases: [] },
    { name: 'remove_keyboard', aliases: ['kb'], inverted: true },
    { name: 'remove_caption', aliases: ['cp'], inverted: true },
    { name: 'single_caption', aliases: ['sc'] },
    { name: 'show_id', aliases: ['id'] },
    { name: 'album', aliases: [] },
    { name: 'album_one', aliases: ['one'] },
    { name: 'album_equal', aliases: ['equal'] },
    { name: 'reverse', aliases: [] },
    { name: 'telegraph', aliases: ['graph'] },
    { name: 'asfile', aliases: ['file'] },
    { name: 'append_file', aliases: ['af'] },
    { name: 'append_file_immediate', aliases: ['af_i', 'afi'] },
    { name: 'spoiler', aliases: ['sp'] },
    { name: 'auto_spoiler', aliases: ['as'] }
].map(definition => Object.freeze({
    ...definition,
    aliases: Object.freeze(definition.aliases)
})))

const CONTROL_NAMES = Object.freeze(['god', 'rm', 'overwrite'])
const DIRECTIVE_PATTERN = /(?:^|\s)([+-])([a-z][a-z0-9_]*)(?=$|[^\w])/gi

const aliasToCanonicalName = new Map()
for (const { name, aliases } of SETTING_FLAG_DEFINITIONS) {
    aliasToCanonicalName.set(name, name)
    for (const alias of aliases) {
        aliasToCanonicalName.set(alias, name)
    }
}
for (const name of CONTROL_NAMES) {
    aliasToCanonicalName.set(name, name)
}

function createPresence() {
    return { positive: false, negative: false }
}

function normalizeCommandText(text) {
    return text.trim().replace(/\s+/g, ' ')
}

export function parseSettingsInput(input = '') {
    const text = String(input)
    const normalizedText = normalizeCommandText(text)
    const directives = Object.create(null)
    const unknownDirectives = []

    for (const match of text.matchAll(DIRECTIVE_PATTERN)) {
        const [, sign, sourceName] = match
        const name = aliasToCanonicalName.get(sourceName.toLowerCase())
        if (!name) {
            unknownDirectives.push(`${sign}${sourceName}`)
            continue
        }
        directives[name] ||= createPresence()
        directives[name][sign === '+' ? 'positive' : 'negative'] = true
    }

    for (const tokens of extractAdjacentPixivSettingTokenGroups(text)) {
        for (const token of tokens) {
            const sign = token[0]
            const name = aliasToCanonicalName.get(token.slice(1).toLowerCase())
            if (!name) break
            directives[name] ||= createPresence()
            directives[name][sign === '+' ? 'positive' : 'negative'] = true
        }
    }

    const isSettingsCommand = normalizedText === '/s' || normalizedText.startsWith('/s ')
    const body = isSettingsCommand
        ? text.trim().replace(/^\/s(?:\s+|$)/, '')
        : text

    return {
        text,
        normalizedText,
        body,
        directives,
        unknownDirectives,
        isSettingsCommand,
        isImportPayload: text.startsWith('eyJ'),
        hasKnownDirectives: Object.keys(directives).length > 0
    }
}

export function classifySettingsCommand(parsedInput, { hasMetadata = false } = {}) {
    if (parsedInput.normalizedText === '/s') {
        return SettingsCommand.EXPORT
    }
    if (parsedInput.normalizedText === '/s reset') {
        return SettingsCommand.RESET
    }
    if (parsedInput.isImportPayload) {
        return SettingsCommand.IMPORT
    }
    if (parsedInput.isSettingsCommand &&
        (parsedInput.hasKnownDirectives || hasMetadata)) {
        return SettingsCommand.SAVE
    }
    return SettingsCommand.NONE
}

export function hasPositiveDirective(parsedInput, name) {
    return parsedInput.directives[name]?.positive === true
}

export function hasNegativeDirective(parsedInput, name) {
    return parsedInput.directives[name]?.negative === true
}
