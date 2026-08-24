import { InputFile } from 'grammy'
import db from '#db'
import {
    asyncForEach,
    fetch_tmp_file,
    honsole,
    isStaleMediaError
} from '#handlers/common'
import { handle_illust } from '#handlers/telegram/handle_illust'
import { handle_novel } from '#handlers/telegram/handle_novel'
import { format } from '#handlers/telegram/format'
import { k_os } from '#handlers/telegram/keyboard'
import { _l } from '#handlers/telegram/i18n'
import { mg_albumize } from '#handlers/telegram/mediagroup'
import { mg2telegraph } from '#handlers/telegram/telegraph'
import { get_user_illusts } from '#handlers/pixiv/user'
import { ugoira_to_mp4 } from '#handlers/pixiv/tools'
import {
    catchily,
    classifyMediaSendError,
    MediaSendKind,
    sendMediaGroupWithRetry,
    sendPhotoWithRetry
} from '#handlers/telegram/sender'
import {
    rateLimit,
    sendDocumentWithChain,
    sendMediaGroupDocuments,
    updateReplyChain
} from '#handlers/telegram/file-sender'
import {
    createTgSenderMachine,
    runTgSenderStateMachine,
    summarizeTgSenderResult
} from '#handlers/telegram/tg-sender-state'
import {
    IllustrationLifecycleState,
    applyIllustrationRefresh,
    beginIllustrationRefresh,
    beginIllustrationSend,
    completeIllustration,
    createIllustrationLifecycle,
    failIllustration,
    markIllustrationOutputSent,
    markIllustrationPageSent,
    replaceRefreshedAlbumItems
} from '#handlers/telegram/illustration-lifecycle'

const terminalIllustrationStates = new Set([
    IllustrationLifecycleState.COMPLETED,
    IllustrationLifecycleState.NOT_FOUND,
    IllustrationLifecycleState.FAILED
])

function messageThreadOptions(ctx) {
    const messageThreadId = ctx.default_extra?.message_thread_id
    return messageThreadId ? { message_thread_id: messageThreadId } : {}
}

async function initializeInvocation(resolveUserSettings, ctx) {
    const runtime = {
        ctx,
        chatId: ctx.chat_id || ctx.message.chat.id,
        userId: ctx.user_id || ctx.from.id,
        text: ctx.text || '',
        defaultExtra: ctx.default_extra,
        ids: ctx.ids,
        illusts: [],
        lifecycles: new Map(),
        mediaGroups: [],
        files: [],
        deliveryErrors: [],
        mediaGroupExtra: ctx.message?.message_thread_id
            ? { message_thread_id: ctx.message.message_thread_id }
            : {}
    }

    if (!ctx.us) {
        ctx.us = await resolveUserSettings(ctx)
    }
    runtime.defaultExtra.show_caption_above_media = ctx.us.caption_above
    return runtime
}

