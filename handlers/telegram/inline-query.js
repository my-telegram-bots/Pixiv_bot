import { parseSettingsInput } from '#handlers/telegram/settings-command-parser'
import {
    createDefaultUserSettings,
    resolveRequestSettings
} from '#handlers/telegram/settings-resolver'

export const INLINE_TOTAL_BUDGET_MS = 4500
export const INLINE_ANSWER_RESERVE_MS = 750
export const INLINE_SETTINGS_BUDGET_MS = 750
export const INLINE_ITEMS_PER_PAGE = 20
export const INLINE_RESULT_LIMIT = 50
export const INLINE_DIRECT_LOOKUP_BUDGET_MS = 1400
export const INLINE_RANKING_BUDGET_MS = 1200
export const INLINE_SEARCH_BUDGET_MS = 800
export const INLINE_DIRECT_RESULT_GRACE_MS = 60
export const INLINE_DIRECT_ID_LIMIT = 8

const INLINE_SETTINGS_CACHE_TTL_MS = 2000

function clone(value) {
    return globalThis.structuredClone
        ? globalThis.structuredClone(value)
        : JSON.parse(JSON.stringify(value))
}

function isHttpUrl(value) {
    if (typeof value !== 'string') return false
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
        return false
    }
}

function boundedSwitchParameter(ids, separator) {
    let result = ''
    for (const id of ids) {
        const candidate = result ? `${result}${separator}${id}` : String(id)
        if (Buffer.byteLength(candidate, 'utf8') > 64) break
        result = candidate
    }
    return result
}

export function createInlineDeadline(receivedAt = Date.now(), options = {}) {
    const totalBudgetMs = options.totalBudgetMs ?? INLINE_TOTAL_BUDGET_MS
    const answerReserveMs = Math.min(
        options.answerReserveMs ?? INLINE_ANSWER_RESERVE_MS,
        totalBudgetMs
    )
    return {
        receivedAt,
        workDeadlineAt: receivedAt + totalBudgetMs - answerReserveMs,
        answerDeadlineAt: receivedAt + totalBudgetMs
    }
}

export function normalizeInlineOffset(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return 0
    const offset = Number.parseInt(value, 10)
    return Number.isSafeInteger(offset) && offset <= 10000 ? offset : 0
}

export async function settleBefore(promise, deadlineAt, dependencies = {}) {
    const now = dependencies.now || Date.now
    const setTimer = dependencies.setTimer || setTimeout
    const clearTimer = dependencies.clearTimer || clearTimeout
    const remaining = deadlineAt - now()
    const settled = Promise.resolve(promise).then(
        value => ({ status: 'fulfilled', value }),
        reason => ({ status: 'rejected', reason })
    )
    if (remaining <= 0) {
        settled.catch(() => { })
        return { status: 'timeout' }
    }
    let timer
    const timeout = new Promise(resolve => {
        timer = setTimer(() => resolve({ status: 'timeout' }), remaining)
    })
    const result = await Promise.race([settled, timeout])
    clearTimer(timer)
    return result
}

export async function collectBefore(promises, deadlineAt, dependencies = {}) {
    const completed = new Array(promises.length)
    const work = promises.map((promise, index) => Promise.resolve(promise).then(
        value => { completed[index] = { status: 'fulfilled', value } },
        reason => { completed[index] = { status: 'rejected', reason } }
    ))
    await settleBefore(Promise.all(work), deadlineAt, dependencies)
    return completed
}

export async function collectResponsive(promises, deadlineAt, dependencies = {}) {
    const now = dependencies.now || Date.now
    const maximumWaitMs = dependencies.maximumWaitMs ?? INLINE_DIRECT_LOOKUP_BUDGET_MS
    const graceMs = dependencies.graceMs ?? INLINE_DIRECT_RESULT_GRACE_MS
    const isUseful = dependencies.isUseful || (value => Boolean(value))
    const completed = new Array(promises.length)
    let firstUseful
    const useful = new Promise(resolve => { firstUseful = resolve })
    const work = promises.map((promise, index) => Promise.resolve(promise).then(
        value => {
            completed[index] = { status: 'fulfilled', value }
            if (isUseful(value)) firstUseful()
        },
        reason => { completed[index] = { status: 'rejected', reason } }
    ))
    const all = Promise.all(work)
    const maximumDeadline = Math.min(deadlineAt, now() + maximumWaitMs)
    const first = await settleBefore(Promise.race([
        all.then(() => 'all'),
        useful.then(() => 'useful')
    ]), maximumDeadline, { now })
    if (first.status === 'fulfilled' && first.value === 'useful') {
        await settleBefore(all, Math.min(maximumDeadline, now() + graceMs), { now })
    }
    return completed
}

