function pageCount(imgs) {
    return Array.isArray(imgs?.thumb_urls) ? imgs.thumb_urls.length : 0
}

export async function syncIllustImages(client, illustId, imgs) {
    const count = pageCount(imgs)
    for (let pageIndex = 0; pageIndex < count; pageIndex++) {
        const regularUrl = imgs.regular_urls?.[pageIndex] || null
        await client.query(`
            UPDATE illust_image
            SET tg_file_id = NULL, updated_at = NOW()
            WHERE illust_id = $1 AND page_index = $2 AND (
                regular_url <> $3
                OR (regular_url IS NULL AND $3 IS NOT NULL)
                OR (regular_url IS NOT NULL AND $3 IS NULL)
            )
        `, [illustId, pageIndex, regularUrl])
        await client.query(`
            INSERT INTO illust_image (
                illust_id, page_index, thumb_url, regular_url, original_url,
                width, height
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (illust_id, page_index) DO UPDATE SET
                thumb_url = EXCLUDED.thumb_url,
                regular_url = EXCLUDED.regular_url,
                original_url = EXCLUDED.original_url,
                width = EXCLUDED.width,
                height = EXCLUDED.height,
                updated_at = NOW()
        `, [
            illustId,
            pageIndex,
            imgs.thumb_urls[pageIndex] || null,
            regularUrl,
            imgs.original_urls?.[pageIndex] || null,
            imgs.size?.[pageIndex]?.width || null,
            imgs.size?.[pageIndex]?.height || null
        ])
    }
    await client.query(
        'DELETE FROM illust_image WHERE illust_id = $1 AND page_index >= $2',
        [illustId, count]
    )
}

export async function writeIllustImageFileIds(client, illustId, pages) {
    if (!Number.isSafeInteger(illustId) || illustId <= 0) {
        throw new TypeError('illustId must be a positive safe integer')
    }
    if (!Array.isArray(pages) || pages.length === 0) return 0

    const seen = new Set()
    let updated = 0
    for (const page of pages) {
        const pageIndex = page?.pageIndex
        const fileId = page?.fileId
        if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) {
            throw new TypeError('pageIndex must be a non-negative safe integer')
        }
        if (typeof fileId !== 'string' || fileId.length === 0) {
            throw new TypeError('fileId must be a non-empty string')
        }
        if (seen.has(pageIndex)) {
            throw new TypeError(`duplicate pageIndex: ${pageIndex}`)
        }
        seen.add(pageIndex)
        const result = await client.query(`
            UPDATE illust_image
            SET tg_file_id = $1, updated_at = NOW()
            WHERE illust_id = $2 AND page_index = $3
        `, [fileId, illustId, pageIndex])
        updated += result.rowCount
    }
    if (updated !== pages.length) {
        throw new Error(`Missing illust_image page for illust ${illustId}`)
    }
    return updated
}

export function rebuildRegularImages(images) {
    return {
        thumb_urls: images.map(image => image.thumb_url),
        regular_urls: images.map(image => image.regular_url),
        original_urls: images.map(image => image.original_url),
        size: images.map(image => ({ width: image.width, height: image.height })),
        tg_file_ids: images.map(image => image.tg_file_id || null)
    }
}