async function collectIllustrations(bot, config, runtime) {
    const { ctx, chatId, userId, ids, defaultExtra } = runtime

    if (ids.author.length > 0 && userId === config.tg.master_id) {
        bot.api.sendChatAction(chatId, 'upload_photo', messageThreadOptions(ctx)).catch(() => { })
        await asyncForEach(ids.author, async id => {
            const authorIllusts = await get_user_illusts(id)
            await asyncForEach(authorIllusts, async illust => {
                const handled = await handle_illust(illust, ctx.us)
                if (handled.kind === 'ready') {
                    addResolvedIllustration(runtime, handled.illustration)
                } else {
                    runtime.deliveryErrors.push(
                        handled.code || (handled.kind === 'not_found'
                            ? 'PIXIV_ILLUSTRATION_NOT_FOUND'
                            : 'PIXIV_DETAIL_REQUEST_FAILED')
                    )
                }
            })
        })
    }

    if (ids.illust.length === 0) {
        return
    }

    const results = await Promise.allSettled(
        ids.illust.map(id => handle_illust(id, ctx.us))
    )
    let has404 = false
    let hasError = false

    for (const result of results) {
        if (result.status === 'rejected') {
            honsole.error('Failed to handle illust:', result.reason)
            hasError = true
            runtime.deliveryErrors.push(result.reason?.code || 'PIXIV_DETAIL_REQUEST_FAILED')
        } else if (result.value.kind === 'not_found') {
            has404 = true
            runtime.deliveryErrors.push('PIXIV_ILLUSTRATION_NOT_FOUND')
        } else if (result.value.kind === 'failed') {
            hasError = true
            runtime.deliveryErrors.push(result.value.code || 'PIXIV_DETAIL_REQUEST_FAILED')
        } else if (result.value.kind === 'ready') {
            addResolvedIllustration(runtime, result.value.illustration)
        }
    }

    if (chatId > 0 && runtime.illusts.length === 0) {
        if (has404) {
            await bot.api.sendMessage(chatId, _l(ctx.l, 'illust_404'), defaultExtra).catch(() => { })
        }
        if (hasError) {
            await bot.api.sendMessage(chatId, _l(ctx.l, 'error'), defaultExtra).catch(() => { })
        }
    }
}

function addResolvedIllustration(runtime, illust) {
    const lifecycle = createIllustrationLifecycle(illust)
    runtime.illusts.push(lifecycle.illust)
    runtime.lifecycles.set(lifecycle.id, lifecycle)
}

async function refreshIllustration(runtime, lifecycle, failedPage) {
    if (!beginIllustrationRefresh(lifecycle, failedPage)) {
        return false
    }
    const resolved = await handle_illust(lifecycle.id, runtime.ctx.us, false, 'refresh')
    if (resolved.kind === 'ready') {
        try {
            applyIllustrationRefresh(lifecycle, resolved.illustration)
        } catch (error) {
            honsole.error('Illustration refresh identity mismatch:', error)
            failIllustration(lifecycle, error.code || 'ILLUSTRATION_REFRESH_ID_MISMATCH')
            return false
        }
        const index = runtime.illusts.findIndex(illust => illust.id === lifecycle.id)
        if (index >= 0) runtime.illusts[index] = lifecycle.illust
        return true
    }
    failIllustration(
        lifecycle,
        resolved.kind === 'not_found'
            ? 'PIXIV_ILLUSTRATION_NOT_FOUND'
            : resolved.code || 'PIXIV_MEDIA_REFRESH_FAILED'
    )
    return false
}

async function notifyIllustrationFailure(bot, runtime, lifecycle) {
    if (lifecycle.failureNotified) return
    lifecycle.failureNotified = true
    const key = lifecycle.state === IllustrationLifecycleState.NOT_FOUND
        ? 'illust_404'
        : lifecycle.errorCode === 'ILLUSTRATION_REFRESH_ID_MISMATCH'
            ? 'illustration_refresh_id_mismatch'
        : lifecycle.errorCode === 'PIXIV_MEDIA_REFRESH_FAILED' || lifecycle.errorCode === 'PIXIV_DETAIL_REQUEST_FAILED'
            ? 'media_refresh_failed'
            : lifecycle.errorCode === 'PIXIV_MEDIA_STALE'
                ? 'media_send_failed'
                : 'media_delivery_failed'
    await bot.api.sendMessage(
        runtime.chatId,
        _l(runtime.ctx.l, key),
        runtime.defaultExtra
    ).catch(() => { })
}

function createMediaExtra(ctx, defaultExtra, illust) {
    const extra = {
        ...defaultExtra,
        ...k_os(illust.id, ctx.us)
    }
    if (ctx.us.spoiler) {
        extra.has_spoiler = ctx.us.spoiler
    }
    if (ctx.us.caption_above) {
        extra.show_caption_above_media = ctx.us.caption_above
    }
    return extra
}

function photoCandidates(item) {
    const urls = [item.media_r, item.media_o].filter(Boolean)
    return [...urls, ...urls.map(url => `dl-${url}`)]
}

