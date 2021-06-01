
/**
 * get Pixiv illust_id / novel_id from user's input
 * @param {*} text text
 */
function get_pixiv_ids(text,type = 'illust') {
    if(!text)
        return false
    let ids = []
    // A-Z, a-z, 0-9, _ and - are allowed. We recommend using base64url to encode parameters with binary and other types of content.
    // http://www.pixiv.net -> https://pixiv.net
    text.replaceAll('-_-', ' ').replaceAll('www.', '').replaceAll('http://', 'https://').replaceAll('  ', ' ').replaceAll(' ','\n').split('\n').forEach(u => {
        try {
            if(!u || u.length < 6){
                return []
            // Match url(s)
            }else if(u.includes('novel') && type == 'novel'){
                if(!isNaN(parseInt(u.replace('https://pixiv.net/novel/show.php?id=','').split('&')[0]))){
                    ids.push(parseInt(u.replace('https://pixiv.net/novel/show.php?id=','').split('&')[0]))
                }
            }else if(type == 'illust' && !u.includes('novel')){
                try {
                    let uu = new URL(u).searchParams
                    if(uu.get('illust_id')){
                        ids.push(uu.get('illust_id'))
                    }
                } catch (error) {
                }
                if(u.length > 7 && !isNaN(parseInt(u.replace('#','').replace('id=','').replace('id','')))){
                    // 匹配 #idxxxxxxx #xxxxxxx
                    ids.push(parseInt(u.replace('#', '').replace('id', '').replace('=','')))
                }else{
                    throw 'switch to general id matcher'
                }
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
            let t = u.replaceAll('https://', '').replace('pixiv.net','').replace('artworks','').replace('i','').replace('en','').replaceAll('/', '').split('?')[0]
            if(!isNaN(t) && t && t.length == 8){
                ids.push(t)
            }
        }
    })
    return ids
}
module.exports = get_pixiv_ids