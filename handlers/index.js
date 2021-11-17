import * as common from './common.js'
import * as handle_illust from './telegram/handle_illust.js'
import * as handle_ranking from './telegram/handle_ranking.js'
import * as pixiv_tools from './pixiv/tools.js'
import * as user from './pixiv/user.js'
import * as keyboards from './telegram/keyboard.js'
import * as i18n from './telegram/i18n.js'
import * as format from './telegram/format.js'
import * as mediagroup from './telegram/mediagroup.js'
import * as telegraph from './telegram/telegraph.js'
import * as handle_novel from './telegram/handle_novel.js'
import * as pre_handle from './telegram/pre_handle.js'
import * as tg_user from './telegram/user.js'
export default {
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
    ...pre_handle,
    ...tg_user
}