async function sendStaticIllustration(bot, runtime, lifecycle, extra) {
    const { ctx, chatId, defaultExtra, files } = runtime
    let { reply_to_message_id: replyToMessageId } = extra
    let fileReplyToMessageId = replyToMessageId
    if (lifecycle.state === IllustrationLifecycleState.READY) beginIllustrationSend(lifecycle)

    for (let page = 0; page < lifecycle.illust.mediagroup.length; page++) {
        if (terminalIllustrationStates.has(lifecycle.state)) break
        const needsPhoto = !ctx.us.asfile
        const needsImmediateDocument = ctx.us.asfile || ctx.us.append_file_immediate
        const photoDone = !needsPhoto || lifecycle.sentPages.has(page)
        const documentDone = !needsImmediateDocument || lifecycle.sentOutputs.has(`document:${page}`)
        if (photoDone && documentDone) continue
        let illust = lifecycle.illust
        let item = illust.mediagroup[page]
        const extraOne = {
            ...extra,
            caption: ctx.us.single_caption
                ? format(illust, { ...ctx.us, single_caption: false }, 'message', page)
                : item.caption
        }

        if (needsPhoto && !lifecycle.sentPages.has(page)) {
            let result = await sendPhotoWithRetry(
                chatId,
                ctx.l,
                photoCandidates(item),
                { ...extraOne, reply_to_message_id: replyToMessageId }
            )
            if (result.kind === MediaSendKind.STALE_MEDIA && await refreshIllustration(runtime, lifecycle, page)) {
                illust = lifecycle.illust
                item = illust.mediagroup[page]
                result = await sendPhotoWithRetry(
                    chatId,
                    ctx.l,
                    photoCandidates(item),
                    { ...extraOne, reply_to_message_id: replyToMessageId }
                )
            }
            if (result.kind === MediaSendKind.SENT) {
                replyToMessageId = result.result.message_id
                markIllustrationPageSent(lifecycle, page)
            } else {
                honsole.warn('Failed to send photo for illust', illust.id, 'page', page)
                if (!terminalIllustrationStates.has(lifecycle.state)) {
                    failIllustration(lifecycle, result.code)
                }
                if (result.userNotified) lifecycle.failureNotified = true
                await notifyIllustrationFailure(bot, runtime, lifecycle)
                break
            }
        }

        if (needsImmediateDocument && !lifecycle.sentOutputs.has(`document:${page}`)) {
            const targetReplyId = ctx.us.append_file_immediate
                ? replyToMessageId
                : fileReplyToMessageId
            const documentResult = await sendDocumentWithChain({
                chat_id: chatId,
                media_url: item.media_o,
                extra: extraOne,
                lang: ctx.l,
                reply_to_message_id: targetReplyId,
                default_extra: defaultExtra,
                silent_error: true
            })
            if (documentResult.kind === MediaSendKind.SENT) {
                markIllustrationOutputSent(lifecycle, `document:${page}`)
                if (ctx.us.append_file_immediate) {
                    replyToMessageId = documentResult.result.message_id
                    fileReplyToMessageId = documentResult.result.message_id
                }
            } else if (documentResult.kind === MediaSendKind.STALE_MEDIA && await refreshIllustration(runtime, lifecycle, page)) {
                page--
                continue
            } else {
                if (!terminalIllustrationStates.has(lifecycle.state)) failIllustration(lifecycle, documentResult.code)
                if (documentResult.userNotified) lifecycle.failureNotified = true
                await notifyIllustrationFailure(bot, runtime, lifecycle)
                break
            }
        }

        if (ctx.us.append_file && !ctx.us.append_file_immediate) {
            const queuedKey = `queued-document:${page}`
            if (!lifecycle.sentOutputs.has(queuedKey)) {
                files.push({ lifecycle, page, extra: extraOne })
                markIllustrationOutputSent(lifecycle, queuedKey)
            }
        }
    }
}

