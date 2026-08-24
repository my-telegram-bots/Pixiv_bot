export const IllustrationResolveKind = Object.freeze({
    READY: 'ready',
    NOT_FOUND: 'not_found',
    FAILED: 'failed'
})

export const IllustrationResolveMode = Object.freeze({
    CACHE_FIRST: 'cache-first',
    REFRESH: 'refresh'
})

class TTLCache {
    constructor(maxSize = 500, ttl = 600000) {
        this.cache = new Map()
        this.maxSize = maxSize
        this.ttl = ttl
    }

    set(key) {
        if (this.cache.size >= this.maxSize) this.cache.delete(this.cache.keys().next().value)
        this.cache.set(key, Date.now())
    }

    has(key) {
        const storedAt = this.cache.get(key)
        if (!storedAt) return false
        if (Date.now() - storedAt > this.ttl) {
            this.cache.delete(key)
            return false
        }
        return true
    }

    delete(key) {
        this.cache.delete(key)
    }
}

function failed(code, error) {
    return { kind: IllustrationResolveKind.FAILED, code, error }
}

function hasCompleteMedia(illust) {
    if (!illust?.imgs_) return false
    if (illust.type === 2) return Boolean(illust.imgs_.cover_img_url)
    return Boolean(
        illust.imgs_.size?.length &&
        illust.imgs_.regular_urls?.length &&
        illust.imgs_.original_urls?.length
    )
}

export class IllustrationResolver {
    constructor(dependencies) {
        this.notFoundCache = new TTLCache()
        this.inFlight = new Map()
        this.getStored = dependencies.getStored
        this.updateStored = dependencies.updateStored
        this.fetchDetail = dependencies.fetchDetail
        this.normalize = dependencies.normalize
        this.buildURLs = dependencies.buildURLs
        this.extractFields = dependencies.extractFields
        this.logger = dependencies.logger || console
    }

    resolve(id, options = {}) {
        const mode = options.mode || IllustrationResolveMode.CACHE_FIRST
        const numericId = Number.parseInt(id?.toString(), 10)
        if (!Number.isSafeInteger(numericId) || numericId < 0) {
            return Promise.resolve(failed('INVALID_ILLUSTRATION_ID'))
        }
        if (!Object.values(IllustrationResolveMode).includes(mode)) {
            return Promise.resolve(failed('INVALID_RESOLVE_MODE'))
        }
        const key = `${mode}:${numericId}`
        if (this.inFlight.has(key)) return this.inFlight.get(key)
        const operation = this._resolve(numericId, mode).finally(() => this.inFlight.delete(key))
        this.inFlight.set(key, operation)
        return operation
    }

    async _resolve(id, mode) {
        if (mode === IllustrationResolveMode.CACHE_FIRST) {
            let stored
            try {
                stored = await this.getStored(id)
            } catch (error) {
                this.logger.warn('[IllustrationResolver] Database read failed:', id, error.message)
                return failed('DATABASE_ILLUSTRATION_READ_FAILED', error)
            }
            if (stored?.deleted || this.notFoundCache.has(id)) {
                return { kind: IllustrationResolveKind.NOT_FOUND, code: 'PIXIV_ILLUSTRATION_NOT_FOUND' }
            }
            if (hasCompleteMedia(stored)) {
                delete stored._id
                return { kind: IllustrationResolveKind.READY, illustration: stored, source: 'database' }
            }
        }

        let raw
        try {
            raw = await this.fetchDetail(id)
        } catch (error) {
            if (error?.response?.status === 404) {
                this.notFoundCache.set(id)
                await this._markAsDeleted(id)
                return { kind: IllustrationResolveKind.NOT_FOUND, code: 'PIXIV_ILLUSTRATION_NOT_FOUND' }
            }
            this.logger.warn('[IllustrationResolver] Detail request failed:', id, error.message)
            return failed('PIXIV_DETAIL_REQUEST_FAILED', error)
        }

        try {
            const illustration = this.normalize(raw)
            if (!illustration) return failed('PIXIV_RESPONSE_INVALID')
            illustration.imgs_ = await this.buildURLs(illustration)
            if (!hasCompleteMedia(illustration)) return failed('PIXIV_MEDIA_URLS_INVALID')
            await this.updateStored(illustration.id, this.extractFields(illustration, {
                deleted: false,
                deleted_at: null
            }), null, { upsert: true })
            this.notFoundCache.delete(id)
            return { kind: IllustrationResolveKind.READY, illustration, source: 'pixiv' }
        } catch (error) {
            this.logger.warn('[IllustrationResolver] Media refresh failed:', id, error.message)
            return failed('PIXIV_MEDIA_REFRESH_FAILED', error)
        }
    }

    async _markAsDeleted(id) {
        try {
            await this.updateStored(id, { deleted: true, deleted_at: new Date() }, null, { upsert: false })
        } catch (error) {
            if (!error.message?.includes('Record not exist')) {
                this.logger.warn('[IllustrationResolver] Failed to mark deleted:', id, error.message)
            }
        }
    }
}
