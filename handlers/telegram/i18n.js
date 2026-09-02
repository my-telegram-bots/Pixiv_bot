import { escape_strings } from './format.js'
import en from '../../lang/en.js'
import ja from '../../lang/ja.js'
import zhHans from '../../lang/zh-hans.js'
import zhHant from '../../lang/zh-hant.js'

const raw = Object.freeze({
    en,
    ja,
    'zh-hans': zhHans,
    'zh-hant': zhHant
})
const l = Object.freeze(Object.fromEntries(
    Object.entries(raw).map(([language, messages]) => [
        language,
        Object.fromEntries(Object.entries(messages).map(([key, value]) => [
            key,
            escape_strings(value)
        ]))
    ])
))
/**
 * i18n
 * @param {*} lang 语言
 * @param {*} item 项目
 * @param  {...any} value 值
 */
export function _l(lang, item, ...value) {
    const message = l[lang]?.[item] ?? l.en[item]
    if (message === undefined) return item
    if (value.length === 0 || !message.includes('\\{\\}')) {
        return message
    }
    let result = message
    let count = message.match(/\\\{\\\}/g) || []
    count.forEach((x, id) => {
        result = result.replace(x, escape_strings(value[id]))
    })
    return result
}

export function _lr(lang, item, ...value) {
    if (!raw[lang] || !raw[lang][item]) lang = 'en'
    let result = raw[lang]?.[item] || item
    for (const replacement of value) result = result.replace('{}', String(replacement))
    return result
}
