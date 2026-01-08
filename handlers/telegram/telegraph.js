import fetch from 'node-fetch'
import config from '../../config.js'
import db from '../../db.js'
import { asyncForEach, generate_token, honsole } from '../common.js'
import { ugoira_to_mp4 } from '../pixiv/tools.js'
const br = { tag: 'br' }
/**
 * mediagroup to telegraph
 * @param {} mg mediagroup
 * @returns
 */
export async function mg2telegraph(mg, title, user_id, author_name, author_url) {
    let t_data = [{
        content: [],
        ids: []
    }]
    let t_data_id = 0
    try {
        await asyncForEach(mg, async (d) => {
            let url = null
            // telegraph cant fetch the file size over 2M
            if (d.type == 'video') {
                url = await ugoira_to_mp4(d.id)
                // iv support.webp for reduce file size and fetch time
            } else {
                url = d.media_r.replace('i-cf.pximg.net', config.pixiv.pximgproxy).replace('i.pximg.net', config.pixiv.pximgproxy)
                if (config.tg.webp) {
                    url += '.webp'
                }
            }
            // caption = '' = -> muilt images
            if (d.caption == '') {
                t_data[t_data_id].content.push({
                    tag: 'img',
                    attrs: {
                        src: url
                    }
                })
                return
            }
            let caption = d.caption.split('\n')
            for (let i = caption.length; i > 0; i--) {
                caption.splice(i, 0, br)
            }
            let dd = {
                tag: 'figure',
                children: [
                    {
                        tag: (d.type == 'video') ? 'video' : 'img',
                        attrs: {
                            src: url
                        }
                    },
                    {
                        tag: 'figcaption',
                        children: caption
                    }
                ]
            }
            let same_illust = mg.filter((p) => {
                return `${p.id}_${p.q_id}` == `${d.id}_${d.q_id}`
            })
            // content (Array of Node, up to 64 KB)
            if (JSON.stringify(dd).length + JSON.stringify(dd).length * same_illust.length + JSON.stringify(t_data[t_data_id].content).length + t_data[t_data_id].ids.join(' ').length * 30 > 63000) {
                t_data_id = t_data_id + 1
                t_data[t_data_id] = {
                    content: [],
                    ids: []
                }
            }
            t_data[t_data_id].content.push(dd)
            if (!t_data[t_data_id].ids.includes(d.id))
                t_data[t_data_id].ids.push(d.id)
        })
        let res_data = []
        // remove extra <p> tags
        await asyncForEach(t_data, async (d, id) => {
            d.content[d.content.length] = {
                tag: 'p',
                children: [d.ids.join(' ')]
            }
            let data = await publish2telegraph(title, user_id, d.content, author_name, author_url, d.ids.join(' '))
            if (data.ok) {
                res_data.push({
                    telegraph_url: data.result.url,
                    token: data.token,
                    ids: d.ids
                })
            }
            else {
                throw data
            }
        })
        return res_data
    }
    catch (error) {
        console.warn(error)
    }
}
export async function novel2telegraph(novel, user_id) {
    let content = novel.content.split('\n')
    for (let i = content.length; i > 0; i--) {
        content.splice(i, 0, br)
    }
    return await publish2telegraph(novel.title, user_id, [{
        "tag": "p",
        "children": content
    }], novel.userName, `https://www.pixiv.net/users/${novel.userId}`, '')
}
/**
 * publish to telegra.ph
 * @param {String} title title
 * @param {Array} content content
 * @param {String} type type
 * @returns
 */
export async function publish2telegraph(title = 'Pixiv collection', user_id, content, author_name = 'Pixiv_bot', author_url = 'https://t.me/pixiv_bot', raw_content = '') {
    try {
        let contentify = JSON.stringify(content)
        let time = +new Date()
        honsole.dev('tcontent', content)
        // see more https://telegra.ph/api
        //let data = await (await fetch('https://api.telegra.ph/editPage', {
        let data = await (await fetch('https://api.telegra.ph/createPage', {
            method: 'post',
            body: JSON.stringify({
                title: title,
                content: contentify,
                access_token: config.tg.access_token,
                author_name: author_name,
                author_url: author_url
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        })).json()
        if (data.ok) {
            console.log(data)
            await db.collection.telegraph.replaceOne({
                telegraph_url: data.result.url
            }, {
                telegraph_url: data.result.url,
                user_id: user_id,
                content: raw_content,
                time: time
            }, {
                upsert: true
            })
        }
        else {
            console.warn('generate telegraph error:', data)
        }
        return {
            ...data,
            token: generate_token(user_id, time)
        }
    }
    catch (error) {
        console.warn(error)
        return {
            ok: false
        }
    }
}