async function resolveUgoiraMedia(illust) {
    const item = illust.mediagroup[0]
    let media = item.media_t || item.media_o
    if (!media) {
        media = await ugoira_to_mp4(illust)
    }
    return typeof media === 'string' && media.includes('tmp/')
        ? new InputFile(media)
        : media
}

async function sendUgoiraAnimation(bot, config, runtime, illust, media, extra) {
    const { ctx, chatId } = runtime
    const item = illust.mediagroup[0]
    let result

    try {
        result = await bot.api.sendAnimation(chatId, media, {
            ...extra,
            caption: item.caption
        })
    } catch (error) {
        if (typeof media === 'string' && media.includes(config.pixiv.ugoiraurl)) {
            honsole.warn('External ugoira URL failed, downloading to memory:', media)
            try {
                const arrayBuffer = await fetch_tmp_file(media)
                if (!arrayBuffer) {
                    throw new Error('Failed to download ugoira to memory')
                }
                result = await bot.api.sendAnimation(
                    chatId,
                    new InputFile(arrayBuffer, `${illust.id}.mp4`),
                    { ...extra, caption: item.caption }
                )
            } catch (downloadError) {
                honsole.error('Failed to download and send ugoira:', downloadError)
                const classification = classifyMediaSendError(downloadError)
                if (!classification.stale) await catchily(downloadError, chatId, ctx.l)
                return {
                    kind: classification.stale ? MediaSendKind.STALE_MEDIA : MediaSendKind.FAILED,
                    code: classification.code,
                    error: downloadError
                }
            }
        } else {
            const classification = classifyMediaSendError(error)
            if (!classification.stale) await catchily(error, chatId, ctx.l)
            return {
                kind: classification.stale ? MediaSendKind.STALE_MEDIA : MediaSendKind.FAILED,
                code: classification.code,
                error
            }
        }
    }

    if (!illust.tg_file_id && result?.document) {
        await db.collection.illust.updateOne({ id: illust.id }, {
            $set: { tg_file_id: result.document.file_id }
        })
    }
    if (result) {
        extra.reply_to_message_id = result.message_id
        return { kind: MediaSendKind.SENT, result }
    }
    return { kind: MediaSendKind.FAILED, code: 'TELEGRAM_MEDIA_SEND_FAILED' }
}

