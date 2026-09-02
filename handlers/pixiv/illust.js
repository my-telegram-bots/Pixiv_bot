import { r_p_ajax } from '#handlers/pixiv/request'
import { updateIllust, deleteIllust } from '#db'
import { honsole } from '#handlers/common'
import { thumb_to_all } from '#handlers/pixiv/tools'

/**
 * fetch image url and size and update in database
 * @param {*} illust
 * @param {object} extra_data extra data stored in database
 * @param {boolean} id_update_flag true => will delete 'id' (string) and create id (number)
 * @param {boolean} lightweight Lightweight mode: skip head_url check for faster loading
 * @returns object
 */
export async function update_illust(illust, extra_data = false, id_update_flag = true, lightweight = false) {
    if (typeof illust != 'object') {
        return false
    }
    let real_illust = {}
    for (let key in illust) {
        // string -> number
        if (['id', 'illustId', 'userId', 'sl', 'illustType', 'illust_page_count', 'illust_id', 'illust_type', 'user_id'].includes(key) && typeof illust[key] == 'string') {
            illust[key] = parseInt(illust[key])
        }
        // _ syntax
        ['Id', 'Title', 'Type', 'Date', 'Restrict', 'Comment', 'Promotion', 'Data', 'Count', 'Original', 'Illust', 'Url', 'Name', 'userAccount', 'Name', 'ImageUrl'].forEach(k1 => {
            if (key.includes(k1)) {
                let k2 = key.replace(k1, `_${k1.toLowerCase()}`)
                illust[k2] = illust[key]
                delete illust[key]
                key = k2
            }
        })
        if (key.includes('illust_')) {
            if (!illust[key.replace('illust_', '')]) {
                illust[key.replace('illust_', '')] = illust[key]
            }
        }
        if (key.includes('user_')) {
            if (!illust[key.replace('user_', 'author_')]) {
                illust[key.replace('user_', 'author_')] = illust[key]
            }
        }
    }
    if (illust.tags) {
        if (illust.tags.tags) {
            let tags = []
            illust.tags.tags.forEach(tag => {
                tags.push(tag.tag)
            })
            illust.tags = tags
        }
    }
    // if (new Date(illust.create_date)) {
    //     illust.create_date = +new Date(illust.create_date) / 1000
    // }
    if (illust.type == 2) {
        if (!illust.urls.original) {
            const detail = (await r_p_ajax.get(`illust/${illust.id}`)).data.body
            return update_illust(detail, extra_data, id_update_flag, lightweight)
        }
        illust.imgs_ = {
            size: [{
                width: illust.width ? illust.width : illust.imgs_.size[0].width,
                height: illust.height ? illust.height : illust.imgs_.size[0].height
            }],
            cover_img_url: illust.urls.original
        }
    } else if (!illust.imgs_ || !illust.imgs_.size || !illust.imgs_.size[0]) {
        // Fresh data from Pixiv API has urls field - use it directly
        if (illust.urls && illust.urls.original) {
            // Multi-page work: fetch all pages from API
            if ((illust.page_count && illust.page_count > 1) || (illust.pageCount && illust.pageCount > 1)) {
                honsole.dev('fetch multi-page illust pages', illust.id)
                const pagesData = await r_p_ajax('illust/' + illust.id + '/pages')
                const pages = pagesData.data.body

                illust.imgs_ = {
                    thumb_urls: pages.map(p => p.urls.thumb || p.urls.small),
                    regular_urls: pages.map(p => p.urls.regular || p.urls.medium),
                    original_urls: pages.map(p => p.urls.original),
                    size: pages.map(p => ({ width: p.width, height: p.height }))
                }
            } else {
                // Single page: use urls directly
                illust.imgs_ = {
                    thumb_urls: [illust.urls.thumb || illust.urls.small],
                    regular_urls: [illust.urls.regular || illust.urls.medium],
                    original_urls: [illust.urls.original],
                    size: [{
                        width: illust.width,
                        height: illust.height
                    }]
                }
            }
        } else {
            // Old data without urls field - fallback to thumb_to_all (string replacement)
            illust.imgs_ = await thumb_to_all(illust, 0, lightweight)
            if (!illust.imgs_) {
                honsole.warn('media URLs unavailable for illustration', illust.id)
                return
            }
        }
    }
    ['id', 'title', 'type', 'comment', 'description', 'author_id', 'author_name', 'imgs_', 'tags', 'sl', 'restrict', 'x_restrict', 'ai_type', 'tg_file_id'].forEach(x => {
        // I think pixiv isn't pass me a object?
        if (illust[x] !== undefined && (x !== 'tg_file_id' || illust.type === 2)) {
            real_illust[x] = illust[x]
        }
    })
    if (extra_data) {
        real_illust = {
            ...real_illust,
            ...extra_data
        }
    }
    if (!id_update_flag) {
        try {
            // Delete old record before inserting new one with correct ID
            await deleteIllust(illust.id)
        }
        catch (error) {
            console.warn(error)
        }
    }
    await updateIllust(illust.id, real_illust, null, { upsert: true })
    honsole.dev('real_illust', real_illust)

    return real_illust
}
