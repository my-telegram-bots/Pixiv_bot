import fs from 'fs'
import { escape_strings } from './format.js'
const l = {}
fs.readdirSync('./lang/').map(filename => {
    if (filename.includes('.js')) {
        let ll = import('../../lang/' + filename)
        for (const v in ll) {            
            ll[v] = escape_strings(ll[v])
        }
        l[filename.replace('.js', '')] = ll
    }
})
/**
 * i18n
 * @param {*} lang 语言
 * @param {*} item 项目
 * @param  {...any} value 值
 */
 export function _l(lang, item, ...value) {
    if (!l[lang] || !l[lang][item]) {
        lang = 'en'
    }
    if (value.length === 0 || !l[lang][item].includes('\\{\\}')) {
        return l[lang][item]
    }
    let result = l[lang][item]
    let count = l[lang][item].match(/\\\{\\\}/g) || []
    count.forEach((x, id) => {
        console.log(id, value[id])
        result = result.replace(x, escape_strings(value[id]))
    })
    return result
}
