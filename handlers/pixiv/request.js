const { default: axios } = require('axios')
const config = require('../../config.json')
module.exports = {
    r_p_ajax: axios.create({
        baseURL: 'https://www.pixiv.net/ajax/',
        headers: {
            'User-Agent': config.pixiv.ua,
            'Cookie': config.pixiv.cookie
        }
    }),
    r_p: axios.create({
        baseURL: 'https://www.pixiv.net/',
        headers: {
            'User-Agent': config.pixiv.ua,
            'Cookie': config.pixiv.cookie,
            'x-csrf-token': config.pixiv.csrf,
            'Referer': 'https://www.pixiv.net/'
        }
    }),
    r_f: axios.create({
        baseURL: 'https://api.fanbox.cc/',
        headers: {
            'User-Agent': config.pixiv.ua,
            'Cookie': config.pixiv.fanbox_cookie,
            'Origin': 'https://www.fanbox.cc/'
        }
    })
}