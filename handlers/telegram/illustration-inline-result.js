function isHttpUrl(value) {
    if (typeof value !== 'string') return false
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
        return false
    }
}

function shouldSpoiler(illust, settings) {
    const isSensitive = Number(illust?.x_restrict ?? illust?.xRestrict) > 0 ||
        illust?.tags?.includes('R-18')
    return Boolean(settings.spoiler || (settings.auto_spoiler && isSensitive))
}

export function buildPhotoInlineResults(illust, settings, dependencies) {
    const sizes = illust?.imgs_?.size || []
    const urls = illust?.imgs_?.regular_urls || []
    const results = []
    for (let page = 0; page < sizes.length; page++) {
        const url = urls[page]
        const thumbnailUrl = illust.imgs_.thumb_urls?.[page] || url
        if (!isHttpUrl(url) || !isHttpUrl(thumbnailUrl)) continue
        try {
            const result = {
                type: 'photo',
                id: `p_${illust.id}-${page}`,
                photo_url: url,
                thumbnail_url: thumbnailUrl,
                caption: dependencies.format(illust, settings, 'inline', page),
                photo_width: sizes[page]?.width,
                photo_height: sizes[page]?.height,
                parse_mode: 'MarkdownV2',
                show_caption_above_media: settings.caption_above,
                ...dependencies.keyboard(illust.id, settings)
            }
            if (shouldSpoiler(illust, settings)) result.has_spoiler = true
            results.push(result)
        } catch {
            dependencies.logBuildFailure?.({
                illustId: illust.id,
                page,
                code: 'INLINE_PHOTO_RESULT_INVALID'
            })
        }
    }
    return results
}

export async function buildIllustrationInlineResults(id, settings, dependencies) {
    const resolved = await dependencies.illustService.resolve(id, {
        mode: 'cache-first',
        lightweight: true
    })
    if (resolved.kind !== 'ready') {
        return {
            results: [],
            errorCode: resolved.code || 'PIXIV_ILLUSTRATION_LOOKUP_FAILED'
        }
    }

    const illust = resolved.illustration
    if (illust.type <= 1) {
        const results = buildPhotoInlineResults(illust, settings, dependencies)
        return {
            results,
            illustration: illust,
            pageCount: illust?.imgs_?.size?.length || results.length,
            errorCode: results.length > 0 ? undefined : 'INLINE_PHOTO_RESULT_INVALID'
        }
    }
    if (illust.type !== 2) {
        return { results: [], errorCode: 'INLINE_MEDIA_TYPE_UNSUPPORTED' }
    }

    let common
    try {
        common = {
            type: 'mpeg4_gif',
            id: `p${illust.id}`,
            caption: dependencies.format(illust, settings, 'inline', 1),
            parse_mode: 'MarkdownV2',
            show_caption_above_media: settings.caption_above,
            ...dependencies.keyboard(illust.id, settings)
        }
    } catch {
        dependencies.logBuildFailure?.({
            illustId: illust.id,
            code: 'INLINE_UGOIRA_RESULT_INVALID'
        })
        return { results: [], errorCode: 'INLINE_UGOIRA_RESULT_INVALID' }
    }
    if (shouldSpoiler(illust, settings)) common.has_spoiler = true
    if (typeof illust.tg_file_id === 'string' && illust.tg_file_id) {
        return {
            results: [{ ...common, mpeg4_file_id: illust.tg_file_id }],
            illustration: illust,
            pageCount: 1
        }
    }

    const url = await dependencies.detectUgoiraUrl(illust, 'mp4', {
        existingOnly: dependencies.existingOnlyUgoira === true
    })
    if (isHttpUrl(url) && isHttpUrl(illust.imgs_?.cover_img_url)) {
        return {
            results: [{
                ...common,
                mpeg4_url: url,
                thumbnail_url: illust.imgs_.cover_img_url
            }],
            illustration: illust,
            pageCount: 1
        }
    }
    return {
        results: [],
        redirectId: illust.id,
        errorCode: 'INLINE_UGOIRA_MEDIA_UNAVAILABLE'
    }
}
