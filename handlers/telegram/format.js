/**
 * 格式化文字 好像并没有什么模板引擎 只好自己糊
 * @param {*} td 
 * @param {*} flag 
 * @param {*} mode 
 * @param {*} p 当前 p 数
 */
/*
%title%
%id% illust id
%tags% illust tags
%url% illust url
%author_name%
%author_url%
%p% currentpage / totalpage

%NSFW% NSFW alert
*/
function format(td, flag, mode = 'message', p) {
    let template = ''
    if (flag.single_caption) {
        mode = 'mediagroup_message'
    }
    if (flag.remove_caption) {
        return ''
    }
    if (flag.telegraph) {
        if (p == 0) {
            template = '%title% / %author_name%\n'
            template += '%url%'
            template += '%\n|tags%'
            mode = 'telegraph'
        }
    } else if (!flag.setting.format[mode]) {
        switch (mode) {
            case 'message':
            case 'inline':
                template = '%NSFW|#NSFW %[%title%](%url%)% / [%author_name%](%author_url%)% |p%'
                template += '%\n|tags%'
                break
            case 'mediagroup_message':
                template = '%[%mid% %title%% |p%%](%url%)%'
                template += '%\n|tags%'
                break
        }
    } else {
        template = flag.setting.format[mode]
    }
    if (template == '') {
        return ''
    } else {
        let splited_tamplate = template.replaceAll('\\%', '\uff69').split('%')  // 迫真转义 这个符号不会有人打出来把！！！
        let replace_list = [
            ['title', td.title],
            ['id', flag.show_id ? td.id : false],
            ['url', `https://pixiv.net/artworks/${td.id}`],
            ['NSFW', td.nsfw],
            ['author_id', td.author_id],
            ['author_url', `https://www.pixiv.net/users/${td.author_id}`],
            ['author_name', td.author_name]
        ]
        if (td) {
            if (td.original_urls && td.original_urls.length > 1 && p !== -1) {
                replace_list.push(['p', `${(p + 1)}/${td.original_urls.length}`])
            } else {
                replace_list.push(['p', ''])
            }
            if (flag.tags) {
                let tags = '#' + td.tags.join(' #')
                replace_list.push(['tags', tags.substr(0, tags.length - 1)])
            } else {
                replace_list.push(['tags', ''])
            }
        }
        // hmmm, I dont want handle %mid% in different function
        // So It's useless
        if (flag.single_caption) {
            if (!td) {
                replace_list.push(['mid', flag.mid])
            } else {
                replace_list.push(['mid', '%mid%'])
            }
        }
        splited_tamplate.forEach((r, id) => {
            replace_list.forEach(x => {
                if (x && r.includes(x[0])) {
                    splited_tamplate[id] = Treplace(mode, r, ...x)
                }
            })
        })
        template = splited_tamplate.join('').replaceAll('\uff69', '%')
    }
    return template
}

/**
 * MarkdownV2 转义
 * @param {String} t 
 */
function escape_strings(t) {
    ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'].forEach(x => {
        t = t.replaceAll(x, `\\${x}`)
    })
    return t
}
function Treplace(mode, r, name, value) {
    if (!r.includes(name))
        return r
    if (!value)
        return ''
    if (typeof value == 'boolean')
        value = ''
    return r.replaceAll('\\|', '\uffb4').split('|').map((l, id) => {
        if (l == name) {
            if (mode == 'telegraph') {
                return value
            }
            return escape_strings(value)
        } else if (l.includes('author_') || mode == 'telegraph') {
            return l
        } else {
            return escape_strings(l)
        }
    }).join('').replaceAll('\uffb4', '|')
}
function format_group(td, flag, mode = 'message', p, custom_template = false) {

}
module.exports = {
    format,
    format_group
}