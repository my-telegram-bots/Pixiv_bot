const { default: axios } = require("axios")
const config = require('../config.json')
const fs = require('fs')
const { _l } = require("./telegram/i18n")

/**
 * ForEach with async
 * @param {Array} array 
 * @param {Function} callback 
 */
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }
}
/**
 * honsole => huggy console
 * record error and report
 */
const honsole = {
    dev: function (...args) {
        if (process.env.dev) {
            console.log(...args)
        }
    },
    log: function (...args) {
        console.log(...args)
    },
    error: function (...args) {
        console.error(...args)
    },
    warn: function (...args) {
        console.warn(...args)
    }
}
/**
 * download file
 * @param {*} url 
 * @param {*} id 
 * @param {*} try_time 
 * @returns 
 */
let dw_queue_list = []
function download_file(url, id, force = false, try_time = 0) {
    if (url.includes(config.pixiv.ugoiraurl)) {
        return url + '?' + (+new Date())
    }
    if (try_time > 5) {
        return false
    }
    url = url.replace('https://i.pximg.net/', 'https://i-cf.pximg.net/')
    let filename = url.split('/').slice(-1)[0]
    if (url.includes('.zip')) {
        filename = id + '.zip'
    }
    if (fs.existsSync(`./tmp/file/${filename}`) && !force) {
        return `./tmp/file/${filename}`
    }
    if (dw_queue_list.length > 4 || dw_queue_list.includes(url)) {
        return new Promise(async (resolve, reject) => {
            await sleep(1000)
            honsole.dev('downloading', id, url)
            resolve(await download_file(url, id, force, try_time))
        })
    }
    return new Promise(async (resolve, reject) => {
        try {
            dw_queue_list.push(url)
            let d = (await axios.get(url, {
                responseType: 'stream',
                headers: {
                    'User-Agent': config.pixiv.ua,
                    'Referer': 'https://www.pixiv.net'
                }
            })).data
            let dwfile = fs.createWriteStream(`./tmp/file/temp_${filename}`)
            d.pipe(dwfile)
            dwfile.on('finish', function () {
                dw_queue_list.splice(dw_queue_list.indexOf(id), 1)
                fs.renameSync(`./tmp/file/temp_${filename}`, `./tmp/file/${filename}`)
                resolve(`./tmp/file/${filename}`)
            })
        } catch (error) {
            console.warn(error)
            await sleep(1000)
            dw_queue_list.splice(dw_queue_list.indexOf(id), 1)
            resolve(await download_file(url, id, try_time++))

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
async function catchily(e, ctx) {
    console.warn(e, JSON.stringify(e))
    ctx.telegram.sendMessage(config.tg.master_id, 'error' + e)
    if (e.response) {
        if (e.response.description.includes('MEDIA_CAPTION_TOO_LONG')) {
            await ctx.reply(_l(ctx.l, 'error_text_too_long'))
            return false
        } else if (e.response.description.includes('Forbidden:')) {
            return false
        }
    }
    return true
}
module.exports = {
    asyncForEach,
    download_file,
    catchily,
    sleep,
    honsole
}