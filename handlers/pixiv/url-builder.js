/**
 * URL Builder Layer - Derive regular/original URLs from thumb URL
 * Pure functions, no IO operations
 */
import { head_url } from './tools.js'
import { fetchIllustPages } from './api.js'
import { honsole } from '../common.js'

/**
 * Build thumb/regular/original URLs from base URL
 * @param {string} baseUrl Base URL (usually thumb)
 * @returns {object} URL collection
 */
export function deriveURLsFromBase(baseUrl) {
    // Normalize: replace various thumb prefixes with placeholders
    const normalized = baseUrl
        .replace('/c/250x250_80_a2/custom-thumb', '∏a∏')
        .replace('/c/240x240/img-master', '∏a∏')
        .replace('/c/128x128/img-master', '∏a∏')
        .replace('/c/128x128/custom-thumb', '∏a∏')
        .replace('/c/250x250_80_a2/img-master', '∏a∏')
        // Handle all /c/N0xN0/img-master/ and /c/N0xN0/custom-thumb/ formats
        .replace(/\/c\/\d+0x\d+0\/img-master/g, '∏a∏')
        .replace(/\/c\/\d+0x\d+0\/custom-thumb/g, '∏a∏')
        .replace('_square1200', '∏b∏')
        .replace('_custom1200', '∏b∏')
        .replace('_master1200', '∏b∏')
        .replace('i-cf.pximg.net', 'i.pximg.net')

    return {
        thumb: normalized.replace('∏a∏', '/c/250x250_80_a2/img-master').replace('∏b∏', '_square1200'),
        regular: normalized.replace('∏a∏', '/img-master').replace('∏b∏', '_master1200'),
        original: normalized.replace('∏a∏', '/img-original').replace('∏b∏', '')
    }
}

/**
 * Build all URLs for illustration (fast mode, no file validation)
 * @param {object} illust Normalized illustration data
 * @returns {Promise<object>} imgs_ object
 */
export async function buildIllustURLsFast(illust) {
    // Special handling for ugoira
    if (illust.type === 2) {
        return {
            size: [{
                width: illust.width || illust.imgs_?.size?.[0]?.width,
                height: illust.height || illust.imgs_?.size?.[0]?.height
            }],
            cover_img_url: illust.urls.original
        }
    }

    // Check if multi-page work
    const isMultiPage = (illust.page_count && illust.page_count > 1) ||
                        (illust.pageCount && illust.pageCount > 1) ||
                        (illust.imgs_?.size?.length > 1)

    let pages
    if (isMultiPage) {
        pages = await fetchIllustPages(illust.id)
    } else {
        // Single page: prefer API urls over derived URLs
        if (illust.urls && illust.urls.original) {
            // Use API-provided URLs directly (most reliable for fresh data)
            pages = [{
                urls: {
                    original: illust.urls.original,
                    regular: illust.urls.regular || illust.urls.medium,
                    thumb: illust.urls.thumb || illust.urls.small
                },
                width: illust.width || illust.imgs_?.size?.[0]?.width,
                height: illust.height || illust.imgs_?.size?.[0]?.height
            }]
        } else {
            // Fallback: fetch from API for old cached data without urls field
            // This ensures we get accurate URLs instead of unreliable string derivation
            honsole.dev('[buildIllustURLsFast] No urls field, fetching from pages API', illust.id)
            pages = await fetchIllustPages(illust.id)
        }
    }

    // Build result
    const imgs_ = {
        thumb_urls: [],
        regular_urls: [],
        original_urls: [],
        size: []
    }

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        imgs_.thumb_urls[i] = page.urls?.thumb || page.urls?.small
        imgs_.regular_urls[i] = page.urls?.regular || page.urls?.medium
        imgs_.original_urls[i] = page.urls?.original
        imgs_.size[i] = {
            width: page.width,
            height: page.height
        }
    }

    return imgs_
}

/**
 * Build all URLs for illustration (full mode, with file format probing)
 * Mainly used for detecting file format (jpg/png/gif uncertain)
 * @param {object} illust Normalized illustration data
 * @returns {Promise<object>} imgs_ object (with file validation)
 */
export async function buildIllustURLsWithProbe(illust) {
    // Ugoira doesn't need probing
    if (illust.type === 2) {
        return buildIllustURLsFast(illust)
    }

    const baseUrl = illust.url || illust.imgs_?.thumb_urls?.[0] || illust.urls?.thumb
    if (!baseUrl) {
        honsole.error('[buildIllustURLsWithProbe] No base URL found for illust', illust.id)
        return null
    }

    const urls = deriveURLsFromBase(baseUrl)

    // Probe first file's format
    const fileExists = await head_url(urls.original)
    let needsPageFetch = false

    if (!fileExists) {
        // File doesn't exist might mean wrong format (png/gif), need to get page details
        needsPageFetch = true
    }

    const isMultiPage = (illust.page_count && illust.page_count > 1) ||
                        (illust.pageCount && illust.pageCount > 1) ||
                        (illust.imgs_?.size?.length > 1)

    let pages
    if (needsPageFetch || isMultiPage) {
        pages = await fetchIllustPages(illust.id)
    } else {
        pages = [{
            urls: {
                original: urls.original,
                regular: urls.regular,
                thumb: urls.thumb
            },
            width: illust.width || illust.imgs_?.size?.[0]?.width,
            height: illust.height || illust.imgs_?.size?.[0]?.height
        }]
    }

    // Build result (no fsize, as it's deprecated)
    const imgs_ = {
        thumb_urls: [],
        regular_urls: [],
        original_urls: [],
        size: []
    }

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        imgs_.thumb_urls[i] = page.urls?.thumb || page.urls?.small
        imgs_.regular_urls[i] = page.urls?.regular || page.urls?.medium
        imgs_.original_urls[i] = page.urls?.original
        imgs_.size[i] = {
            width: page.width,
            height: page.height
        }
    }

    return imgs_
}
