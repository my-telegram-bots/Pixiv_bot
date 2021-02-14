const { default: axios } = require('axios')
const config = require('../../config.json')
module.exports = axios.create({
    baseURL: 'https://www.pixiv.net/ajax/',
    headers: {
        'User-Agent': config.pixiv.ua,
        'Cookie': config.pixiv.cookie
    }
})