export function createInlineDefaultSettings(text = '') {
    return resolveRequestSettings(
        createDefaultUserSettings(),
        parseSettingsInput(text),
        'inline',
        null
    )
}

export function createInlineSettingsResolver(options) {
    const {
        resolveUserSettings,
        logger = console,
        now = Date.now,
        settingsBudgetMs = INLINE_SETTINGS_BUDGET_MS,
        cacheTtlMs = INLINE_SETTINGS_CACHE_TTL_MS
    } = options
    const cache = new Map()
    const inFlight = new Map()

    return async function resolveInlineSettings(ctx) {
        const userId = ctx.user_id || ctx.from?.id
        const parsed = parseSettingsInput(ctx.text)
        const directiveKey = Object.keys(parsed.directives).sort().map(name => {
            const directive = parsed.directives[name]
            return `${name}:${Number(directive.positive)}${Number(directive.negative)}`
        }).join(',')
        const cacheKey = `${userId}:${directiveKey}`
        const cached = cache.get(cacheKey)
        if (cached && cached.expiresAt > now()) {
            ctx.us = clone(cached.settings)
            return ctx.us
        }

        const requestDeadline = ctx.inlineDeadline?.workDeadlineAt ?? now() + settingsBudgetMs
        const settingsDeadline = Math.min(requestDeadline, now() + settingsBudgetMs)
        let operation = inFlight.get(cacheKey)
        if (!operation) {
            const isolatedCtx = Object.create(ctx)
            isolatedCtx.type = 'inline'
            const lookup = Promise.resolve().then(() => resolveUserSettings(isolatedCtx))
            operation = settleBefore(lookup, settingsDeadline, { now }).then(result => {
                if (result.status === 'rejected') throw result.reason
                const settings = result.status === 'fulfilled' ? result.value : null
                if (settings && settings !== 'error') {
                    if (cache.size >= 500) cache.delete(cache.keys().next().value)
                    cache.set(cacheKey, {
                        settings: clone(settings),
                        expiresAt: now() + cacheTtlMs
                    })
                }
                return settings
            }).finally(() => inFlight.delete(cacheKey))
            inFlight.set(cacheKey, operation)
        }
        const result = await settleBefore(operation, settingsDeadline, { now })
        if (result.status === 'fulfilled' && result.value && result.value !== 'error') {
            ctx.us = clone(result.value)
            return ctx.us
        }

        if (result.status === 'rejected') {
            logger.warn('[inline_query] Settings lookup failed, using request defaults:', result.reason)
        } else {
            logger.warn('[inline_query] Settings lookup exceeded its budget, using request defaults')
        }
        ctx.us = createInlineDefaultSettings(ctx.text)
        return ctx.us
    }
}

function photoResults(illust, ctx, dependencies) {
    const sizes = illust?.imgs_?.size || []
    const urls = illust?.imgs_?.regular_urls || []
    const results = []
    for (let page = 0; page < sizes.length; page++) {
        const url = urls[page]
        const thumbnailUrl = illust.imgs_.thumb_urls?.[page] || url
        if (!isHttpUrl(url) || !isHttpUrl(thumbnailUrl)) continue
        try {
            results.push({
                type: 'photo',
                id: `p_${illust.id}-${page}`,
                photo_url: url,
                thumbnail_url: thumbnailUrl,
                caption: dependencies.format(illust, ctx.us, 'inline', page),
                photo_width: sizes[page]?.width,
                photo_height: sizes[page]?.height,
                parse_mode: 'MarkdownV2',
                show_caption_above_media: ctx.us.caption_above,
                ...dependencies.keyboard(illust.id, ctx.us)
            })
        } catch (error) {
            dependencies.logger.warn('[inline_query] Skipping malformed illustration page:', illust.id, page, error)
        }
    }
    return results
}

