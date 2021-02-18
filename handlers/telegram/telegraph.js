const fetch = require('node-fetch')
const config = require('../../config.json')
const br = {tag: 'br'}
async function mg2telegraph(mg){
    try {
        let content = mg.map(d=>{
            let caption = d.caption.split('\n')
            for (let i = caption.length ; i > 0; i--) {
                caption.splice(i,0,br)
            }
            return {
                tag: 'figure',
                children: [
                    {
                        tag: 'img',
                        attrs: {
                            'src': d.media.replace('i-cf.pximg.net',config.pixiv.pximgproxy) 
                        }
                    },
                    {
                        tag: 'figcaption',
                        children: caption
                    },
                ]
            }
        })
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
            return data.result.url
        }else{
            throw data
        }
    } catch (error) {
        console.warn(error)
    }
}
module.exports = {
    mg2telegraph
}