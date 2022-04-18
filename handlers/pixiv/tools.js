import { default as axios } from 'axios'
import { r_p_ajax } from './request.js'
import fs from 'fs'
import config from '../../config.js'
import { download_file, sleep, honsole, asyncForEach, exec } from '../common.js'
// ugoira queue
// maybe need redis ?
let ugoira_mp4_queue_list = []
let ugoira_gif_queue_list = []

/**
 * thumb url to regular and original url
 * @param {string} thumb_url
 * @param {number} page_count
 * @returns
 */
export async function thumb_to_all(illust, try_time = 0) {
    if (try_time > 3) {
        return false
    }
    if (illust.type == 2) {
        return {
            size: [{
                width: illust.width ? illust.width : illust.imgs_.size[0].width,
                height: illust.height ? illust.height : illust.imgs_.size[0].height
            }]
        }
    }
    let imgs_ = {
        thumb_urls: [],
        regular_urls: [],
        original_urls: [],
        size: [],
        fsize: []
    }
    let base_url = illust.url ? illust.url : ((illust.imgs_ && illust.imgs_.thumb_urls) ? illust.imgs_.thumb_urls[0] : illust.urls.thumb)
    base_url = base_url
        .replace('/c/250x250_80_a2/custom-thumb', '∏a∏')
        .replace('/c/240x240/img-master', '∏a∏')
        .replace('/c/128x128/img-master', '∏a∏')
        .replace('/c/128x128/custom-thumb', '∏a∏')
        .replace('/c/250x250_80_a2/img-master', '∏a∏')
        .replace('_square1200', '∏b∏')
        .replace('_custom1200', '∏b∏')
        .replace('_master1200', '∏b∏')
    let thumb_url = base_url.replace('∏a∏', '/c/250x250_80_a2/img-master').replace('∏b∏', '_square1200')
    let original_url = base_url.replace('∏a∏', '/img-original').replace('∏b∏', '')
    let regular_url = base_url.replace('∏a∏', '/img-master').replace('∏b∏', '_master1200')
    if (process.argv[1].includes('update')) {
        console.log(thumb_url)
        console.log(original_url)
        console.log(regular_url)
    }
    if (!original_url.includes('orig')) {
        console.warn('Inpossible! no origin url', illust.id, original_url)
    }
    try {
        let original_img_length = await head_url(original_url)
        if (original_img_length == 404) {
            original_url = original_url.replace('.jpg', '.png')
        }
        if ((illust.page_count && illust.page_count > 1) || (illust.pageCount && illust.pageCount > 1) || (illust.imgs_ && illust.imgs_.size && illust.imgs_.size.length > 1)) {
            honsole.dev('query pages from pixiv', illust.id)
            illust.page = (await r_p_ajax('illust/' + illust.id + '/pages')).data.body.map((x, p) => {
                x.urls.thumb = thumb_url.replace(`p0`, `p${p}`)
                delete x.urls.thumb_mini
                return x
            })
        } else {
            illust.page = [{
                urls: {
                    original: original_url.replace('i.pximg.net', 'i-cf.pximg.net'),
                    regular: regular_url.replace('i.pximg.net', 'i-cf.pximg.net'),
                    thumb: thumb_url.replace('i.pximg.net', 'i-cf.pximg.net'),
                },
                width: illust.width ? illust.width : illust.imgs_.size[0].width,
                height: illust.height ? illust.height : illust.imgs_.size[0].height
            }]
        }
        await asyncForEach(illust.page, async (l, i) => {
            imgs_.thumb_urls[i] = l.urls.thumb.replace('i.pximg.net', 'i-cf.pximg.net')
            imgs_.regular_urls[i] = l.urls.regular.replace('i.pximg.net', 'i-cf.pximg.net')
            imgs_.original_urls[i] = l.urls.original.replace('i.pximg.net', 'i-cf.pximg.net')
            imgs_.size[i] = {
                width: l.width,
                height: l.height
            }
            if (!original_img_length || original_img_length == 404 || i > 0) {
                original_img_length = await head_url(imgs_.original_urls[i])
            }
            imgs_.fsize[i] = original_img_length
            honsole.dev(imgs_)
        })
        return { ...imgs_ }
    }
    catch (error) {
        if (error.response && error.response.status === 404) {
            return false
        }
        console.warn(error)
        await sleep(500)
        return await thumb_to_all(illust, try_time + 1)
    }
}

