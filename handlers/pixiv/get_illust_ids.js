
/**
 * 从文本消息里面获取可能有的 Pixiv illust_id 们
 * @param {*} text 文本
 */
function get_illust_ids(text) {
    if(!text)
        return false
    let ids = []
    // 首先以换行来分割
    // A-Z, a-z, 0-9, _ and - are allowed. We recommend using base64url to encode parameters with binary and other types of content.
    text.replace(/-_-/ig, ' ').replace(/  /ig, ' ').replace(/\+tags/ig, '').split('\n').forEach(ntext => {
        // 接着按照空格来分割
        ntext.split(' ').forEach(u => {
            try {
                if(!u || u.length < 6){
                    return []
                // 这里是纯匹配数字
                }else if(u.length > 7 && !isNaN(parseInt(u.replace('#','').replace('id','')))){
                    // 匹配 #idxxxxxxx #xxxxxxx
                    ids.push(parseInt(u.replace('#', '').replace('id', '')))
                // 匹配老款 https://www.pixiv.net/member_illust.php?mode=medium&illust_id=87430599
                }else if(uu = new URL(u).searchParams.get('illust_id')) {
                    if(uu) {
                        ids.push(uu)
                    }
                }else{
                    throw 'switch general id match'
                }
            } catch (error) {
                // 在是url的前提下，继续匹配（如果不是url 上面 new URL 会直接报错 然后不处理了
                // 参考链接
                // https://www.pixiv.net/en/artworks/87466156
                // https://www.pixiv.net/artworks/87466156
                // http://www.pixiv.net/artworks/87466156
                // https://pixiv.net/i/87466156
                // pixiv.net/i/87466156
                // 87466156
                // 还有纯 id 也匹配了（一般轮不到这）
                let t = u.replace('https://', '').replace('http://', '').replace('www.','').replace('pixiv.net','').replace(/\//ig, '').replace('artworks','').replace('i','').replace('en','')
                if(!isNaN(t) && t && t.length == 8){
                    ids.push(t)
                }
            }
        })
    })
    return ids
}
module.exports = get_illust_ids