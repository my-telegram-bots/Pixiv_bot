/**
 * Data Normalization Layer - Pure functions for field name conversion and data cleaning
 */

/**
 * Normalize illustration data returned from Pixiv API
 * @param {object} rawIllust Raw data from Pixiv API
 * @returns {object} Normalized data
 */
export function normalizeIllustData(rawIllust) {
    if (typeof rawIllust !== 'object') {
        return null
    }

    const illust = { ...rawIllust }

    // Field name normalization: string → number
    const numberFields = ['id', 'illustId', 'userId', 'sl', 'illustType', 'illust_page_count', 'illust_id', 'illust_type', 'user_id']
    for (const key of numberFields) {
        if (illust[key] && typeof illust[key] === 'string') {
            illust[key] = parseInt(illust[key])
        }
    }

    // Field name normalization: camelCase → snake_case
    const camelToSnake = ['Id', 'Title', 'Type', 'Date', 'Restrict', 'Comment', 'Promotion', 'Data', 'Count', 'Original', 'Illust', 'Url', 'Name', 'userAccount', 'ImageUrl']
    for (const key in illust) {
        if (!Object.prototype.hasOwnProperty.call(illust, key)) continue

        for (const pattern of camelToSnake) {
            if (key.includes(pattern)) {
                const newKey = key.replace(pattern, `_${pattern.toLowerCase()}`)
                illust[newKey] = illust[key]
                delete illust[key]
                break
            }
        }
    }

    // Simplify illust_ prefix
    for (const key in illust) {
        if (key.startsWith('illust_')) {
            const shortKey = key.replace('illust_', '')
            if (!illust[shortKey]) {
                illust[shortKey] = illust[key]
            }
        }
    }

    // user_ → author_ conversion
    for (const key in illust) {
        if (key.startsWith('user_')) {
            const authorKey = key.replace('user_', 'author_')
            if (!illust[authorKey]) {
                illust[authorKey] = illust[key]
            }
        }
    }

    // Tag processing
    if (illust.tags && illust.tags.tags) {
        illust.tags = illust.tags.tags.map(tag => tag.tag)
    }

    return illust
}

/**
 * Extract fields that need to be saved to database
 * @param {object} illust Normalized illustration data
 * @param {object} extraData Additional data
 * @returns {object} Database storage object
 */
export function extractDbFields(illust, extraData = {}) {
    const fields = ['id', 'title', 'type', 'comment', 'description', 'author_id', 'author_name', 'imgs_', 'tags', 'sl', 'restrict', 'x_restrict', 'ai_type', 'tg_file_id']

    const dbObject = {}
    for (const field of fields) {
        if (illust[field] !== undefined) {
            dbObject[field] = illust[field]
        }
    }

    return { ...dbObject, ...extraData }
}
