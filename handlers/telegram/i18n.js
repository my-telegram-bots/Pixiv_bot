const fs = require('fs')
const { escape_strings } = require('./format')
const l = {}
fs.readdirSync('./lang/').map(file_name => {
    if (file_name.includes('.js')){
        let ll = require('../../lang/' + file_name)
        for (const v in ll) {
            ll[v] = escape_strings(ll[v])
        }
        l[file_name.replace('.js', '')] = ll
    }
})
/**
 * i18n
 * @param {*} lang 语言
 * @param {*} item 项目
 * @param  {...any} value 值
 */
function _l(lang, item, ...value) {
    if (!l[lang] || !l[lang][item])
        lang = 'en'
    if (!item) {
        return lang
    }
    if (!l[lang][item].includes('\\{\\}'))
        return l[lang][item]
    let splite_text = l[lang][item].split('\\{\\}')
    return splite_text.map((x, id) => {
        if (id == splite_text.length - 1){
            return x
        }
        if (x){
            return x += escape_strings(value[id])
        }
    }).join('')
}
module.exports = {
    _l
}