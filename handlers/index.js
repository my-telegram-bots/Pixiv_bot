const common = require('./common')
const handle_illust = require('./telegram/handle_illust')
const handle_ranking = require('./telegram/handle_ranking')
const pixiv_tools = require('./pixiv/tools')
const user = require('./pixiv/user')
const keyboards = require('./telegram/keyboard')
const i18n  = require('./telegram/i18n')
const format = require('./telegram/format')
const mediagroup = require('./telegram/mediagroup')
const telegraph = require('./telegram/telegraph')
const handle_novel = require('./telegram/handle_novel')
const pre_handle = require('./telegram/pre_handle')
module.exports = {
    ...handle_illust,
    ...handle_ranking,
    ...handle_novel,
    ...pixiv_tools,
    ...keyboards,
    ...common,
    ...user,
    ...i18n,
    ...format,
    ...mediagroup,
    ...telegraph,
    ...pre_handle
}