async function sendUgoira(bot, config, runtime, lifecycle, extra) {
    const { ctx, chatId, defaultExtra, files } = runtime
    if (lifecycle.state === IllustrationLifecycleState.READY) beginIllustrationSend(lifecycle)
    let illust = lifecycle.illust
    let item = illust.mediagroup[0]
    let sent = false
    let queued = false
    let failureCode = null

    bot.api.sendChatAction(chatId, 'upload_video', messageThreadOptions(ctx)).catch(() => { })
    let media
    try {
        media = await resolveUgoiraMedia(illust)
    } catch (error) {
        if (isStaleMediaError(error) && await refreshIllustration(runtime, lifecycle, 0)) {
            illust = lifecycle.illust
            item = illust.mediagroup[0]
            try {
                media = await resolveUgoiraMedia(illust)
            } catch (retryError) {
                failIllustration(lifecycle, classifyMediaSendError(retryError).code)
                await notifyIllustrationFailure(bot, runtime, lifecycle)
                return
            }
        } else {
            if (!terminalIllustrationStates.has(lifecycle.state)) {
                failIllustration(lifecycle, classifyMediaSendError(error).code)
            }
            await notifyIllustrationFailure(bot, runtime, lifecycle)
            return
        }
    }

    if (!ctx.us.asfile) {
        let result = await sendUgoiraAnimation(bot, config, runtime, illust, media, extra)
        if (result.kind === MediaSendKind.STALE_MEDIA && await refreshIllustration(runtime, lifecycle, 0)) {
            illust = lifecycle.illust
            item = illust.mediagroup[0]
            media = await resolveUgoiraMedia(illust)
            result = await sendUgoiraAnimation(bot, config, runtime, illust, media, extra)
        }
        if (result.kind === MediaSendKind.SENT) {
            sent = true
            markIllustrationOutputSent(lifecycle, 'animation:0')
        } else {
            failureCode = result.code
        }
    }

    if (ctx.us.asfile || ctx.us.append_file_immediate) {
        let documentResult = await sendDocumentWithChain({
            chat_id: chatId,
            media_url: item.media_o,
            extra: {
                ...extra,
                caption: item.caption,
                disable_content_type_detection: true
            },
            lang: ctx.l,
            reply_to_message_id: extra.reply_to_message_id,
            default_extra: defaultExtra,
            silent_error: true
        })
        if (documentResult.kind === MediaSendKind.STALE_MEDIA && await refreshIllustration(runtime, lifecycle, 0)) {
            illust = lifecycle.illust
            item = illust.mediagroup[0]
            documentResult = await sendDocumentWithChain({
                chat_id: chatId,
                media_url: item.media_o,
                extra: { ...extra, caption: item.caption, disable_content_type_detection: true },
                lang: ctx.l,
                reply_to_message_id: extra.reply_to_message_id,
                default_extra: defaultExtra,
                silent_error: true
            })
        }
        if (documentResult.kind === MediaSendKind.SENT) {
            sent = true
            markIllustrationOutputSent(lifecycle, 'document:0')
            if (ctx.us.append_file_immediate) {
                extra.reply_to_message_id = documentResult.result.message_id
            }
        } else {
            failureCode = documentResult.code
        }
    }

    if (ctx.us.append_file && !ctx.us.append_file_immediate) {
        files.push({ lifecycle, page: 0, extra })
        markIllustrationOutputSent(lifecycle, 'queued-document:0')
        queued = true
    }
    if (terminalIllustrationStates.has(lifecycle.state)) {
        await notifyIllustrationFailure(bot, runtime, lifecycle)
    } else if (failureCode) {
        failIllustration(lifecycle, failureCode)
        await notifyIllustrationFailure(bot, runtime, lifecycle)
    } else if (!sent && !queued) {
        failIllustration(lifecycle, 'TELEGRAM_MEDIA_SEND_FAILED')
        await notifyIllustrationFailure(bot, runtime, lifecycle)
    }
}

async function classifyIllustrationOutput(bot, config, runtime) {
    const { ctx, illusts, mediaGroups } = runtime
    const orderedIllusts = ctx.us.desc ? illusts.reverse() : illusts

    await asyncForEach(orderedIllusts, async illust => {
        const lifecycle = runtime.lifecycles.get(illust.id)
        ctx.us.q_id += 1
        const mediaGroup = illust.mediagroup
        const sendDirectly = !ctx.us.telegraph && (
            !ctx.us.album ||
            (illusts.length === 1 && mediaGroup.length === 1) ||
            (!ctx.us.album_one && mediaGroup.length === 1)
        )

        if (!sendDirectly) {
            if (lifecycle.state === IllustrationLifecycleState.READY) beginIllustrationSend(lifecycle)
            if (ctx.us.telegraph || ctx.us.album_one) {
                if (mediaGroups.length === 0) {
                    mediaGroups.push([])
                }
                mediaGroups[0].push(...mediaGroup)
            } else {
                mediaGroups.push(mediaGroup)
            }
            return
        }

        if (illust.type === 2 && ctx.match) {
            ctx.us.share = true
        }
        const extra = createMediaExtra(ctx, runtime.defaultExtra, illust)
        if (illust.type <= 1) {
            await sendStaticIllustration(bot, runtime, lifecycle, extra)
        } else if (illust.type === 2) {
            await sendUgoira(bot, config, runtime, lifecycle, extra)
        }
    })
}

