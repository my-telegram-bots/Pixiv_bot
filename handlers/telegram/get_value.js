const { honsole } = require("../common")

/**
 * get Pixiv illust_id / novel_id from user's input
 * @param {*} text text
 */
function get_pixiv_ids(text) {
    let ids = {
        illust: [],
        author: [],
        novel: []
    }
    if (text) {
        text.replaceAll('-_-', ' ').replaceAll('www.', '').replaceAll('http://', 'https://').replaceAll('https://', '\nhttps://').replaceAll('  ', ' ').replaceAll('+', ' ').replaceAll('-', ' ').replaceAll(' ', '\n').replaceAll('/en', '/').split('\n').forEach(u => {
            try {
                if (!u || u.length < 6) {
                    return []
                    // Match url(s)
                }
                if (u.includes('novel')) {
                    if (!isNaN(parseInt(u.replace('https://pixiv.net/novel/show.php?id=', '').split('&')[0]))) {
                        ids.novel.push(parseInt(u.replace('https://pixiv.net/novel/show.php?id=', '').split('&')[0]))
                    }
                }
                if (u.includes('user')) {
                    if (!isNaN(parseInt(u.replace('https://pixiv.net/users/', '').split('?')[0].split('&')[0]))) {
                        ids.author.push(parseInt(u.replace('https://pixiv.net/users/', '').split('?')[0].split('&')[0]))
                    }
                }
                // general search
                try {
                    let uu = new URL(u).searchParams
                    if (uu.get('illust_id')) {
                        ids.illust.push(parseInt(uu.get('illust_id')))
                    }
                } catch (error) {

                }
                if (u.length > 7 && !isNaN(parseInt(u.replace('#', '').replace('id=', '').replace('id', '')))) {
                    // match #idxxxxxxx #xxxxxxx
                    ids.illust.push(parseInt(u.replace('#', '').replace('id', '').replace('=', '')))
                } else {
                    throw 'switch to general id matcher'
                }
            } catch (error) {
                // https://www.pixiv.net/en/artworks/87466156
                // https://www.pixiv.net/artworks/87466156
                // http://www.pixiv.net/artworks/87466156
                // https://pixiv.net/i/87466156
                // pixiv.net/i/87466156
                // 87466156
                // match text only have id (may resulted spam)
                let t = u.replaceAll('https://', '').replace('pixiv.net', '').replace('artworks', '').replace('i', '').replaceAll('/', '').split('?')[0].split('#')[0]
                if (!isNaN(t) && t && t.length == 8) {
                    ids.illust.push(parseInt(t))
                }
            }
            honsole.dev('url:', u, ids)
        })
    }
    return { ...ids }
}

function get_values(text = ''){
    let list = {}
    text.split('\n').forEach(t => {
        if(t.includes('=')){
            let st = t.replace('=','\uff69').split('\uff69')
            st[0] = st[0].toLowerCase() // may be Title or Author
            if(['title','author_name','author_url','an','au'].includes(st[0])){
                if(st[0] == 'an')   list['author_name'] = st[1]
                if(st[0] == 'au')   list['author_url'] = st[1]
                list[st[0]] = st[1]
            }
        }
    })
    return list

}
module.exports = {
    get_pixiv_ids,
    get_values
}