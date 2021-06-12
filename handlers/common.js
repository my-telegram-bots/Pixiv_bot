const { default: axios } = require("axios")
const config = require('../config.json')
const fs = require('fs')
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }
}
/**
 * download file
 * @param {*} url 
 * @param {*} id 
 * @param {*} try_time 
 * @returns 
 */
function download_file(url, id, force = false, try_time = 0) {
    if (try_time > 5)
        return false
    url = url.replace('https://i.pximg.net/', 'https://i-cf.pximg.net/')
    let filename = url.split('/').slice(-1)[0]
    if (url.includes('.zip')) {
        filename = id + '.zip'
    }
    return new Promise(async (resolve, reject) => {
        try {
            let d = (await axios.get(url, {
                responseType: 'stream',
                headers: {
                    'User-Agent': config.pixiv.ua,
                    'Referer': 'https://www.pixiv.net'
                }
            })).data
            let dwfile = fs.createWriteStream(`./tmp/file/${filename}`)
            d.pipe(dwfile)
            dwfile.on('finish', function () {
                resolve(`./tmp/file/${filename}`)
            })
        } catch (error) {
            console.warn(error)
            await sleep(1000)
            resolve(download_file(url, id, try_time++))

        }
    })
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * catch error report && reply
 * @param {*} e error
 * @param {*} ctx ctx
 */
 async function catchily(e,ctx) {
    console.warn(e)
    ctx.telegram.sendMessage(config.tg.master_id, 'error' + e)
    if(e.response){
        if(e.response.description.includes('MEDIA_CAPTION_TOO_LONG')){
            await ctx.reply(_l(ctx.l, 'error_text_too_long'))
            return false
        }
    }
    return true
}
module.exports = {
    asyncForEach,
    download_file,
    catchily,
    sleep
}