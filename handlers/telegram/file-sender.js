/**
 * File Sender Module
 *
 * Unified file sending logic with comprehensive error handling:
 * - Single document file sending
 * - MediaGroup document sending
 * - Reply chain management
 * - Rate limiting
 * - User error notification fallback
 */

import { sendDocumentWithRetry, sendMediaGroupWithRetry } from './sender.js'
import { _l } from './i18n.js'
import { honsole, sleep } from '../common.js'
import { getBot } from '../../bot.js'

/**
 * Send a single document file and maintain reply chain
 * Provides unified error handling with user notification fallback
 *
 * @param {Object} options - Send options
 * @param {number} options.chat_id - Target chat ID
 * @param {string} options.media_url - Media file URL
 * @param {Object} options.extra - Extra send options (reply_markup will be removed)
 * @param {string} options.lang - Language code
 * @param {number} [options.reply_to_message_id] - Reply to message ID
 * @param {Object} [options.default_extra] - Default extra for error notification
 * @param {boolean} [options.silent_error=false] - Silent error (no user notification)
 * @returns {Promise<number|null>} Returns new message_id, null on failure
 */
export async function sendDocumentWithChain(options) {
    const {
        chat_id,
        media_url,
        extra,
        lang,
        reply_to_message_id,
        default_extra,
        silent_error = false
    } = options

    try {
        // Remove reply_markup to avoid showing buttons on file messages
        const cleanExtra = { ...extra }
        delete cleanExtra.reply_markup

        // Add reply_to_message_id if provided
        if (reply_to_message_id) {
            cleanExtra.reply_to_message_id = reply_to_message_id
        }

        // Send document
        const result = await sendDocumentWithRetry(
            chat_id,
            media_url,
            cleanExtra,
            lang
        )

        // Return new message_id
        if (result) {
            return result.message_id || result || null
        }

        throw new Error('sendDocumentWithRetry returned null/undefined')
    } catch (error) {
        honsole.error('[sendDocumentWithChain] Failed:', {
            chat_id,
            media_url: media_url?.substring?.(0, 100) || media_url,
            error: error.message
        })

        // Send error notification to user (if not silent mode)
        if (!silent_error && default_extra) {
            const bot = getBot()
            await bot.api.sendMessage(
                chat_id,
                _l(lang, 'error'),
                default_extra
            ).catch(() => { })
        }

        return null
    }
}

/**
 * Send MediaGroup as documents (document type)
 * Provides unified error handling with user notification fallback
 *
 * @param {Object} options - Send options
 * @param {number} options.chat_id - Target chat ID
 * @param {string} options.lang - Language code
 * @param {Array} options.mediagroup - MediaGroup array
 * @param {Object} options.extra - Extra send options
 * @param {Array<string>} [options.url_fallbacks=['o', 'dlo']] - URL fallback strategy
 * @param {Object} [options.default_extra] - Default extra for error notification
 * @param {boolean} [options.silent_error=false] - Silent error (no user notification)
 * @returns {Promise<number|null>} Returns first message_id, null on failure
 */
export async function sendMediaGroupDocuments(options) {
    const {
        chat_id,
        lang,
        mediagroup,
        extra,
        url_fallbacks = ['o', 'dlo'],
        default_extra,
        silent_error = false
    } = options

    try {
        // Convert to document type
        const docMediaGroup = mediagroup.map(mg => {
            const doc = { ...mg, type: 'document' }
            // Remove media_t (thumbnail), not needed for documents
            delete doc.media_t
            return doc
        })

        // Send MediaGroup
        const result = await sendMediaGroupWithRetry(
            chat_id,
            lang,
            docMediaGroup,
            extra,
            url_fallbacks
        )

        // Return first message_id
        if (result && result[0] && result[0].message_id) {
            return result[0].message_id
        }

        throw new Error('sendMediaGroupWithRetry returned null or invalid result')
    } catch (error) {
        honsole.error('[sendMediaGroupDocuments] Failed:', {
            chat_id,
            count: mediagroup?.length || 0,
            error: error.message
        })

        // Send error notification to user (if not silent mode)
        if (!silent_error && default_extra) {
            const bot = getBot()
            await bot.api.sendMessage(
                chat_id,
                _l(lang, 'error'),
                default_extra
            ).catch(() => { })
        }

        return null
    }
}

/**
 * Update reply chain message_id in extra object
 *
 * @param {Object} extraObj - Extra object (will be modified directly)
 * @param {number|null} newMessageId - New message_id
 */
export function updateReplyChain(extraObj, newMessageId) {
    if (newMessageId) {
        extraObj.reply_to_message_id = newMessageId
    } else {
        delete extraObj.reply_to_message_id
    }
}

/**
 * Rate limiting helper for batch sending
 *
 * @param {number} index - Current index in batch
 * @returns {Promise<void>}
 */
export function rateLimit(index) {
    return sleep(index > 4 ? 1500 : 500)
}
