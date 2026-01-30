import { getBot } from '../../bot.js'
import { _l } from './i18n.js'
import { honsole, fetch_tmp_file } from '../common.js'
import { mg_filter } from './mediagroup.js'
import { InputFile } from 'grammy'
import config from '../../config.js'
import axios from 'axios'

/**
 * catch error report && reply
 * @param {*} e error
 * @param {*} chat_id chat_id
 * @param {*} language_code language code
 */
export async function catchily(e, chat_id, language_code = 'en') {
    const bot = getBot()
    let default_extra = {
        parse_mode: 'MarkdownV2'
    }
    honsole.warn(e)
    try {
        const error_json = JSON.stringify(e);
        const error_msg = error_json.length > 1000
            ? error_json.substring(0, 500) + '\n...\n' + error_json.substring(error_json.length - 500)
            : error_json;
        bot.api.sendMessage(config.tg.master_id, error_msg.replace(config.tg.token, '<REALLOCATED>'), {
            disable_web_page_preview: true
        }).catch(() => { })
        if (!e.ok) {
            const description = e.description.toLowerCase()
            if (description.includes('media_caption_too_long')) {
                await bot.api.sendMessage(chat_id, _l(language_code, 'error_text_too_long'), default_extra).catch(() => { })
                return false
            } else if (description.includes('can\'t parse entities: character')) {
                await bot.api.sendMessage(chat_id, _l(language_code, 'error_format', e.description)).catch(() => { })
                return false
                // banned by user
            } else if (description.includes('forbidden:')) {
                return false
                // not have permission
            } else if (description.includes('not enough rights to send')) {
                await bot.api.sendMessage(chat_id, _l(language_code, 'error_not_enough_rights'), default_extra).catch(() => { })
                return false
                // message thread not found - give up sending
            } else if (description.includes('message thread not found')) {
                console.log('Message thread not found, skipping message')
                return false
                // just a moment
            } else if (description.includes('too many requests')) {
                console.log(chat_id, 'sleep', e.description.parameters.retry_after, 's')
                // await sleep(e.description.parameters.retry_after * 1000)
                return 'redo'
            } else if (description.includes('failed to send message') && description.includes('#')) {
                // Handle specific media item failure: "failed to send message #N with the error message 'WEBPAGE_MEDIA_EMPTY'"
                const failed_index_match = description.match(/failed to send message #(\d+)/);
                if (failed_index_match && e.method === 'sendMediaGroup' && e.payload.media) {
                    const failed_index = parseInt(failed_index_match[1]) - 1; // Convert to 0-based index
                    if (failed_index >= 0 && failed_index < e.payload.media.length) {
                        const failed_media = e.payload.media[failed_index];
                        if (failed_media.media && typeof failed_media.media === 'string' && failed_media.media.includes('https://')) {
                            const failed_url = failed_media.media;
                            honsole.log(`[refetch] Media item #${failed_index + 1} failed, refetching URL`);
                            if (config.tg.refetch_api) {
                                (async () => {
                                    try {
                                        await axios.post(config.tg.refetch_api, {
                                            url: failed_url
                                        })
                                        honsole.log('[ok] refetch url', failed_url)
                                    } catch (error) {
                                        honsole.warn('[err] refetch url', error)
                                    }
                                })()
                            }
                        }
                    }
                }
                // Don't return here, let it continue to check other error types
            } else if (description.includes('failed to get http url content') || description.includes('wrong file identifier/http url specified') || description.includes('wrong type of the web page content') || description.includes('group send failed') || description.includes('can\'t parse inputmedia') || description.includes('media not found')) {
                let photo_urls = []
                if (e.method === 'sendPhoto') {
                    photo_urls[0] = e.payload.photo
                } else if (e.method === 'sendMediaGroup' && e.payload.media) {
                    photo_urls = e.payload.media.filter(m => {
                        return m.media && typeof m.media === 'string' && m.media.includes('https://')
                    }).map(m => {
                        return m.media
                    })
                } else if (e.method === 'sendDocument') {
                    photo_urls[0] = e.payload.document
                }
                honsole.dev(photo_urls)
                if (config.tg.refetch_api && photo_urls) {
                    (async () => {
                        try {
                            await axios.post(config.tg.refetch_api, {
                                url: photo_urls.join('\n')
                            })
                            honsole.log('[ok] fetch new url(s)', photo_urls)
                        } catch (error) {
                            honsole.warn('[err] fetch new url(s)', error)
                        }
                    })()
                }
            }
        }
    } catch (error) {
        console.warn(error)
        return false
    }
    return true
}

/**
 * Mark failed media item and schedule retry with download fallback
 * @param {Array} mg Media group array
 * @param {number} failed_index Failed item index (0-based)
 * @param {string} current_type Current media type that failed
 * @param {Array} mg_type_queue Media type queue to update
 * @returns {boolean} Success status
 */
export function markFailedMediaItem(mg, failed_index, current_type, mg_type_queue) {
    if (failed_index < 0 || failed_index >= mg.length) {
        honsole.warn(`Invalid media index ${failed_index + 1}, media group has ${mg.length} items`)
        return false
    }

    honsole.log(`Media item #${failed_index + 1} failed with ${current_type}, marking for retry`)

    // Mark this specific item as invalid for current media type
    if (!mg[failed_index].invaild) {
        mg[failed_index].invaild = [current_type]
    } else if (!mg[failed_index].invaild.includes(current_type)) {
        mg[failed_index].invaild.push(current_type)
    }

    // For failed web URLs, try downloading locally first
    const download_type = current_type.startsWith('dl') ? current_type : `dl${current_type}`;
    if (!mg_type_queue.includes(download_type)) {
        mg_type_queue.unshift(download_type);
    }

    return true
}

/**
 * Send media group with smart retry logic
 * - Parses Telegram error messages to identify specific failed media items
 * - Marks failed items as invalid and retries with local downloads
 * - Only retries failed items instead of entire media group
 * - Prevents infinite retries with configurable limit
 * @param {*} chat_id Telegram chat ID
 * @param {*} language_code User's language code for error messages
 * @param {*} mg Media group array
 * @param {*} extra Extra options for Telegram API
 * @param {*} mg_type Array of media types to try (e.g., ['r', 'o', 'dlr', 'dlo'])
 * @param {*} retryCount Current retry attempt count (internal use)
 * @returns Promise<MediaGroup|false> Returns sent media group or false on failure
 */
export async function sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type = [], retryCount = 0) {
    const bot = getBot()
    // Prevent infinite retries (reduced from 10 to 5)
    if (retryCount > 5) {
        honsole.warn('Max retry attempts (5) reached for media group', chat_id, mg.length, 'items')
        return false
    }

    if (mg_type.length === 0) {
        honsole.warn('No more media types to try', chat_id, mg.length, 'items')
        return false
    }
    let current_mg_type = mg_type.shift();

    honsole.dev(`[Retry ${retryCount + 1}/5] Media type: ${current_mg_type}, remaining: [${mg_type.join(', ')}]`);

    // Validate media URLs before attempting to send
    const hasInvalidMedia = mg.some(m => !m.media && !m.media_o && !m.media_r && !m.media_t)
    if (hasInvalidMedia) {
        honsole.warn('Media group contains invalid URLs, skipping send')
        return false
    }

    // Send appropriate chat action based on media type
    const chatAction = mg[0].type === 'document' ? 'upload_document' :
                      (mg[0].type === 'video' ? 'upload_video' : 'upload_photo')
    bot.api.sendChatAction(chat_id, chatAction, extra.message_thread_id ? {
        message_thread_id: extra.message_thread_id
    } : {}).catch(() => { })

    try {
        const result = await bot.api.sendMediaGroup(chat_id, await mg_filter([...mg], current_mg_type), extra)
        if (retryCount > 0) {
            honsole.log(`Media group succeeded after ${retryCount + 1} attempts with type: ${current_mg_type}`)
        }
        return result
    } catch (e) {
        let status = await catchily(e, chat_id, language_code)

        // Handle specific media item failure (WEBPAGE_MEDIA_EMPTY, WEBPAGE_CURL_FAILED, etc.)
        const failed_index_match = e.description?.match(/failed to send message #(\d+)/);
        if (failed_index_match) {
            status = 'redo'
            const failed_index = parseInt(failed_index_match[1]) - 1;
            markFailedMediaItem(mg, failed_index, current_mg_type, mg_type)
        }

        if (status) {
            if (status === 'redo') {
                // Don't re-add the same type if we detected specific item failures
                if (!failed_index_match) {
                    mg_type.unshift(current_mg_type)
                }
            }
            return await sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type, retryCount + 1)
        } else {
            honsole.warn('error send mg', chat_id, mg, e.description || e.message)
            return false
        }
    }
}