/**
 * ugoira to mp4
 * @param {*} id illustId
 * @param {*} force ignore exist file
 * @returns url
 */
export async function ugoira_to_mp4(id, force = false, retry_time = 0) {
    let final_path = get_ugoira_path(id, 'mp4')
    let no_tmp_path = final_path.replace('tmp/', '')

    let final_url = await detect_ugpira_url(id, 'mp4')

    if (!force && final_url) {
        return final_url
    }

    if (retry_time > 3) {
        honsole.error('convert mp4', id, 'error')
        return false
    }

    id = parseInt(id)
    // simple queue
    if (ugoira_mp4_queue_list.length > 4 || ugoira_mp4_queue_list.includes(id)) {
        await sleep(1000)
        return await ugoira_to_mp4(id, force, retry_time)
    }

    ugoira_mp4_queue_list.push(id)
    try {
        // get fps metadata (timecode)
        // powered by mp4fpsmod
        let ud = (await r_p_ajax(`/illust/${id}/ugoira_meta`)).data
        if (ud.error) {
            return false // 404 or not ugoira
        }
        ud = ud.body
        // set the duration of each frame
        let timecode = '# timecode format v2\n0\n'
        let temp_frame = 0
        ud.frames.forEach((f) => {
            temp_frame += f.delay
            timecode += `${temp_frame}\n`
        }, this)

        await clean_ugoira_cache(id)
        fs.writeFileSync(`./tmp/timecode/${id}`, timecode)
        // download ugoira.zip
        await download_file(ud.originalSrc, id, force)
        // windows:
        // choco install ffmpeg unzip
        await exec(`unzip -n './tmp/file/${id}.zip' -d './tmp/ugoira/${id}'`)
        // copy last frame
        // see this issue https://github.com/my-telegram-bots/Pixiv_bot/issues/1
        fs.copyFileSync(`./tmp/ugoira/${id}/${(ud.frames.length - 1).toString().padStart(6, 0)}.jpg`, `./tmp/ugoira/${id}/${(ud.frames.length).toString().padStart(6, 0)}.jpg`)
        // step1 jpg -> mp4 (no fps metadata)
        // thanks https://stackoverflow.com/questions/28086775/can-i-create-a-vfr-video-from-timestamped-images
        await exec(`ffmpeg -y -i ./tmp/ugoira/${id}/%6d.jpg -c:v libx264 -vf "format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2" ./tmp/mp4_0/${id}.mp4`, { timeout: 240 * 1000 })
        // step2 add fps metadata via mp4fpsmod
        await exec(`mp4fpsmod -o ${final_path} -t ./tmp/timecode/${id} ./tmp/mp4_0/${id}.mp4`, { timeout: 240 * 1000 })

        clean_ugoira_cache(id)
        ugoira_mp4_queue_list.splice(ugoira_mp4_queue_list.indexOf(id), 1)
    } catch (error) {
        honsole.warn(error)
        ugoira_mp4_queue_list.splice(ugoira_mp4_queue_list.indexOf(id), 1)
        await sleep(2000)
        await ugoira_to_mp4(id, force, retry_time + 1)
    }
    // return await detect_ugpira_url(id, 'mp4')
    return prefix + no_tmp_path
}
/**
 * get file path
 * real file location prefix is ./tmp/
 * @param {*} id
 * @param {0,1,2,3,mp4,gif-medium,gif-large,gif-small} type
 * @param {url,path} prefix
 * @returns
 */
