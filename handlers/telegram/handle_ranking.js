import ranking from '../pixiv/ranking.js'
import { format } from './format.js'
import { k_os } from './keyboard.js'
import { buildRankingInlineResult } from './illustration-inline-result.js'
// 作为 ../pixiv/ranking 的 tg 封装
export async function handle_ranking([...rank], flag) {
    let data = await ranking(...rank)
    if (!data)
        return false
    const inline = data.data
        .map(td => buildRankingInlineResult(td, flag, { format, keyboard: k_os }))
        .filter(Boolean)
    return {
        data: inline,
        next_offset: data.next_page
    }
}
