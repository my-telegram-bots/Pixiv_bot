import { honsole } from '../common.js'
import {
    IllustrationResolveKind,
    IllustrationResolveMode,
    resolveIllustration
} from '../pixiv/illust-service.js'
import { mg_create } from './mediagroup.js'
/**
 * 处理成 tg 友好型数据
 * 作为 ../pixiv/illust 的 tg 封装
 * @param {*} id
 * @param {*} flag
 * @param {boolean} lightweight Lightweight mode for inline query (skip head_url check)
 */
export async function handle_illust(id, flag, lightweight = false, mode = IllustrationResolveMode.CACHE_FIRST) {
    const result = typeof id === 'object'
        ? { kind: IllustrationResolveKind.READY, illustration: id, source: 'provided' }
        : await resolveIllustration(id, { mode, lightweight })
    if (result.kind !== IllustrationResolveKind.READY) {
        return result
    }

    let illust = result.illustration
    honsole.dev('i', illust.id)
    illust = {
        ...illust,
        //                                               || illust.tags.includes('R18-G')
        nsfw: illust.xRestrict > 0 || (illust.tags && illust.tags.includes('R-18')),
        ai: !illust.ai_type === undefined || illust.ai_type === 2
    }
    if (illust.nsfw && flag.auto_spoiler) {
        flag.spoiler = true
    }

    // Note: .inline field removed - it was redundant dead code
    // Inline queries use the same resolver in lightweight cache-first mode.
    // This function is only called for regular messages, which only need .mediagroup
    illust.mediagroup = await mg_create(illust, flag)
    if (!illust.mediagroup.length) {
        return {
            kind: IllustrationResolveKind.FAILED,
            code: 'TELEGRAM_MEDIA_BUILD_FAILED'
        }
    }
    return { ...result, illustration: illust }
}
