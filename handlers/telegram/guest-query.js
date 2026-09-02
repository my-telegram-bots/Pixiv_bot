import { extractPixivIds } from '#handlers/telegram/input-parser'
import { parseSettingsInput } from '#handlers/telegram/settings-command-parser'
import {
    createDefaultUserSettings,
    mergeStoredSetting,
    resolveRequestSettings
} from '#handlers/telegram/settings-resolver'
import {
    INLINE_SETTINGS_BUDGET_MS,
    createInlineDeadline,
    settleBefore
} from '#handlers/telegram/inline-query'
import { buildIllustrationInlineResults } from '#handlers/telegram/illustration-inline-result'
import removeMd from 'remove-markdown'

export const GuestQueryError = Object.freeze({
    INPUT_REQUIRED: 'GUEST_INPUT_REQUIRED',
    MULTIPLE_ILLUSTRATIONS: 'GUEST_MULTIPLE_ILLUSTRATIONS',
    UNSUPPORTED_INPUT: 'GUEST_UNSUPPORTED_INPUT',
    NOT_FOUND: 'PIXIV_ILLUSTRATION_NOT_FOUND',
    LOOKUP_TIMEOUT: 'GUEST_LOOKUP_TIMEOUT',
    LOOKUP_FAILED: 'GUEST_LOOKUP_FAILED',
    MEDIA_UNAVAILABLE: 'GUEST_MEDIA_UNAVAILABLE',
    REQUEST_FAILED: 'GUEST_REQUEST_FAILED',
    ANSWER_FAILED: 'GUEST_ANSWER_FAILED'
})

const FAILURE_KEYS = Object.freeze({
    [GuestQueryError.INPUT_REQUIRED]: 'guest_input_required',
    [GuestQueryError.MULTIPLE_ILLUSTRATIONS]: 'guest_multiple_illustrations',
    [GuestQueryError.UNSUPPORTED_INPUT]: 'guest_unsupported_input',
    [GuestQueryError.NOT_FOUND]: 'guest_illustration_not_found',
    [GuestQueryError.LOOKUP_TIMEOUT]: 'guest_lookup_timeout',
    [GuestQueryError.LOOKUP_FAILED]: 'guest_lookup_failed',
    [GuestQueryError.MEDIA_UNAVAILABLE]: 'guest_media_unavailable',
    [GuestQueryError.REQUEST_FAILED]: 'guest_request_failed'
})

const GUEST_SAFE_DIRECTIVES = new Set([
    'tags',
    'description',
    'open',
    'caption_above',
    'share',
    'remove_keyboard',
    'remove_caption',
    'show_id',
    'spoiler',
    'auto_spoiler',
    'rm'
])

function clone(value) {
    return globalThis.structuredClone
        ? globalThis.structuredClone(value)
        : JSON.parse(JSON.stringify(value))
}

function safeLabel(value, fallback = 'unknown') {
    const normalized = String(value ?? '')
        .replace(/[^a-z0-9_.:-]/gi, '_')
        .slice(0, 80)
    return normalized || fallback
}

function requestId(ctx) {
    return safeLabel(ctx.update?.update_id, 'unscoped')
}

function logGuestFailure(logger, ctx, { illustId, code, stage }) {
    logger.warn?.(
        `[guest_query] request=${requestId(ctx)} illust=${safeLabel(illustId)} ` +
        `code=${safeLabel(code)} stage=${safeLabel(stage)}`
    )
}

export function formatGuestAdminReport({ requestId: id, illustId, errorCode, stage }) {
    return '[guest-error] ' +
        `request=${safeLabel(id, 'unscoped')} ` +
        `illust=${safeLabel(illustId)} ` +
        `code=${safeLabel(errorCode)} ` +
        `stage=${safeLabel(stage)}`
}

function reportGuestFailure(dependencies, ctx, { illustId, code, stage }) {
    if (typeof dependencies.reportError !== 'function') return
    const fields = {
        requestId: requestId(ctx),
        illustId: Number.isSafeInteger(illustId) ? illustId : undefined,
        errorCode: safeLabel(code),
        stage: safeLabel(stage)
    }
    try {
        Promise.resolve(dependencies.reportError(fields)).catch(() => {
            logGuestFailure(dependencies.logger, ctx, {
                illustId,
                code: 'GUEST_ADMIN_REPORT_FAILED',
                stage: 'report'
            })
        })
    } catch {
        logGuestFailure(dependencies.logger, ctx, {
            illustId,
            code: 'GUEST_ADMIN_REPORT_FAILED',
            stage: 'report'
        })
    }
}

