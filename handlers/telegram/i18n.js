const fs = require('fs')
const l = {}
fs.readdirSync('./lang/').map(file_name => {
    if(file_name.includes('.js'))
        l[file_name.replace('.js', '')] = require('../../lang/' + file_name)
})
/**
 * i18n
 * @param {*} lang 语言
 * @param {*} item 项目
 * @param  {...any} value 值
 */
function _l(lang,item,...value){
    if(!l[lang] || !l[lang][item])
        lang = 'en'
    if(!item){
        return lang
    }
    if(!l[lang][item].includes('{}'))
        return l[lang][item]
    let splite_text = l[lang][item].split('{}')
    return splite_text.map((x,id)=>{
        if(id == splite_text.length - 1)
            return x
        if(x)
            return x += value[id]
    }).join('')
}
module.exports = {
    _l
}