function applySingleCaption(ctx, illusts, mediaGroup, groupIndex) {
    if (!ctx.us.single_caption) {
        return
    }

    let caption = ''
    if (mediaGroup.every(item => item.id === mediaGroup[0].id)) {
        caption = format(
            illusts.find(illust => illust.id === mediaGroup[0].id),
            { ...ctx.us, single_caption: false },
            'message',
            -1,
            false
        )
    } else {
        mediaGroup.forEach((item, index) => {
            caption += format(
                illusts.find(illust => illust.id === item.id),
                ctx.us,
                'mediagroup_message',
                item.p,
                index + 1
            )
            if (mediaGroup.length - 1 !== groupIndex) {
                caption += '\n'
            }
        })
    }
    mediaGroup[0].caption = caption
}

async function sendTelegraph(bot, runtime) {
    const { ctx, chatId, userId, defaultExtra, illusts, mediaGroups } = runtime
    if (!ctx.us.telegraph_title && illusts.length === 1) {
        ctx.us.telegraph_title = illusts[0].title
        if (!ctx.us.telegraph_author_name) {
            ctx.us.telegraph_author_name = illusts[0].author_name
            ctx.us.telegraph_author_url = `https://www.pixiv.net/artworks/${illusts[0].id}`
        }
    }

    try {
        bot.api.sendChatAction(chatId, 'typing', messageThreadOptions(ctx)).catch(() => { })
        const result = await mg2telegraph(
            mediaGroups[0],
            ctx.us.telegraph_title,
            userId,
            ctx.us.telegraph_author_name,
            ctx.us.telegraph_author_url
        )
        if (result) {
            await asyncForEach(result, async item => {
                await bot.api.sendMessage(
                    chatId,
                    `${item.ids.join('\n')}\n${item.telegraph_url}`,
                    defaultExtra
                ).catch(() => { })
            })
            await bot.api.sendMessage(chatId, _l(ctx.l, 'telegraph_iv'), defaultExtra).catch(() => { })
        }
    } catch (error) {
        console.warn(error)
    }
}

async function sendAlbumBatch(bot, runtime, mediaGroups, asDocuments) {
    const { ctx, chatId, defaultExtra, illusts, mediaGroupExtra } = runtime

    await asyncForEach(mediaGroups, async group => {
        await asyncForEach(mg_albumize(group, ctx.us), async (mediaGroup, index) => {
            if (!asDocuments) {
                applySingleCaption(ctx, illusts, mediaGroup, index)
                let result = await sendMediaGroupWithRetry(
                    chatId,
                    ctx.l,
                    mediaGroup,
                    mediaGroupExtra,
                    ['r', 'o', 'dlr', 'dlo']
                )
                if (result.kind === MediaSendKind.STALE_MEDIA) {
                    result = await refreshAndRetryAlbum(runtime, mediaGroup, result, false)
                }
                if (result.kind === MediaSendKind.SENT) {
                    updateReplyChain(mediaGroupExtra, result.result?.[0]?.message_id)
                    markAlbumOutputs(runtime, mediaGroup, `album:${index}`)
                } else {
                    delete mediaGroupExtra.reply_to_message_id
                    honsole.warn('error send mg', result)
                    await failAlbum(bot, runtime, mediaGroup, result)
                }
            } else {
                let result = await sendMediaGroupDocuments({
                    chat_id: chatId,
                    lang: ctx.l,
                    mediagroup: mediaGroup,
                    extra: mediaGroupExtra,
                    url_fallbacks: ['o', 'dlo'],
                    default_extra: defaultExtra,
                    silent_error: true
                })
                if (result.kind === MediaSendKind.STALE_MEDIA) {
                    result = await refreshAndRetryAlbum(runtime, mediaGroup, result, true)
                }
                if (result.kind === MediaSendKind.SENT) {
                    updateReplyChain(mediaGroupExtra, result.result?.[0]?.message_id)
                    markAlbumOutputs(runtime, mediaGroup, `document-album:${index}`)
                } else {
                    updateReplyChain(mediaGroupExtra, null)
                    await failAlbum(bot, runtime, mediaGroup, result)
                }
            }
            await rateLimit(index)

            if (!asDocuments && ctx.us.append_file_immediate) {
                let result = await sendMediaGroupDocuments({
                    chat_id: chatId,
                    lang: ctx.l,
                    mediagroup: mediaGroup,
                    extra: mediaGroupExtra,
                    url_fallbacks: ['o', 'dlo'],
                    default_extra: defaultExtra,
                    silent_error: true
                })
                if (result.kind === MediaSendKind.STALE_MEDIA) {
                    result = await refreshAndRetryAlbum(runtime, mediaGroup, result, true)
                }
                if (result.kind === MediaSendKind.SENT) {
                    updateReplyChain(mediaGroupExtra, result.result?.[0]?.message_id)
                    markAlbumOutputs(runtime, mediaGroup, `immediate-document-album:${index}`)
                } else {
                    updateReplyChain(mediaGroupExtra, null)
                    await failAlbum(bot, runtime, mediaGroup, result)
                }
                await rateLimit(index)
            }
        })
    })
}

