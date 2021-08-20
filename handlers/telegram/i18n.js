const fs = require('fs')
const { escape_strings } = require('./format')
const l = {}
fs.readdirSync('./lang/').map(filename => {
    if (filename.includes('.js')) {
        let ll = require('../../lang/' + filename)
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
function _l(lang, item, ...value) {
    if (!l[lang] || !l[lang][item]) {
        lang = 'en'
    }
    if (!l[lang][item].includes('\\{\\}')) {
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
module.exports = {
    _l
}