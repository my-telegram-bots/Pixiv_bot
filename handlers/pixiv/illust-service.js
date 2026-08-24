import { getIllust, updateIllust } from '#db'
import { honsole } from '#handlers/common'
import { fetchIllustFromPixiv } from '#handlers/pixiv/api'
import { normalizeIllustData, extractDbFields } from '#handlers/pixiv/normalizer'
import { buildIllustURLsFast } from '#handlers/pixiv/url-builder'
import {
    IllustrationResolveKind,
    IllustrationResolveMode,
    IllustrationResolver
} from '#handlers/pixiv/illustration-resolver'

export { IllustrationResolveKind, IllustrationResolveMode }

const illustService = new IllustrationResolver({
    getStored: getIllust,
    updateStored: updateIllust,
    fetchDetail: fetchIllustFromPixiv,
    normalize: normalizeIllustData,
    buildURLs: buildIllustURLsFast,
    extractFields: extractDbFields,
    logger: honsole
})

export function resolveIllustration(id, options) {
    return illustService.resolve(id, options)
}

export default illustService
