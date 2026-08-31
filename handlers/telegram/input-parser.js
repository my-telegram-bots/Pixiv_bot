const PIXIV_URL_PATTERN = /(?<![\w.-])(?:https?:\/\/)*(?:www\.)?(?:phixiv|pixiv)\.net\/[^\s+<>()\[\]{}"',;!]+/gi
const STANDALONE_ILLUST_ID_PATTERN = /^(?:#|id=?)?(\d{8,9})$/i

const PIXIV_ROUTE_MATCHERS = Object.freeze([
    { type: 'illust', path: /^\/(?:artworks|i)\/(\d+)/i },
    { type: 'illust', path: /^\/member_illust\.php\/?$/i, query: 'illust_id' },
    { type: 'novel', path: /^\/novel\/show\.php\/?$/i, query: 'id' },
    { type: 'author', path: /^\/(?:users|u)\/(\d+)/i }
])

function emptyPixivIds() {
    return {
        illust: [],
        author: [],
        novel: []
    }
}

function toPositiveInteger(value) {
    if (!/^\d+$/.test(value || '')) {
        return null
    }
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

function normalizePixivUrl(candidate) {
    const normalized = candidate
        .replace(/^(?:https?:\/\/)+/i, '')
        .replace(/^www\./i, '')
        .replace(/^phixiv\.net/i, 'pixiv.net')

    try {
        const url = new URL(`https://${normalized}`)
        if (url.hostname !== 'pixiv.net') {
            return null
        }
        url.pathname = url.pathname.replace(/^\/en(?=\/)/i, '')
        return url
    } catch {
        return null
    }
}

function matchPixivUrl(candidate) {
    const url = normalizePixivUrl(candidate)
    if (!url) {
        return null
    }

    for (const route of PIXIV_ROUTE_MATCHERS) {
        const pathMatch = url.pathname.match(route.path)
        if (!pathMatch) {
            continue
        }
        const id = toPositiveInteger(route.query
            ? url.searchParams.get(route.query)
            : pathMatch[1])
        return id === null ? null : { type: route.type, id }
    }
    return null
}

function collectAdjacentDirectiveTokens(text, offset) {
    const tokens = []
    let remaining = text.slice(offset)
    let consumed = 0
    const directive = /^([+-])([a-z][a-z0-9_]*)(?=$|[^\w])/i

    while (remaining) {
        const match = remaining.match(directive)
        if (!match) break
        tokens.push(`${match[1]}${match[2]}`)
        consumed += match[0].length
        remaining = text.slice(offset + consumed)
    }
    return tokens
}

export function extractAdjacentPixivSettingTokenGroups(input = '') {
    const text = String(input)
    const groups = []

    for (const candidate of text.matchAll(PIXIV_URL_PATTERN)) {
        const url = normalizePixivUrl(candidate[0])
        if (!url || url.search || url.hash || !matchPixivUrl(candidate[0])) continue
        const tokens = collectAdjacentDirectiveTokens(
            text,
            candidate.index + candidate[0].length
        )
        if (tokens.length > 0) groups.push(tokens)
    }

    const standalonePattern = /(?:^|\s)(?:#|id=?)?(\d{8,9})(?=[+-])/gi
    for (const match of text.matchAll(standalonePattern)) {
        if (toPositiveInteger(match[1]) === null) continue
        const tokens = collectAdjacentDirectiveTokens(text, match.index + match[0].length)
        if (tokens.length > 0) groups.push(tokens)
    }

    return groups
}

function collectStandaloneIllustIds(text, ids) {
    text
        .replace(PIXIV_URL_PATTERN, ' ')
        .replace(/-_-|[+-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .forEach(candidate => {
            const match = candidate.match(STANDALONE_ILLUST_ID_PATTERN)
            const id = toPositiveInteger(match?.[1])
            if (id !== null) {
                ids.illust.push(id)
            }
        })
}

export function extractPixivIds(input) {
    const ids = emptyPixivIds()
    if (input === null || input === undefined || input === '') {
        return ids
    }

    const text = extractInputValues(String(input)).remainingText
    for (const candidate of text.matchAll(PIXIV_URL_PATTERN)) {
        const match = matchPixivUrl(candidate[0])
        if (match) {
            ids[match.type].push(match.id)
        }
    }
    collectStandaloneIllustIds(text, ids)
    return ids
}

const VALUE_KEYS = Object.freeze({
    title: 'title',
    author_name: 'author_name',
    author_url: 'author_url',
    an: 'author_name',
    au: 'author_url'
})

export function extractInputValues(input = '') {
    const values = {}
    const remainingLines = String(input).split('\n').filter(line => {
        const separator = line.indexOf('=')
        if (separator < 0) {
            return true
        }

        const sourceKey = line.slice(0, separator).toLowerCase()
        const targetKey = VALUE_KEYS[sourceKey]
        if (!targetKey) {
            return true
        }

        const value = line.slice(separator + 1)
        values[targetKey] = value
        if (targetKey !== sourceKey) {
            values[sourceKey] = value
        }
        return false
    })

    return {
        ...values,
        remainingText: remainingLines.join('\n')
    }
}
