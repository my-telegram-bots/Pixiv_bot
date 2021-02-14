const r_p = require('./r_p')
const { default: axios } = require('axios')
const exec = require('util').promisify((require('child_process')).exec)
const fs = require('fs')
const config = require('../../config.json')
async function ugoira_to_mp4(id,force = false) {
    if (fs.existsSync(`./tmp/mp4_1/${id}.mp4`)) 
        return `./tmp/mp4_1/${id}.mp4`
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
        await download_ugoira(id,ud.originalSrc)
        // Windows 自己补全这些软件并且自己改路径之类的 不做兼容
        // 解压没有现成好用的轮子
        // 所以干脆直接 exec 了 以后有好办法再改咯
        // force 为强制更新
        if (fs.existsSync(`./tmp/mp4_0/${id}.mp4`)){
            if (!force)
                fs.unlinkSync(`./tmp/mp4_0/${id}.mp4`)
            else
                return `./tmp/mp4_1/${id}.mp4`
        }
        if (fs.existsSync(`./tmp/mp4_1/${id}.mp4`)){
            if(!force)
                fs.unlinkSync(`./tmp/mp4_1/${id}.mp4`)
            else
                return `./tmp/mp4_1/${id}.mp4`
        }
        await exec(`unzip -n './tmp/zip/${id}.zip' -d './tmp/ugoira/${id}'`)
        // 处理开始！
        // 先用 ffmpeg 转成图片
        await exec(`ffmpeg -i ./tmp/ugoira/${id}/%6d.jpg -c:v libx264 -vf "format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2" ./tmp/mp4_0/${id}.mp4`, { timeout: 60 * 1000 })
        // 然后用 mp4fpsmod 添加时间轴
        await exec(`mp4fpsmod -o ./tmp/mp4_1/${id}.mp4 -t ./tmp/timecode/${id} ./tmp/mp4_0/${id}.mp4`, { timeout: 60 * 1000 })
        return `./tmp/mp4_1/${id}.mp4`
    } catch (error) {
        console.error(error)
        return false
    }
}
function download_ugoira(id,url) {
    // s t r e a m 没 有 a s y n c
    return new Promise(async (resolve, reject) => {
        let d = (await axios.get(url, {
            responseType: 'stream',
            headers: {
                'User-Agent': config.pixiv.ua,
                'Referer': 'https://www.pixiv.net'
            }
        })).data
        let zipfile = fs.createWriteStream(`./tmp/zip/${id}.zip`)
        d.pipe(zipfile)
        zipfile.on('finish', resolve)
    })
}
module.exports = ugoira_to_mp4