async function illustrationResults(id, ctx, dependencies) {
    const resolved = await dependencies.illustService.resolve(id, {
        mode: 'cache-first',
        lightweight: true
    })
    if (resolved.kind !== 'ready') return { results: [] }
    const illust = resolved.illustration
    if (illust.type <= 1) {
        return { results: photoResults(illust, ctx, dependencies) }
    }
    if (illust.type !== 2) return { results: [] }

    let common
    try {
        common = {
            type: 'mpeg4_gif',
            id: `p${illust.id}`,
            caption: dependencies.format(illust, ctx.us, 'inline', 1),
            parse_mode: 'MarkdownV2',
            show_caption_above_media: ctx.us.caption_above,
            ...dependencies.keyboard(illust.id, ctx.us)
        }
    } catch (error) {
        dependencies.logger.warn('[inline_query] Skipping malformed ugoira result:', illust.id, error)
        return { results: [] }
    }
    if (ctx.us.spoiler) common.has_spoiler = true
    if (typeof illust.tg_file_id === 'string' && illust.tg_file_id) {
        return { results: [{ ...common, mpeg4_file_id: illust.tg_file_id }] }
    }
    const url = await dependencies.detectUgoiraUrl(illust, 'mp4')
    if (isHttpUrl(url) && isHttpUrl(illust.imgs_?.cover_img_url)) {
        return {
            results: [{
                ...common,
                mpeg4_url: url,
                thumbnail_url: illust.imgs_.cover_img_url
            }]
        }
    }
    return { results: [], redirectId: illust.id }
}

function searchResults(illusts, ctx, dependencies, maximum) {
    const results = []
    for (const illust of illusts) {
        if (results.length >= maximum) break
        if (illust.type <= 1) {
            results.push(...photoResults(illust, ctx, dependencies).slice(0, maximum - results.length))
        } else if (illust.type === 2 && illust.tg_file_id) {
            try {
                const item = {
                    type: 'mpeg4_gif',
                    id: `p${illust.id}`,
                    mpeg4_file_id: illust.tg_file_id,
                    caption: dependencies.format(illust, ctx.us, 'inline', 1),
                    parse_mode: 'MarkdownV2',
                    show_caption_above_media: ctx.us.caption_above,
                    ...dependencies.keyboard(illust.id, ctx.us)
                }
                if (ctx.us.spoiler) item.has_spoiler = true
                results.push(item)
            } catch (error) {
                dependencies.logger.warn('[inline_query] Skipping malformed cached ugoira:', illust.id, error)
            }
        }
    }
    return results
}

async function answerOnce(ctx, state, results, options, dependencies) {
    if (state.answered) return false
    state.answered = true
    const remaining = Math.max(1, state.deadline.answerDeadlineAt - dependencies.now())
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(remaining)
        : undefined
    try {
        await ctx.answerInlineQuery(results.slice(0, INLINE_RESULT_LIMIT), options, signal)
    } catch (error) {
        if (error?.description?.includes('query is too old') || error?.name === 'TimeoutError') {
            dependencies.logger.warn('[inline_query] Telegram rejected or timed out an expired query')
        } else {
            dependencies.logger.error('[inline_query] Failed to answer query:', error)
            await dependencies.reportError?.(error, ctx)
        }
    }
    return true
}

