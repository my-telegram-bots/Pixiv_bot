const { default: axios } = require("axios")
const config = require('../config.json')
const fs = require('fs')
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }
}
function download_file(url,id) {
    // s t r e a m 没 有 a s y n c
    url = url.replace('https://i.pximg.net/', 'https://i-cf.pximg.net/')
    return new Promise(async (resolve, reject) => {
        let d = (await axios.get(url, {
            responseType: 'stream',
            headers: {
                'User-Agent': config.pixiv.ua,
                'Referer': 'https://www.pixiv.net'
            }
        })).data
        let filename = url.split('/').slice(-1)[0]
        if(url.includes('.zip'))
            filename = id + '.zip'
        let dwfile = fs.createWriteStream(`./tmp/file/${filename}`)
        d.pipe(dwfile)
        function r(){
            resolve(`./tmp/file/${filename}`)
        }
        dwfile.on('finish', r)
    })
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
module.exports = {
    asyncForEach,
    download_file,
    sleep
}