/**
 * send photo with retry
 * @param {*} chat_id
 * @param {*} language_code
 * @param {*} photo_urls
 * @param {*} extra
 * @returns
 */
export async function sendPhotoWithRetry(chat_id, language_code, photo_urls = [], extra) {
    const bot = getBot()
    if (photo_urls.length === 0) {
        honsole.warn('error send photo', chat_id, photo_urls)
        return false
    }
    // Send upload_photo action
    bot.api.sendChatAction(chat_id, 'upload_photo', extra.message_thread_id ? {
        message_thread_id: extra.message_thread_id
    } : {}).catch(() => { })

    let raw_photo_url = photo_urls.shift()
    let photo_url = raw_photo_url
    try {
        if (photo_url.substring(0, 3) === 'dl-') {
            photo_url = new InputFile(await fetch_tmp_file(photo_url.substring(3)))
        }
        return await bot.api.sendPhoto(chat_id, photo_url, extra)
    } catch (e) {
        const status = await catchily(e, chat_id, language_code)
        if (status) {
            if (status === 'redo') {
                photo_urls.unshift(raw_photo_url)
            }
            return await sendPhotoWithRetry(chat_id, language_code, photo_urls, extra)
        } else {
            honsole.warn('error send photo', chat_id, photo_urls)
            return false
        }
    }
}