export function createInlineQueryHandler(dependencies) {
    const deps = {
        now: Date.now,
        logger: console,
        dbLess: () => Boolean(process.env.DBLESS),
        ...dependencies
    }

    return async function handleInlineQuery(ctx) {
        const deadline = ctx.inlineDeadline || createInlineDeadline(deps.now())
        const state = { answered: false, deadline }
        const offset = normalizeInlineOffset(ctx.inlineQuery.offset)
        const query = ctx.text || ''
        const ids = ctx.ids || { illust: [] }
        const options = {
            cache_time: 20,
            is_personal: !ctx.us.setting.dbless
        }
        let results = []

        try {
            if (ids.illust.length > 0) {
                const uniqueIds = [...new Set(ids.illust)].slice(0, INLINE_DIRECT_ID_LIMIT)
                const completed = await collectResponsive(
                    uniqueIds.map(id => illustrationResults(id, ctx, deps)),
                    deadline.workDeadlineAt,
                    {
                        now: deps.now,
                        isUseful: value => value.results.length > 0 || Boolean(value.redirectId)
                    }
                )
                const redirects = []
                const hasIncompleteLookup = completed.includes(undefined)
                for (const item of completed) {
                    if (item?.status === 'fulfilled') {
                        results.push(...item.value.results)
                        if (item.value.redirectId) redirects.push(item.value.redirectId)
                    } else if (item?.status === 'rejected') {
                        deps.logger.warn('[inline_query] Illustration result failed:', item.reason)
                    }
                }
                if (hasIncompleteLookup) options.cache_time = 0
                if (redirects.length > 0) {
                    options.switch_pm_text = deps.localize(ctx.l, 'pm_to_generate_ugoira')
                    options.switch_pm_parameter = boundedSwitchParameter(redirects, '-_-')
                    options.cache_time = 0
                } else if (results.length > 1 && uniqueIds.length < 8) {
                    options.switch_pm_text = deps.localize(ctx.l, 'pm_to_get_all_illusts')
                    options.switch_pm_parameter = boundedSwitchParameter(uniqueIds, '-')
                } else if (results.length === 0 && hasIncompleteLookup && uniqueIds.length < 8) {
                    options.switch_pm_text = deps.localize(ctx.l, 'inline_lookup_timeout')
                    options.switch_pm_parameter = boundedSwitchParameter(uniqueIds, '-')
                    options.cache_time = 0
                }
                const start = offset * INLINE_ITEMS_PER_PAGE
                if (results.length > start + INLINE_ITEMS_PER_PAGE) {
                    options.next_offset = String(offset + 1)
                }
                results = results.slice(start, start + INLINE_ITEMS_PER_PAGE)
            } else if (query.trim() === '') {
                const ranking = await settleBefore(
                    deps.handleRanking([offset + 1], ctx.us),
                    Math.min(deadline.workDeadlineAt, deps.now() + INLINE_RANKING_BUDGET_MS),
                    { now: deps.now }
                )
                if (ranking.status === 'fulfilled' && ranking.value) {
                    results = (ranking.value.data || []).slice(0, INLINE_ITEMS_PER_PAGE)
                    if (ranking.value.next_offset) options.next_offset = String(offset + 1)
                } else if (ranking.status === 'rejected') {
                    deps.logger.warn('[inline_query] Ranking failed:', ranking.reason)
                }
            } else if (!deps.dbLess()) {
                const pagesPerBatch = 2
                const batchSize = 30
                const skip = Math.floor(offset / pagesPerBatch) * batchSize
                const search = deps.db.collection.illust.find({ tags: query.trim() })
                    .sort({ id: -1 })
                    .skip(skip)
                    .limit(batchSize)
                    .toArray()
                const settled = await settleBefore(
                    search,
                    Math.min(deadline.workDeadlineAt, deps.now() + INLINE_SEARCH_BUDGET_MS),
                    { now: deps.now }
                )
                if (settled.status === 'fulfilled') {
                    const built = searchResults(
                        settled.value,
                        ctx,
                        deps,
                        pagesPerBatch * INLINE_ITEMS_PER_PAGE + 1
                    )
                    const start = (offset % pagesPerBatch) * INLINE_ITEMS_PER_PAGE
                    if (built.length > start + INLINE_ITEMS_PER_PAGE || settled.value.length === batchSize) {
                        options.next_offset = String(offset + 1)
                    }
                    results = built.slice(start, start + INLINE_ITEMS_PER_PAGE)
                } else if (settled.status === 'rejected') {
                    deps.logger.warn('[inline_query] Search failed:', settled.reason)
                }
            }
        } catch (error) {
            deps.logger.error('[inline_query] Handler failed:', error)
        }

        deps.logger.dev?.(
            `[inline_query] Answering query with ${results.length} result(s) after ${deps.now() - deadline.receivedAt}ms`
        )
        await answerOnce(ctx, state, results, options, deps)
    }
}
