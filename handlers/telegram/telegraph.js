const fetch = require('node-fetch')
const config = require('../../config.json')
const { asyncForEach } = require('../common')
const br = { tag: 'br' }
/**
 * mediagroup to telegraph
 * @param {} mg mediagroup
 * @returns 
 */
async function mg2telegraph(mg) {
    let t_data = [{
        content: [],
        ids: []
    }]
    let t_data_id = 0
    try {
        mg.forEach(d => {
            let url = d.media.replace('i-cf.pximg.net', config.pixiv.pximgproxy)
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
            if (((JSON.stringify(t_data[t_data_id].content).length + same_illust.length * JSON.stringify(dd).length)) > 64000) {
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
            let data = await publish2telegraph('Pixiv collection', d.content)
            if (data.ok) {
                res_data.push({
                    url: data.result.url,
                    ids: d.ids
                })
            } else {
                throw data
            }
        })
        return res_data
    } catch (error) {
        console.warn(error)
    }
}
async function novel2telegraph(novel) {
    let content = novel.content.split('\n')
    for (let i = content.length; i > 0; i--) {
        content.splice(i, 0, br)
    }
    return await publish2telegraph(novel.title, [{
        "tag": "p",
        "children": content
    }])
}

/**
 * publish to telegra.ph
 * @param {String} title title
 * @param {Array} content content
 * @param {String} type type
 * @returns 
 */
async function publish2telegraph(title = 'Pixiv collection', content, type) {
    try {
        //let data = await (await fetch('https://api.telegra.ph/editPage',{
        let data = await (await fetch('https://api.telegra.ph/createPage', {
            method: 'post',
            body: JSON.stringify({
                title: title,
                content: JSON.stringify(content),
                access_token: config.tg.access_token,
                author_name: 'Pixiv', // 感觉还是要自定义 等 db.chat_setting 搞了后再来把
                author_url: 'https://t.me/Pixiv_bot' // 写死了 后面想想要怎么改
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        })).json()
        console.log(data)
        return data
    } catch (error) {
        console.warn(error)
        return {
            ok: false
        }
    }

}
module.exports = {
    mg2telegraph,
    novel2telegraph,
    publish2telegraph
}