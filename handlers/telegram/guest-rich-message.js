import { escapeRichMarkdown, format_v3 } from '#handlers/telegram/format'

export const GUEST_RICH_MEDIA_LIMIT = 50

function hasCompleteCache(illust, shownPages) {
    const fileIds = illust?.imgs_?.tg_file_ids
    return Array.isArray(fileIds) && shownPages > 1 &&
        fileIds.slice(0, shownPages).every(fileId => typeof fileId === 'string' && fileId)
}

export function buildGuestRichResult(illust, settings, languageCode, dependencies) {
    const totalPages = illust?.imgs_?.size?.length || 0
    const shownPages = Math.min(totalPages, GUEST_RICH_MEDIA_LIMIT)
    if (!hasCompleteCache(illust, shownPages)) return null

    const spoiler = Boolean(settings.spoiler || (
        settings.auto_spoiler && (
            Number(illust?.x_restrict ?? illust?.xRestrict) > 0 ||
            illust?.tags?.includes('R-18')
        )
    ))
    const media = illust.imgs_.tg_file_ids.slice(0, shownPages).map((fileId, page) => ({
        id: `page_${page}`,
        media: {
            type: 'photo',
            media: fileId,
            ...(spoiler ? { has_spoiler: true } : {})
        }
    }))
    const slides = media.map(item => `![](tg://photo?id=${item.id})`).join('\n')
    const noticeKey = totalPages > shownPages
        ? 'guest_rich_truncated_notice'
        : 'guest_rich_multipage_notice'
    const notice = dependencies.localizeRaw(languageCode, noticeKey, totalPages)
    const caption = format_v3(illust, settings, 'inline', -1, undefined, 'rich_markdown')
    const markdown = [
        '<tg-slideshow>',
        '',
        slides,
        '',
        '</tg-slideshow>',
        '',
        caption,
        escapeRichMarkdown(notice)
    ].filter(value => value !== '').join('\n\n')

    return {
        type: 'article',
        id: `rich_${illust.id}`.slice(0, 64),
        title: illust.title || `Pixiv ${illust.id}`,
        input_message_content: {
            rich_message: {
                markdown,
                media
            }
        },
        ...dependencies.keyboard(illust.id, settings)
    }
}
