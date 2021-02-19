const fetch = require('node-fetch')
const config = require('../../config.json')
const { asyncForEach } = require('../common')
const br = {tag: 'br'}
async function mg2telegraph(mg){
    // content (Array of Node, up to 64 KB)
    let t_data = [[]]
    let t_data_id = 0
    try {
        mg.forEach(d=>{
            let url = d.media.replace('i-cf.pximg.net',config.pixiv.pximgproxy)
            if(d.caption == ''){
                t_data[t_data_id].push({
                    tag: 'img',
                    attrs: {
                        src: url
                    }
                })
                return
            }
            let caption = d.caption.split('\n')
            for (let i = caption.length -2 ; i > 0; i--) {
                caption.splice(i,0,br)
            }
            let dd = {
                tag: 'figure',
                children: [
                    {
                        tag: 'img',
                        attrs: {
                            'src': url
                        }
                    },
                    {
                        tag: 'figcaption',
                        children: caption
                    },
                ]
            }
            let same_illust = mg.filter((p)=>{
                return p.q_id == d.q_id
            })
            if(((JSON.stringify(t_data[t_data_id]).length + same_illust.length * JSON.stringify(dd).length)) > 64000){
                t_data_id = t_data_id + 1
                t_data[t_data_id] = []
            }
            t_data[t_data_id].push(dd)
        })
        let urls = []
        await asyncForEach(t_data,async (content,id)=>{
            //let data = await (await fetch('https://api.telegra.ph/editPage',{
            let data = await (await fetch('https://api.telegra.ph/createPage',{
                method: 'post',
                body: JSON.stringify({
                    title: 'Pixiv collection',
                    content: JSON.stringify(content),
                    access_token: config.tg.access_token,
                    author_name: 'Pixiv', // 感觉还是要自定义 等 db.user 搞了后再来把
                    author_url: 'https://t.me/Pixiv_bot'
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            })).json()
            if(data.ok){
                console.log(data)
                urls.push(data.result.url)
            }else{
                throw data
            }
        })
        return urls
    } catch (error) {
        console.warn(error)
    }
}
module.exports = {
    mg2telegraph
}