/**
 * sendDocumentWithRetry
 * @param {*} chat_id
 * @param {*} media_o - Can be URL or local file path
 * @param {*} extra
 * @param {*} l
 */
export async function sendDocumentWithRetry(chat_id, media_o, extra, l) {
    const bot = getBot()
    // Send upload_document action
    bot.api.sendChatAction(chat_id, 'upload_document', extra.message_thread_id ? {
        message_thread_id: extra.message_thread_id
    } : {}).catch(() => { })

    let reply_to_message_id = null
    extra = {
        ...extra,
        disable_content_type_detection: true
    }
    let file = null
    try {
        // Check if media_o is local path or HTTP URL
        if (media_o.includes('tmp/')) {
            // Local file - read directly
            file = new InputFile(media_o, media_o.slice(media_o.lastIndexOf('/') + 1))
        } else {
            // HTTP URL - download first
            file = new InputFile(await fetch_tmp_file(media_o), media_o.slice(media_o.lastIndexOf('/') + 1))
        }
    } catch (error) {
        honsole.warn('[sendDocumentWithRetry] File fetch failed:', error.message)

        // Check if it's a deletion case or file too large case
        // Create message-specific extra by filtering out document-specific fields
        const messageExtra = {
            parse_mode: extra.parse_mode,
            reply_to_message_id: extra.reply_to_message_id,
            message_thread_id: extra.message_thread_id,
            allow_sending_without_reply: extra.allow_sending_without_reply
        }

        if (error.message.includes('File and illust not found') || error.message.includes('Illust not found')) {
            // Case 2: Entire artwork deleted - mark as deleted
            await bot.api.sendMessage(chat_id, _l(l, 'deleted'), messageExtra).then(x => {
                reply_to_message_id = x.message_id
            }).catch(() => { })
            return reply_to_message_id
        } else if (media_o) {
            // Case: File too large or other fetch error
            await bot.api.sendMessage(chat_id, _l(l, 'file_too_large', media_o.replace('i.pximg.net', config.pixiv.pximgproxy)), messageExtra).then(x => {
                reply_to_message_id = x.message_id
            }).catch(() => { })
            return reply_to_message_id
        } else {
            // Case: No media_o provided or other unexpected error
            await bot.api.sendMessage(chat_id, _l(l, 'error'), messageExtra).then(x => {
                reply_to_message_id = x.message_id
            }).catch(() => { })
            return reply_to_message_id
        }
    }

    // Only proceed if file is successfully fetched
    if (file) {
        await bot.api.sendDocument(
            chat_id,
            file,
            extra).then(x => {
                reply_to_message_id = x.message_id
            }).catch(async (e) => {
                if (await catchily(e, chat_id, l)) {
                    try {
                        // Retry logic - handle local path vs HTTP URL
                        let retryFile
                        if (media_o.includes('tmp/')) {
                            retryFile = new InputFile(media_o, media_o.slice(media_o.lastIndexOf('/') + 1))
                        } else {
                            retryFile = new InputFile(await fetch_tmp_file(media_o), media_o.slice(media_o.lastIndexOf('/') + 1))
                        }
                        await bot.api.sendDocument(chat_id, retryFile, extra).then(x => {
                            reply_to_message_id = x.message_id
                        })
                    } catch (retryError) {
                        const messageExtra = {
                            parse_mode: extra.parse_mode,
                            reply_to_message_id: extra.reply_to_message_id,
                            message_thread_id: extra.message_thread_id,
                            allow_sending_without_reply: extra.allow_sending_without_reply
                        }
                        await bot.api.sendMessage(chat_id, _l(l, 'file_too_large', media_o.replace('i.pximg.net', config.pixiv.pximgproxy)), messageExtra).then(x => {
                            reply_to_message_id = x.message_id
                        }).catch(() => { })
                    }
                }
            })
    }
    return reply_to_message_id
}
