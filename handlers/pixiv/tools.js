const { default: axios } = require("axios")
const r_p = require('./r_p')
const exec = require('util').promisify((require('child_process')).exec)
const fs = require('fs')
const config = require('../../config.json')
const { download_file, sleep, honsole } = require('../common')
// ugoira queue
let ugoira_queue_list = []
/**
 * thumb url to regular and original url
 * @param {string} thumb_url 
 * @param {number} pageCount 
 * @returns 
 */
async function thumb_to_all(illust) {
    let imgs_ = {
        thumb_urls: [],
        regular_urls: [],
        original_urls: [],
        size: []
    }
    illust.url = illust.url.replace('i.pximg.net', 'i-cf.pximg.net')
    let url = illust.url.replace('/c/250x250_80_a2/custom-thumb', '∏a∏').replace('_custom1200', '∏b∏')
        .replace('/c/250x250_80_a2/img-master', '∏a∏').replace('_square1200', '∏b∏')
    let original_url = url.replace('∏a∏', '/img-original').replace('∏b∏', '')
    let regular_url = url.replace('∏a∏', '/img-master').replace('∏b∏', '_master1200')
    try {
        // original may be a .png file
        // send head reqeust to check.
        honsole.log('trying', original_url)
        await axios.head(original_url, {
            headers: {
                'User-Agent': config.pixiv.ua,
                'Referer': 'https://www.pixiv.net'
            }
        })
    } catch (error) {
        if (error.response.status == 404) {
            original_url = original_url.replace('.jpg', '.png')
        } else {
            console.warn(error)
        }
    }
    for (let i = 0; i < illust.pageCount; i++) {
        imgs_.thumb_urls[i] = illust.url.replace('p0', `p${i}`)
        imgs_.regular_urls[i] = regular_url.replace('p0', `p${i}`)
        imgs_.original_urls[i] = original_url.replace('p0', `p${i}`)
        imgs_.size[i] = {
            width: illust.width,
            height: illust.height
        }
    }
    return { ...imgs_ }
}
/**
 * ugoira to mp4
 * @param {*} id illustId
 * @param {*} force ignore exist file 
 * @returns 
 */
async function ugoira_to_mp4(id, force = false) {
    if (fs.existsSync(`./tmp/mp4_1/${id}.mp4`) && !force) {
        return `${config.pixiv.ugoiraurl}/${id}.mp4`
    }
    if (ugoira_queue_list.length > 4 || ugoira_queue_list.includes(id)) {
        await sleep(1000)
        return await ugoira_to_mp4(id, false)
    }
    ugoira_queue_list.push(id)
    try {
        id = parseInt(id).toString()
        let ud = (await r_p(`/illust/${id}/ugoira_meta`)).data
        if (ud.error)
            return false
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
        await exec(`ffmpeg -i ./tmp/ugoira/${id}/%6d.jpg -c:v libx264 -vf "format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2" ./tmp/mp4_0/${id}.mp4`, { timeout: 240 * 1000 })
        // add time metadata via mp4fpsmod
        await exec(`mp4fpsmod -o ./tmp/mp4_1/${id}.mp4 -t ./tmp/timecode/${id} ./tmp/mp4_0/${id}.mp4`, { timeout: 240 * 1000 })
        ugoira_queue_list.splice(ugoira_queue_list.indexOf(id), 1)
        return `${config.pixiv.ugoiraurl}/${id}.mp4`
    } catch (error) {
        console.warn(error)
        ugoira_queue_list.splice(ugoira_queue_list.indexOf(id), 1)
        return false
    }
}
module.exports = {
    thumb_to_all,
    ugoira_to_mp4
}