export function stripGuestBotMention(text, username) {
    const source = String(text || '')
    if (!username) return source.trim()
    const escapedUsername = String(username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return source.replace(new RegExp(`@${escapedUsername}\\b`, 'gi'), '').trim()
}

export function createGuestSettingsResolver(options) {
    const {
        getUserSettings,
        logger = console,
        now = Date.now,
        settingsBudgetMs = INLINE_SETTINGS_BUDGET_MS
    } = options

    return async function resolveGuestSettings(ctx, deadline) {
        const parsedInput = parseSettingsInput(ctx.text)
        const userId = ctx.user_id || ctx.from?.id || ctx.guestMessage?.from?.id
        let storedSetting = null
        if (Number.isSafeInteger(userId) && typeof getUserSettings === 'function') {
            const settingsDeadline = Math.min(
                deadline.workDeadlineAt,
                now() + settingsBudgetMs
            )
            const result = settingsDeadline <= now()
                ? { status: 'timeout' }
                : await settleBefore(
                    Promise.resolve().then(() => getUserSettings(userId)),
                    settingsDeadline,
                    { now }
                )
            if (result.status === 'fulfilled') {
                storedSetting = result.value
            } else {
                logGuestFailure(logger, ctx, {
                    code: result.status === 'timeout'
                        ? 'GUEST_SETTINGS_TIMEOUT'
                        : 'GUEST_SETTINGS_FAILED',
                    stage: 'settings'
                })
            }
        }

        const base = mergeStoredSetting(createDefaultUserSettings(), storedSetting)
        const settings = resolveRequestSettings(base, parsedInput, 'guest', null)
        settings.telegraph = false
        settings.asfile = false
        settings.append_file = false
        settings.append_file_immediate = false
        settings.single_caption = false
        ctx.us = clone(settings)
        return ctx.us
    }
}

function createFailureResult(ctx, code, dependencies) {
    const key = FAILURE_KEYS[code] || FAILURE_KEYS[GuestQueryError.REQUEST_FAILED]
    return {
        type: 'article',
        id: `guest_${code}`.slice(0, 64),
        title: dependencies.localize(ctx.l, 'guest_error_title'),
        input_message_content: {
            message_text: dependencies.localize(ctx.l, key),
            parse_mode: 'MarkdownV2'
        }
    }
}

async function answerGuestOnce(ctx, state, result, dependencies) {
    if (state.answered) return false
    state.answered = true
    const remaining = Math.max(1, state.deadline.answerDeadlineAt - dependencies.now())
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(remaining)
        : undefined
    try {
        await ctx.answerGuestQuery(result, signal)
    } catch {
        logGuestFailure(dependencies.logger, ctx, {
            illustId: state.illustId,
            code: GuestQueryError.ANSWER_FAILED,
            stage: 'answer'
        })
        reportGuestFailure(dependencies, ctx, {
            illustId: state.illustId,
            code: GuestQueryError.ANSWER_FAILED,
            stage: 'answer'
        })
    }
    return true
}

async function answerFailure(ctx, state, code, stage, dependencies) {
    logGuestFailure(dependencies.logger, ctx, {
        illustId: state.illustId,
        code,
        stage
    })
    if ([
        GuestQueryError.LOOKUP_FAILED,
        GuestQueryError.MEDIA_UNAVAILABLE,
        GuestQueryError.REQUEST_FAILED
    ].includes(code)) {
        reportGuestFailure(dependencies, ctx, {
            illustId: state.illustId,
            code,
            stage
        })
    }
    return answerGuestOnce(ctx, state, createFailureResult(ctx, code, dependencies), dependencies)
}

function classifyGuestInput(ctx) {
    const text = ctx.text.trim()
    if (!text) return { errorCode: GuestQueryError.INPUT_REQUIRED }

    const parsedSettings = parseSettingsInput(text)
    if (parsedSettings.isSettingsCommand || parsedSettings.isImportPayload ||
        parsedSettings.unknownDirectives.length > 0 || text.startsWith('/') ||
        Object.keys(parsedSettings.directives).some(name => !GUEST_SAFE_DIRECTIVES.has(name))) {
        return { errorCode: GuestQueryError.UNSUPPORTED_INPUT }
    }

    const ids = extractPixivIds(text)
    if (ids.author.length > 0 || ids.novel.length > 0) {
        return { errorCode: GuestQueryError.UNSUPPORTED_INPUT }
    }
    if (ids.illust.length > 1) {
        return { errorCode: GuestQueryError.MULTIPLE_ILLUSTRATIONS }
    }
    if (ids.illust.length === 0) {
        return { errorCode: GuestQueryError.UNSUPPORTED_INPUT }
    }
    return { illustId: ids.illust[0] }
}

function selectGuestResult(built, ctx, dependencies) {
    const first = built.results[0]
    if (!first) return null
    if (first.type !== 'photo' || built.pageCount <= 1) return first

    const notice = dependencies.localize(ctx.l, 'guest_multipage_notice', built.pageCount)
    const selected = {
        ...first,
        caption: [first.caption, notice].filter(Boolean).join('\n\n')
    }
    if (Array.from(selected.caption).length <= 1024) return selected

    selected.caption = Array.from(
        [notice, removeMd(first.caption || '')].filter(Boolean).join('\n\n')
    ).slice(0, 1024).join('')
    delete selected.parse_mode
    return selected
}

export function createGuestQueryHandler(dependencies) {
    const deps = {
        now: Date.now,
        logger: console,
        existingOnlyUgoira: true,
        ...dependencies
    }
    const resolveGuestSettings = dependencies.resolveGuestSettings ||
        createGuestSettingsResolver(deps)

    return async function handleGuestQuery(ctx) {
        const deadline = ctx.guestDeadline || createInlineDeadline(deps.now())
        const state = { answered: false, deadline, illustId: undefined }
        const guestMessage = ctx.guestMessage
        const caller = guestMessage?.guest_bot_caller_user ||
            ctx.from || guestMessage?.from
        ctx.l = caller?.language_code || 'en'
        ctx.user_id = caller?.id
        const botUsername = typeof deps.botUsername === 'function'
            ? deps.botUsername(ctx)
            : deps.botUsername || ctx.me?.username
        ctx.text = stripGuestBotMention(
            guestMessage?.text || guestMessage?.caption || '',
            botUsername
        )

        try {
            const input = classifyGuestInput(ctx)
            if (input.errorCode) {
                await answerFailure(ctx, state, input.errorCode, 'input', deps)
                return
            }
            state.illustId = input.illustId

            await resolveGuestSettings(ctx, deadline)
            if (deps.now() >= deadline.workDeadlineAt) {
                await answerFailure(
                    ctx,
                    state,
                    GuestQueryError.LOOKUP_TIMEOUT,
                    'lookup',
                    deps
                )
                return
            }
            const settled = await settleBefore(
                buildIllustrationInlineResults(input.illustId, ctx.us, deps),
                deadline.workDeadlineAt,
                { now: deps.now }
            )
            if (settled.status === 'timeout') {
                await answerFailure(
                    ctx,
                    state,
                    GuestQueryError.LOOKUP_TIMEOUT,
                    'lookup',
                    deps
                )
                return
            }
            if (settled.status === 'rejected') {
                await answerFailure(ctx, state, GuestQueryError.LOOKUP_FAILED, 'lookup', deps)
                return
            }

            const built = settled.value
            if (built.errorCode === 'PIXIV_ILLUSTRATION_NOT_FOUND') {
                await answerFailure(ctx, state, GuestQueryError.NOT_FOUND, 'lookup', deps)
                return
            }
            const result = selectGuestResult(built, ctx, deps)
            if (!result) {
                const code = built.redirectId || built.errorCode?.includes('MEDIA') ||
                    built.errorCode?.includes('RESULT')
                    ? GuestQueryError.MEDIA_UNAVAILABLE
                    : GuestQueryError.LOOKUP_FAILED
                await answerFailure(ctx, state, code, 'result', deps)
                return
            }

            deps.logger.dev?.(
                `[guest_query] request=${requestId(ctx)} illust=${safeLabel(state.illustId)} ` +
                'code=GUEST_OK stage=answer'
            )
            await answerGuestOnce(ctx, state, result, deps)
        } catch {
            await answerFailure(ctx, state, GuestQueryError.REQUEST_FAILED, 'handler', deps)
        }
    }
}

export function registerGuestQueryHandler(bot, handler) {
    bot.on('guest_message', handler)
}

export function guestModeStartupMessage(botInfo) {
    return botInfo?.supports_guest_queries === true
        ? { enabled: true, message: '✓ Telegram Guest Mode enabled' }
        : {
            enabled: false,
            message: '⚠ Telegram Guest Mode is disabled; enable it in BotFather to receive guest_message updates'
        }
}
