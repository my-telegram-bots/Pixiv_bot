const { default: axios } = require("axios")
const { r_p_ajax } = require('./request')
const fs = require('fs')
const config = require('../../config.json')
const { download_file, sleep, honsole, asyncForEach, exec } = require('../common')
// ugoira queue
let ugoira_mp4_queue_list = []
let ugoira_gif_queue_list = []
/**
 * thumb url to regular and original url
 * @param {string} thumb_url 
 * @param {number} page_count 
 * @returns 
 */
async function thumb_to_all(illust, try_time = 0) {
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
        process.exit()
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
            console.log(imgs_)
        })
        return { ...imgs_ }
    } catch (error) {
        if (error.response && error.response.status == 404) {
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
 * @returns 
 */
async function ugoira_to_mp4(id, retry_time = 0, force = false) {
    if (fs.existsSync(`./tmp/mp4_1/${id}.mp4`) && !force) {
        return `${config.pixiv.ugoiraurl}/${id}.mp4`
    }
    if (retry_time > 3) {
        return false
    }
    if (ugoira_mp4_queue_list.length > 4 || ugoira_mp4_queue_list.includes(id)) {
        await sleep(1000)
        return await ugoira_to_mp4(id, false)
    }
    ugoira_mp4_queue_list.push(id)
    try {
        id = parseInt(id)
        let ud = (await r_p_ajax(`/illust/${id}/ugoira_meta`)).data
        if (ud.error) {
            return false
        }
        ud = ud.body
        // 确定每一帧出现的时长
        let frame = '# timecode format v2\n0\n'
        let tempframe = 0
        ud.frames.forEach((f) => {
            tempframe += f.delay
            frame += (tempframe + "\n")
        }, this)
        fs.writeFileSync(`./tmp/timecode/${id}`, frame)
        // 下载
        await download_file(ud.originalSrc, id)
        // Windows 自己补全这些软件并且自己改路径之类的 不做兼容
        // 解压没有现成好用的轮子
        // 所以干脆直接 exec 了 以后有好办法再改咯
        // force 为强制更新
        if (fs.existsSync(`./tmp/mp4_1/${id}.mp4`)) {
            if (!force) {
                fs.unlinkSync(`./tmp/mp4_1/${id}.mp4`)
            } else {
                return `${config.pixiv.ugoiraurl}/mp4_1/${id}.mp4`
            }
        }
        if (fs.existsSync(`./tmp/ugoira/${id}`)) {
            fs.rmdirSync(`./tmp/ugoira/${id}`, {
                recursive: true
            })
        }
        if (fs.existsSync(`./tmp/mp4_0/${id}.mp4`)) {
            fs.unlinkSync(`./tmp/mp4_0/${id}.mp4`)
        }
        await exec(`unzip -n './tmp/file/${id}.zip' -d './tmp/ugoira/${id}'`)
        // copy last frame
        fs.copyFileSync(`./tmp/ugoira/${id}/${(ud.frames.length - 1).toString().padStart(6, 0)}.jpg`, `./tmp/ugoira/${id}/${(ud.frames.length).toString().padStart(6, 0)}.jpg`)
        // jpg -> mp4 (no fps metadata)
        await exec(`ffmpeg -y -i ./tmp/ugoira/${id}/%6d.jpg -c:v libx264 -vf "format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2" ./tmp/mp4_0/${id}.mp4`, { timeout: 240 * 1000 })
        // add time metadata via mp4fpsmod
        await exec(`mp4fpsmod -o ./tmp/mp4_1/${id}.mp4 -t ./tmp/timecode/${id} ./tmp/mp4_0/${id}.mp4`, { timeout: 240 * 1000 })
        ugoira_mp4_queue_list.splice(ugoira_mp4_queue_list.indexOf(id), 1)
        return `${config.pixiv.ugoiraurl}/${id}.mp4`
    } catch (error) {
        honsole.warn(error)
        ugoira_mp4_queue_list.splice(ugoira_mp4_queue_list.indexOf(id), 1)
        return await ugoira_to_mp4(id, retry_time + 1, force)
    }
}
/**
 * ugoira mp4 to gif
 * ~~ why not apng to gif ? ~~ -> lazy
 * @param {*} id 
 */
async function ugoira_to_gif(id, quality = 'high', real_width = 0, real_height = 0, retry_time = 0, force = false) {
    let height = 0
    let width = 0
    if (!['high', 'medium', 'small'].includes(quality)) {
        quality = 'high'
    }
    if (fs.existsSync(`./tmp/gif/${id}-${quality}.gif`) && !force) {
        return `${config.pixiv.ugoiraurl.replace('mp4_1', 'gif')}/${id}-${quality}.gif`
    }
    if (ugoira_gif_queue_list.length > 4 || ugoira_gif_queue_list.includes(id)) {
        await sleep(1000)
        return await ugoira_to_gif(id, quality, real_width, real_height, retry_time, force)
    }
    ugoira_gif_queue_list.push(id)
    await ugoira_to_mp4(id)
    try {
        if (!real_width || !real_height) {
            let e = (await exec(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 './tmp/mp4_1/${id}.mp4'`)).stdout.replace('\n', '').split('x')
            real_width = e[0]
            real_height = e[1]
        }
        switch (quality) {
            case 'high':
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
        console.log(width, height)
        // ffmpeg configuration from 
        // https://bhupesh-v.github.io/convert-videos-high-quality-gif-ffmpeg/
        // and who from ACGN taiwan
        if (!fs.existsSync(`./tmp/palette/${id}-${quality}.png`)) {
            await exec(`ffmpeg -y -i ./tmp/mp4_1/${id}.mp4 -vf "fps=24,scale=iw*min(1\\,min(${width}/iw\\,${height}/ih)):-2:flags=lanczos,palettegen" ./tmp/palette/${id}-${quality}.png`)
        }
        await exec(`ffmpeg -y -t 30 -i ./tmp/mp4_1/${id}.mp4 -i ./tmp/palette/${id}.png  -filter_complex "fps=24,scale=iw*min(1\\,min(${width}/iw\\,${height}/ih)):-2:flags=lanczos[x];[x][1:v]paletteuse" ./tmp/gif/${id}-${quality}-processing.gif`)
        fs.renameSync(`./tmp/gif/${id}-${quality}-processing.gif`, `./tmp/gif/${id}-${quality}.gif`)
        ugoira_gif_queue_list.splice(ugoira_gif_queue_list.indexOf(id), 1)
    } catch (error) {
        console.warn(error)
        ugoira_gif_queue_list.splice(ugoira_gif_queue_list.indexOf(id), 1)
        await sleep(500)
        return await ugoira_to_gif(id, quality, real_width, real_height, retry_time + 1, force)
    }
    return `${config.pixiv.ugoiraurl.replace('mp4_1', 'gif')}/${id}-${quality}.gif`
}
/**
 * get url's file size (content-length)
 * @param {*} url 
 * @returns number / boolean
 */
async function head_url(url, try_time = 0) {
    if (try_time > 6) {
        honsole.error('can\'t get', url, 'content-length')
        return false
    }
    url = url.replace('i-cf', 'i')
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
            }
        })
        if (!res.headers['content-length']) {
            if (try_time > 4) {
                // real content-length
                return res.data.length
            } else {
                throw 'n_cl' // no have content-length
            }
        }
        // Warning, Pixiv return content-length value is not a real file size
        // it less than real_value
        // pixiv's content-length * .1.05 ≈ real_value
        return parseInt(res.headers['content-length'])
    } catch (error) {
        if (error.response && error.response.status == 404) {
            return 404
        } else {
            honsole.warn('ggggg try again')
            honsole.dev(error)
            await sleep(500)
            return await head_url(url, try_time + 1)
        }
    }
}
module.exports = {
    thumb_to_all,
    head_url,
    ugoira_to_mp4,
    ugoira_to_gif
}