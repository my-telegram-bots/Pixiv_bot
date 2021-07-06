const common = require('./common')
const handle_illust = require('./telegram/handle_illust')
const handle_ranking = require('./telegram/handle_ranking')
const get_value = require('./telegram/get_value')
const pixiv_tools = require('./pixiv/tools')
const user = require('./pixiv/user')
const keyboards = require('./telegram/keyboard')
const { _l } = require('./telegram/i18n')
const format = require('./telegram/format')
const mediagroup = require('./telegram/mediagroup')
const telegraph = require('./telegram/telegraph')
const { handle_novel } = require('./telegram/handle_novel')
module.exports = {
    ...handle_illust,
    handle_ranking,
    handle_novel,
    ...get_value,
    ...pixiv_tools,
    ...keyboards,
    ...common,
    ...user,
    _l,
    ...format,
    ...mediagroup,
    ...telegraph
}