async function refreshAndRetryAlbum(runtime, mediaGroup, staleResult, asDocuments) {
    const failedItem = staleResult.error?.illustId
        ? mediaGroup.find(item => item.id === staleResult.error.illustId)
        : mediaGroup[staleResult.failedIndex ?? 0]
    const lifecycle = runtime.lifecycles.get(failedItem?.id)
    if (!lifecycle || !await refreshIllustration(runtime, lifecycle, failedItem?.p ?? null)) {
        return staleResult
    }
    replaceRefreshedAlbumItems(mediaGroup, lifecycle.illust)
    return asDocuments
        ? sendMediaGroupDocuments({
            chat_id: runtime.chatId,
            lang: runtime.ctx.l,
            mediagroup: mediaGroup,
            extra: runtime.mediaGroupExtra,
            url_fallbacks: ['o', 'dlo'],
            silent_error: true
        })
        : sendMediaGroupWithRetry(
            runtime.chatId,
            runtime.ctx.l,
            mediaGroup,
            runtime.mediaGroupExtra,
            ['r', 'o', 'dlr', 'dlo']
        )
}

function markAlbumOutputs(runtime, mediaGroup, output) {
    for (const id of new Set(mediaGroup.map(item => item.id))) {
        const lifecycle = runtime.lifecycles.get(id)
        if (lifecycle && !terminalIllustrationStates.has(lifecycle.state)) {
            markIllustrationOutputSent(lifecycle, output)
        }
    }
}

async function failAlbum(bot, runtime, mediaGroup, result) {
    for (const id of new Set(mediaGroup.map(item => item.id))) {
        const lifecycle = runtime.lifecycles.get(id)
        if (!lifecycle) continue
        if (result.userNotified) lifecycle.failureNotified = true
        if (terminalIllustrationStates.has(lifecycle.state)) {
            await notifyIllustrationFailure(bot, runtime, lifecycle)
            continue
        }
        failIllustration(lifecycle, result.code)
        await notifyIllustrationFailure(bot, runtime, lifecycle)
    }
}

