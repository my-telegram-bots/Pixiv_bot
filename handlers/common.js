import axios from 'axios'
import config from '../config.js'
import fs from 'fs'
import { _l } from './telegram/i18n.js'
import { createHash } from 'crypto'
import { promisify } from 'util'
import { exec as exec$0 } from 'child_process'
import { get_illust } from './pixiv/illust.js'
/**
 * ForEach with async
 * @param {Array} array
 * @param {Function} callback
 */
export async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }
}
/**
 * honsole => huggy console
 * record error and report
 */
export const honsole = {
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
 * download file from pixiv
 * @param {*} url
 * @param {*} id
 * @param {*} try_time
 * @returns
 */
let dw_queue_list = []
export async function download_file(url, id, force = false, try_time = 0) {
    // bypass cache, maybe not work
    if (url.includes(config.pixiv.ugoiraurl)) {
        return url + '?' + (+new Date())
    }
    if (!id) {
        if (url.includes('.pximg.net')) {
            let t = url.substring(url.lastIndexOf('/') + 1)
            id = t.substring(0, t.lastIndexOf('_'))
        }
    }
    if (try_time > 5) {
        return false
    }
    url = url.replace('https://i-cf.pximg.net/', 'https://i.pximg.net/')
    let filename = url.split('/').slice(-1)[0]
    if (url.includes('.zip')) {
        filename = id + '.zip'
    }
    if (fs.existsSync(`./tmp/file/${filename}`) && !force) {
        return `./tmp/file/${filename}`
    }
    if (dw_queue_list.length > 9 || dw_queue_list.includes(url)) {
        await sleep(1000)
        honsole.dev('downloading', id, url)
        return await download_file(url, id, force, try_time)
    }
    try {
        dw_queue_list.push(url)
        fs.writeFileSync(`./tmp/file/${filename}`, (await axios({
            url: url,
            method: 'GET',
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': config.pixiv.ua,
                // Referer policy only include domain/
                'Referer': 'https://www.pixiv.net/'
            }
        })).data)
        dw_queue_list.splice(dw_queue_list.indexOf(id), 1)
        return `./tmp/file/${filename}`
    } catch (error) {
        // maybe loooooop again LOL
        if (error.response && error.response.status === 404) {
            if (url.includes('pximg.net')) {
                // 404 = need refetch illust in database
                honsole.dev('[404] fetching raw data', id, url)
                await get_illust(id, true)
                return false
            }
        }
        console.warn(error)
        await sleep(1000)
        dw_queue_list.splice(dw_queue_list.indexOf(id), 1)
        return await download_file(url, id, try_time + 1)
    }
}
/**
 * fetch file in memory
 * @param {*} url 
 * @returns arraybuffer
 */
export async function fetch_tmp_file(url, retry_time = 0) {
    if (retry_time > 3) {
        return null
    }
    try {
        return (await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': config.pixiv.ua,
                // Referer policy only include domain/
                'Referer': 'https://www.pixiv.net/'
            }
        })).data
    } catch (error) {
        await sleep(1000)
        if (error.response && error.response.status === 404) {
            return null
        }
        return await fetch_tmp_file(url, retry_time + 1)
    }
}
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
export function generate_token(user_id, time = +new Date()) {
    return createHash('sha1').update(`${config.tg.salt}${user_id}${time}`).digest('hex').toString()
}
export const exec = { promisify }.promisify(({ exec: exec$0 }).exec)

String.prototype.escapeHTML = function () {
    return (this.replaceAll('&', '&amp;').replaceAll('>', '&gt;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'))
}