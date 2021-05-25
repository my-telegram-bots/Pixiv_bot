const {asyncForEach, download_file} = require('./common')
const handle_illust = require('./telegram/handle_illust')
const handle_ranking = require('./telegram/handle_ranking')
const get_pixiv_ids = require('./telegram/get_pixiv_ids')
const ugoira_to_mp4 = require('./pixiv/ugoira_to_mp4')
const keyboards = require('./telegram/keyboard')
const {_l} = require('./telegram/i18n')
const format = require('./telegram/format')
const mediagroup = require('./telegram/mediagroup')
const { mg2telegraph } = require('./telegram/telegraph')
module.exports = {
    handle_illust,
    handle_ranking,    
    get_pixiv_ids,
    ugoira_to_mp4,
    ...keyboards,
    asyncForEach,
    download_file,
    _l,
    ...format,
    ...mediagroup,
    mg2telegraph
}