async function flushFiles(bot, runtime) {
    let successCount = 0
    let failedCount = 0
    await asyncForEach(runtime.files, async (file, index) => {
        const { lifecycle, page, extra } = file
        if (terminalIllustrationStates.has(lifecycle.state)) return
        let item = lifecycle.illust.mediagroup[page]
        let result = await sendDocumentWithChain({
            chat_id: runtime.chatId,
            media_url: item.media_o,
            extra,
            lang: runtime.ctx.l,
            default_extra: runtime.defaultExtra,
            silent_error: true
        })
        if (result.kind === MediaSendKind.STALE_MEDIA && await refreshIllustration(runtime, lifecycle, page)) {
            item = lifecycle.illust.mediagroup[page]
            result = await sendDocumentWithChain({
                chat_id: runtime.chatId,
                media_url: item.media_o,
                extra,
                lang: runtime.ctx.l,
                default_extra: runtime.defaultExtra,
                silent_error: true
            })
        }
        if (result.kind === MediaSendKind.SENT) {
            successCount++
            markIllustrationOutputSent(lifecycle, `delayed-document:${page}`)
        } else {
            failedCount++
            if (!terminalIllustrationStates.has(lifecycle.state)) failIllustration(lifecycle, result.code)
            if (result.userNotified) lifecycle.failureNotified = true
            await notifyIllustrationFailure(bot, runtime, lifecycle)
            honsole.warn('[batched files] Failed to send file', index, item.media_o?.substring?.(0, 100))
        }
    })
    honsole.dev(`[batched files] Completed: ${successCount} success, ${failedCount} failed`)
}

async function sendIllustrations(bot, config, runtime) {
    const { ctx, illusts, mediaGroups, files } = runtime
    if (illusts.length === 0) {
        return
    }

    await classifyIllustrationOutput(bot, config, runtime)
    if (mediaGroups.length > 0) {
        if (ctx.us.telegraph) {
            await sendTelegraph(bot, runtime)
        } else {
            await sendAlbumBatch(bot, runtime, mediaGroups, false)
            if (ctx.us.append_file && !ctx.us.append_file_immediate) {
                await sendAlbumBatch(bot, runtime, mediaGroups, true)
            }
        }
    }
    if (files.length > 0) {
        await flushFiles(bot, runtime)
    }

    for (const lifecycle of runtime.lifecycles.values()) {
        if (!terminalIllustrationStates.has(lifecycle.state)) completeIllustration(lifecycle)
    }

    illusts.length = 0
    mediaGroups.length = 0
    files.length = 0
}

async function sendNovels(bot, runtime) {
    const { ctx, chatId, defaultExtra, ids } = runtime
    await asyncForEach(ids.novel, async id => {
        bot.api.sendChatAction(chatId, 'typing', messageThreadOptions(ctx)).catch(() => { })
        const novel = await handle_novel(id)
        if (!novel) {
            runtime.deliveryErrors.push('PIXIV_NOVEL_NOT_FOUND')
            await bot.api.sendMessage(chatId, _l(ctx.l, 'illust_404'), defaultExtra).catch(() => { })
            return
        }

        const extra = { ...defaultExtra }
        delete extra.parse_mode
        await bot.api.sendMessage(chatId, novel.telegraph_url, extra).catch(error => {
            runtime.deliveryErrors.push(error.code || 'TELEGRAM_NOVEL_SEND_FAILED')
            if (error.error_code === 400 && error.description === 'Bad Request: TOPIC_CLOSED') {
                console.log('Topic is closed, skipping message')
                return
            }
            console.warn(error)
        })
    })
}

async function notifyFanbox(bot, runtime) {
    const { ctx, chatId, text, defaultExtra } = runtime
    if (text.includes('fanbox.cc/') && chatId > 0) {
        await bot.api.sendMessage(chatId, _l(ctx.l, 'fanbox_not_support'), defaultExtra).catch(() => { })
    }
}

export function createTgSender({ bot, config, resolveUserSettings }) {
    if (!bot || !config || !resolveUserSettings) {
        throw new Error('createTgSender requires bot, config, and resolveUserSettings')
    }

    return async function tgSender(ctx) {
        const machine = createTgSenderMachine()
        const runtime = await runTgSenderStateMachine(machine, {
            initialize: () => initializeInvocation(resolveUserSettings, ctx),
            collectIllustrations: runtime => collectIllustrations(bot, config, runtime),
            sendIllustrations: runtime => sendIllustrations(bot, config, runtime),
            sendNovels: runtime => sendNovels(bot, runtime),
            notifyFanbox: runtime => notifyFanbox(bot, runtime)
        })
        return summarizeTgSenderResult(runtime)
    }
}
