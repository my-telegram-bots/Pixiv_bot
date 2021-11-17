import { default as axios } from 'axios'
import config from '../../config.js'
export const r_p_ajax = axios.create({
    baseURL: 'https://www.pixiv.net/ajax/',
    headers: {
        'User-Agent': config.pixiv.ua,
        'Cookie': config.pixiv.cookie
    }
})
export const r_p = axios.create({
    baseURL: 'https://www.pixiv.net/',
    headers: {
        'User-Agent': config.pixiv.ua,
        'Cookie': config.pixiv.cookie,
        'x-csrf-token': config.pixiv.csrf,
        'Referer': 'https://www.pixiv.net/'
    }
})
export const r_f = axios.create({
    baseURL: 'https://api.fanbox.cc/',
    headers: {
        'User-Agent': config.pixiv.ua,
        'Cookie': config.pixiv.fanbox_cookie,
        'Origin': 'https://www.fanbox.cc/'
    }
})