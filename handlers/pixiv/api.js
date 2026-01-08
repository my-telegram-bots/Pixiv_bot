/**
 * Pixiv API Layer - Pure IO, no data processing
 */
import { r_p_ajax } from './request.js'

/**
 * Fetch illustration basic info from Pixiv API
 * @param {number} id Illustration ID
 * @returns {Promise<object>} Raw response data from Pixiv API
 */
export async function fetchIllustFromPixiv(id) {
    const response = await r_p_ajax.get('illust/' + id)
    return response.data.body
}

/**
 * Fetch illustration pages details from Pixiv API (for multi-page works)
 * @param {number} id Illustration ID
 * @returns {Promise<Array>} Array of page data
 */
export async function fetchIllustPages(id) {
    const response = await r_p_ajax.get('illust/' + id + '/pages')
    return response.data.body
}

/**
 * Fetch ugoira metadata from Pixiv API
 * @param {number} id Illustration ID
 * @returns {Promise<object>} Ugoira metadata
 */
export async function fetchUgoiraMeta(id) {
    const response = await r_p_ajax.get('illust/' + id + '/ugoira_meta')
    return response.data.body
}
