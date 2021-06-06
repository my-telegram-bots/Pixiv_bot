
/**
 * get Pixiv illust_id / novel_id from user's input
 * @param {*} text text
 */
function get_pixiv_ids(text, type = 'illust') {
    if (!text)
        return false
    let ids = []
    // http://www.pixiv.net/en -> https://pixiv.net
    // A-Z, a-z, 0-9, _ and - are allowed. We recommend using base64url to encode parameters with binary and other types of content.
    text.replaceAll('-_-', ' ').replaceAll('www.', '').replaceAll('http://', 'https://').replaceAll('https://', '\nhttps://').replaceAll('  ', ' ').replaceAll(' ', '\n').replaceAll('/en/', '/').split('\n').forEach(u => {
        try {
            if (!u || u.length < 6) {
                return []
                // Match url(s)
            } else if (u.includes('novel') && type == 'novel') {
                if (!isNaN(parseInt(u.replace('https://pixiv.net/novel/show.php?id=', '').split('&')[0]))) {
                    ids.push(parseInt(u.replace('https://pixiv.net/novel/show.php?id=', '').split('&')[0]))
                }
            } else if (type == 'illust' && !u.includes('novel')) {
                try {
                    let uu = new URL(u).searchParams
                    if (uu.get('illust_id')) {
                        ids.push(uu.get('illust_id'))
                    }
                } catch (error) {

                }
                if (u.length > 7 && !isNaN(parseInt(u.replace('#', '').replace('id=', '').replace('id', '')))) {
                    // match #idxxxxxxx #xxxxxxx
                    ids.push(parseInt(u.replace('#', '').replace('id', '').replace('=', '')))
                } else {
                    throw 'switch to general id matcher'
                }
            }
        } catch (error) {
            // https://www.pixiv.net/en/artworks/87466156
            // https://www.pixiv.net/artworks/87466156
            // http://www.pixiv.net/artworks/87466156
            // https://pixiv.net/i/87466156
            // pixiv.net/i/87466156
            // 87466156
            // match text only have id (may resulted spam)
            let t = u.replaceAll('https://', '').replace('pixiv.net', '').replace('artworks', '').replace('i', '').replaceAll('/', '').split('?')[0]
            if (!isNaN(t) && t && t.length == 8) {
                ids.push(t)
            }
        }
    })
    return ids
}
module.exports = get_pixiv_ids