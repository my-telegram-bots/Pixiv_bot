import df from './df.js'
import { JSDOM } from 'jsdom'
import removeMd from 'remove-markdown'

const escape_string_list = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
/**
 * 格式化文字 重构的模版引擎
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
%AI% AI alert
%description% description
*/
export function format(td, flag, mode = 'message', p, mid) {
    if (!['message', 'inline', 'mediagroup_message', 'telegraph'].includes(mode)) {
        throw 'invalid format mode'
    }
    if (flag.setting?.format?.version === 'v1') {
        return format_v1(td, flag, mode, p, mid)
    } else {
        return format_v2(td, flag, mode, p, mid)
    }
}

export function format_v1(td, flag, mode = 'message', p, mid) {
    let template = ''
    if (flag.remove_caption) {
        return ''
    }
    if (flag.telegraph) {
        if (p == 0) {
            template = df.format.telegraph
            mode = 'telegraph'
        }
    } else if (!flag.setting.format[mode]) {
        template = df.format[mode]
        if (!template) {
            template = df.format.message
        }
    } else {
        template = flag.setting.format[mode]
    }

    if (template == '') {
        return ''
    } else {
        let splited_template = template.replaceAll('\\%', '\uff69').split('%') // 迫真转义 这个符号不会有人打出来把！！！
        let replace_list = [
            ['title', td.title.trim()],
            ['id', flag.show_id ? td.id : false],
            ['url', `https://www.pixiv.net/artworks/${td.id}`],
            ['NSFW', td.nsfw],
            ['AI', td.ai],
            ['author_id', td.author_id],
            ['author_url', `https://www.pixiv.net/users/${td.author_id}`],
            ['author_name', td.author_name.trim()]
        ]
        if (td) {
            if (td.imgs_ && td.imgs_.size && td.imgs_.size.length > 1 && p !== -1) {
                replace_list.push(['p', `${(p + 1)}/${td.imgs_.size.length}`])
            } else {
                replace_list.push(['p', ''])
            }
            if (flag.description && td.description.trim()) {
                replace_list.description = new JSDOM(`<body>${td.description.replaceAll('<br />', '\n')}</body>`).window.document.body.textContent
            }
            if (flag.tags && td.tags && td.tags.length > 0) {
                let tags = '#' + td.tags.join(' #')
                replace_list.push(['tags', tags])
            } else {
                replace_list.push(['tags', ''])
            }
        }
        if (flag.single_caption) {
            replace_list.push(['mid', mid])
        }
        splited_template.forEach((r, id) => {
            replace_list.forEach(x => {
                if (x && r.includes(x[0])) {
                    if (r == x[0] || r.includes('|')) {
                        splited_template[id] = Treplace(mode, r, ...x)
                    }
                }
            })
            // if(splited_template[id] === r){
            //     splited_template[id] = escape_strings(r)
            // }
        })
        template = splited_template.join('').replaceAll('\uff69', '%')
    }
    // 临时修复，最后格式还是要完全换掉的。
    // description: "Bad Request: can't parse entities: Character '(' is reserved and must be escaped with the preceding '\\'"
    //                      tks https://stackoverflow.com/questions/37462126/regex-match-markdown-link
    let link_list = template.match(/(?:__|[*#])|\[(.*?)\]\(.*?\)/g)
    if (link_list) {
        link_list.forEach(x => {
            if (x.includes('\\')) {
                // tks https://davidwells.io/snippets/regex-match-markdown-links
                let xx = x.match(/\[([^\[]+)\]\((.*)\)/)
                if (xx) {
                    template = template.replace(xx[1], escape_strings(reescape_strings(xx[1]).replaceAll('\\', '\\\\')))
                }
            }
        })
    }
    return template.trim()
}

export function format_v2(td, flag, mode = 'message', p, mid) {
    let template = ''
    let result = ''
    let replace_list = {}
    if (flag.remove_caption) {
        return ''
    }
    // match template
    if (flag.telegraph) {
        if (p == 0) {
            template = df.format.telegraph
            mode = 'telegraph'
        }
    } else if (!flag.setting.format[mode]) {
        template = df.format[mode]
        if (!template) {
            template = df.format.message
        }
    } else {
        template = flag.setting.format[mode]
    }
    if (!template || !td) {
        return ''
    } else {
        template = template.replaceAll('\\|', '\uff69')
        replace_list = {
            title: td.title.trim(),
            url: `https://www.pixiv.net/artworks/${td.id}`,
            NSFW: td.nsfw,
            AI: td.ai,
            author_id: td.author_id,
            author_url: `https://www.pixiv.net/users/${td.author_id}`,
            author_name: td.author_name.trim()
        }

        if (flag.show_id) {
            replace_list.id = td.id
        }

        if (flag.description && td.description && td.description?.trim()) {
            const description = new JSDOM(`<body>${td.description.replaceAll('<br />', '\n')}</body>`).window.document.body.textContent
            if (flag.text_length) {
                const description_overflow_length = flag.text_length - 4096 + 7
                //                             emoji
                const description_max_length = description.length - description_overflow_length
                let description_new = description.substring(0, description_max_length)
                let description_lastIndex = description_new.lastIndexOf('\n')
                replace_list.description = description_new.substring(0, description_lastIndex === -1 ? description_max_length : description_lastIndex) + '\n......'
            } else {
                replace_list.description = description
            }
        }

        if (td.imgs_ && td.imgs_.size && td.imgs_.size.length > 1 && p !== -1) {
            replace_list.p = `${(p + 1)}/${td.imgs_.size.length}`
        }
        if (flag.tags && td.tags && td.tags.length > 0) {
            replace_list.tags = '#' + td.tags.join(' #')
        }

        if (flag.single_caption) {
            replace_list.mid = mid
        }
    }

    let i = 0
    const len = template.length
    const key_list = Object.keys(replace_list)
    while (i < len) {
        const percent_index = template.indexOf('%', i)

        if (percent_index === -1) {
            result += template.substring(i)
            break
        }
        result += template.substring(i, percent_index)

        const endpercent_index = template.indexOf('%', percent_index + 1)

        if (endpercent_index === -1) {
            result += '%'
            i = percent_index + 1
            continue
        }

        let replacement = ''
        const s = template.substring(percent_index + 1, endpercent_index).split('|')

        let prefix = ''
        let key = ''
        let suffix = ''
        if (key_list.includes(s[0])) {
            key = s[0]
            if (s[1]) {
                suffix = s[1]
            }
        } else if (key_list.includes(s[1])) {
            prefix = s[0]
            key = s[1]
            if (s[2]) {
                suffix = s[2]
            }
        } else {
            i = endpercent_index + 1
            continue
        }
        let dataValue = replace_list[key]
        if (typeof dataValue === 'boolean') {
            if (dataValue) {
                replacement = prefix + suffix
            }
        } else if (dataValue !== undefined) {
            // const md_style = [
            //     ['*', '*'],
            //     ['__', '__'],
            //     ['_', '_'],
            //     ['~', '~'],
            //     ['||', '||'],
            //     ['```\n', '```\n']
            // ]
            if (prefix.endsWith('\n>')) {
                replacement = prefix + escape_markdownV2(dataValue).split('\n').map((line, i) => (i === 0 ? '' : '>') + line).join('\n') + suffix
            } else {
                replacement = prefix + escape_markdownV2(dataValue) + suffix
            }
        }
        result += replacement
        i = endpercent_index + 1
    }
    result = result.replaceAll('\uff69', '\\|')
    const result_len = removeMd(result).length
    if (result_len > 4096) {
        return format_v2(td, {
            ...flag,
            text_length: result_len
        }, mode, p, mid)
    } else {
        return result
    }
}

/**
 * MarkdownV2 转义
 * @param {String} t
 */
export function escape_strings(t) {
    // need typescript
    if (typeof t !== 'string') {
        if (!t) return ''
        t = String(t)
    }
    escape_string_list.forEach(x => {
        t = t.replaceAll(x, `\\${x}`)
    })
    return t
}
export function reescape_strings(t) {
    if (typeof t !== 'string') {
        if (!t) return ''
        t = String(t)
    }
    escape_string_list.forEach(x => {
        t = t.replaceAll(`\\${x}`, x)
    })
    return t
}
export function Treplace(mode, r, name, value) {
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
function escape_markdownV2(str) {
    if (typeof str !== 'string') {
        if (!str) return ''
        str = String(str)
    }
    const markdown_escape_regex = /([_*\[\]()~`>#+\-=|{}.!])/g
    return str.replace(markdown_escape_regex, '\\$1')
}