export function get_ugoira_path(id, type = 0, prefix = 'tmp/') {
    let file_path = ''
    id = id.toString()
    switch (type) {
        case 0:
        case 'mp4':
            // only mp4 need indexing
            // if (id.length === 10) {
            //     file_path = `tmp/mp4/${id.substr(0, 4)}/${id}.mp4`
            //     // pixiv's illust will be grow up to 10000000 (length 9) next year.
            // } else if (id.length === 9) {
            //     file_path = `tmp/mp4/0${id.substr(0, 3)}/${id}.mp4`
            // } else {
            //     file_path = `tmp/mp4/${id.substr(0, 2).padStart(4,0)}/${id}.mp4`
            // }
            let index_path = `mp4/${id.substr(0, id.length - 6).padStart(4, 0)}`
            if (!fs.existsSync('tmp/' + index_path)) {
                fs.mkdirSync('tmp/' + index_path)
            }
            file_path = `${index_path}/${id}.mp4`
            break
        case 1:
        case 'gif-small':
            file_path = `gif/${id}-small.gif`
            break
        case 2:
        case 'gif-medium':
            file_path = `gif/${id}-medium.gif`
            break
        case 3:
        case 'gif-large':
            file_path = `gif/${id}-large.gif`
            break
    }
    return `${prefix}${file_path}`
}

/**
 * detect ugoira file url
 * @param {*} id 
 * @param {0,1,2,3,mp4,gif-medium,gif-large} type
 * @param {*} prefix 
 * @returns 
 */
export async function detect_ugpira_url(id, type = 0) {
    let final_path = get_ugoira_path(id, type)
    let no_tmp_path = final_path.replace('tmp/', '')
    // 但愿在有生之年不会爆炸
    // if (!isNaN(parseInt(path))) {
    //     path = get_ugoira_path(path, type)
    // }
    if (fs.existsSync(final_path)) {
        return `${config.pixiv.ugoiraurl}${no_tmp_path}`
    }
    else {
        return null
    }
}

/**
 * detect ugoira file
 * @param {*} id 
 * @param {0,1,2,3,mp4,gif-medium,gif-large} type
 * @param {*} prefix 
 * @returns filepath or prefix
 */
export function detect_ugpira_file(path, type = 0, prefix = 'tmp/') {
    // 但愿在有生之年不会爆炸
    path = get_ugoira_path(path, type)
    return fs.existsSync(`${path}`) ? (`${prefix}${path.replace('tmp/', '')}`) : null
}

export async function clean_ugoira_cache(id = '1') {
    fs.rmSync(`tmp/file/${id}.zip`, {
        force: true
    })
    fs.rmSync(`tmp/ugoira/${id}`, {
        recursive: true,
        force: true
    })
    fs.rmSync(`tmp/mp4_0/${id}.mp4`, {
        force: true
    })
    fs.rmSync(`tmp/timecode/${id}`, {
        force: true
    })
}

/**
 * ugoira mp4 to gif
 * ~~ why not apng to gif ? ~~ -> lazy
 * fps = 24
 * @param {number} id
 * @param {string} quality
 * @param {number} real_width
 * @param {number} real_height
 */
