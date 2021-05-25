
/**
 * 从文本消息里面获取可能有的 Pixiv illust_id 们
 * @param {*} text 文本
 */
function get_pixiv_ids(text) {
    if(!text)
        return false
    let ids = []
    // A-Z, a-z, 0-9, _ and - are allowed. We recommend using base64url to encode parameters with binary and other types of content.
    // 首先以换行来分割
    text.replace(/-_-/g, ' ').replace(/http/ig, ' ').replace(/=/g, ' ').replace(/  /g, ' ').split('\n').forEach(ntext => {
        // 接着按照空格来分割
        ntext.split(' ').forEach(u => {
            try {
                if(!u || u.length < 6){
                    return []
                // 这里是纯匹配数字
                }else if(u.length > 7 && !isNaN(parseInt(u.replace('#','').replace('id','')))){
                    // 匹配 #idxxxxxxx #xxxxxxx
                    ids.push(parseInt(u.replace('#', '').replace('id', '')))
                }else{
                    throw 'switch to general id matcher'
                }
            } catch (error) {
                // 在是url的前提下，继续匹配（如果不是url 上面 new URL 会直接报错 然后不处理了）
                // 参考链接
                // https://www.pixiv.net/en/artworks/87466156
                // https://www.pixiv.net/artworks/87466156
                // http://www.pixiv.net/artworks/87466156
                // https://pixiv.net/i/87466156
                // pixiv.net/i/87466156
                // 87466156
                // 还有纯 id 也匹配了 (spam警告)
                let t = u.replace('https://', '').replace('http://', '').replace('s://', '').replace('www.','').replace('pixiv.net','').replace('artworks','').replace('i','').replace('en','').replace(/\//ig, '')
                if(!isNaN(t) && t && t.length == 8){
                    ids.push(t)
                }
            }
        })
    })
    return ids
}
module.exports = get_pixiv_ids