export async function ugoira_to_gif(id, quality = 'large', real_width = 0, real_height = 0, force = false, retry_time = 0) {
    let height = 0
    let width = 0
    // large also = origin (maybe)
    if (!['large', 'medium', 'small'].includes(quality)) {
        quality = 'large'
    }
    let final_path = get_ugoira_path(id, `gif-${quality}`)
    let no_tmp_path = final_path.replace('tmp/', '')

    if (fs.existsSync(final_path) && !force) {
        return config.pixiv.ugoiraurl + no_tmp_path
    }
    if (retry_time > 3) {
        honsole.warn('gif retry time exceed 3', id)
        return null
    }
    if (ugoira_gif_queue_list.length > 4 || ugoira_gif_queue_list.includes(id)) {
        await sleep(1000)
        return await ugoira_to_gif(id, quality, real_width, real_height, force, retry_time)
    }
    ugoira_gif_queue_list.push(id)
    let mp4_path = null
    let mp4_url = await ugoira_to_mp4(id)
    // check resouce is local
    if (mp4_url.startsWith(config.pixiv.ugoiraurl)) {
        mp4_path = get_ugoira_path(id, 'mp4')
    } else {
        // if not in local, download it
        mp4_path = await download_file(mp4_url, id)
    }
    try {
        // get width and height
        if (!real_width || !real_height) {
            let e = (await exec(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 '${mp4_path}'`)).stdout.replace('\n', '').split('x')
            real_width = e[0]
            real_height = e[1]
        }
        // quality = size
        switch (quality) {
            case 'large':
                width = real_width
                height = real_height
                break
            case 'medium':
                width = Math.round(real_width / 2)
                height = Math.round(real_height / 2)
                break
            case 'small':
                width = Math.round(real_width / 4)
                height = Math.round(real_height / 4)
                break
        }
        // ffmpeg configuration from 
        // https://bhupesh-v.github.io/convert-videos-high-quality-gif-ffmpeg/
        // and who from ACGN☆Taiwan (telegram)
        if (!fs.existsSync(`./tmp/palette/${id}-${quality}.png`)) {
            await exec(`ffmpeg -y -i '${mp4_path}' -vf "fps=24,scale=iw*min(1\\,min(${width}/iw\\,${height}/ih)):-2:flags=lanczos,palettegen" ./tmp/palette/${id}-${quality}.png`)
        }
        await exec(`ffmpeg -y -t 30 -i '${mp4_path}' -i ./tmp/palette/${id}-${quality}.png  -filter_complex "fps=24,scale=iw*min(1\\,min(${width}/iw\\,${height}/ih)):-2:flags=lanczos[x];[x][1:v]paletteuse" ./tmp/gif/${id}-${quality}-processing.gif`)
        // maybe hit cloudflare cache.
        // when the processing is complete, -processing.gif -> .gif
        fs.renameSync(`./tmp/gif/${id}-${quality}-processing.gif`, `./tmp/gif/${id}-${quality}.gif`)
        clean_ugoira_cache(id)
        ugoira_gif_queue_list.splice(ugoira_gif_queue_list.indexOf(id), 1)
    }
    catch (error) {
        honsole.warn(error)
        ugoira_gif_queue_list.splice(ugoira_gif_queue_list.indexOf(id), 1)
        await sleep(500)
        return await ugoira_to_gif(id, quality, real_width, real_height, force, retry_time + 1)
    }
    // return await detect_ugpira_url(id, `gif-${quality}`)
    return config.pixiv.ugoiraurl + no_tmp_path
}
/**
 * get url's file size (content-length)
 * @param {*} url
 * @returns number / boolean
 */
export async function head_url(url, try_time = 0) {
    // dbless mode -> save request time
    if (process.env.DBLESS) {
        return 99999999
    }
    if (try_time > 6) {
        honsole.error('can\'t get', url, 'content-length')
        return false
    }
    url = url.replace('i-cf.pixiv.net', 'i.pixiv.net')
    try {
        // original may be a .png file
        // send head reqeust to check.
        honsole.log('trying', try_time, url)
        let res = await axios({
            url: url,
            method: try_time > 1 ? 'GET' : 'HEAD',
            headers: {
                'User-Agent': config.pixiv.ua,
                'Referer': 'https://www.pixiv.net'
            },
            timeout: 1000
        })
        if (!res.headers['content-length']) {
            if (try_time > 3) {
                // real content-length
                return res.data.length
            }
            else {
                throw 'n_cl'; // no have content-length
            }
        }
        // Warning, Pixiv return content-length value is not a real file size
        // it less than real_value
        // pixiv's content-length * .1.05 ≈ real_value
        return parseInt(res.headers['content-length'])
    }
    catch (error) {
        if (error.response && error.response.status == 404) {
            // maybe not return 404 (length)
            return 404
        }
        else {
            honsole.warn('ggggg try again')
            honsole.dev(error)
            await sleep(100)
            return await head_url(url, try_time + 1)
        }
    }
}