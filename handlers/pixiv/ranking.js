import db from '../../db.js'
import { honsole } from '../common.js'
import { r_p_ajax } from './request.js'
/**
 * 获取每日/每周/每月排行榜 当然 会缓存啦
 * @param {int} 页数
 * @param {*} mode daily/weekly/monthly/
 * @param {*} filter_type 过滤类型 默认是 0 2
 * @param {*} date YYYY/MM/DD 默认为GMT+9的今天
 *
 */
// 本来 date 写了一大坨 后面发现不带参数就是当天的
// 这里默认会过滤 illust_type == 1 （manga） 的结果，
export async function ranking(page = 1, mode = 'daily', date = false, filter_type = [0, 2]) {
    if (page <= 0)
        page = 1
    if (!['daily', 'weekly', 'monthly'].includes(mode))
        return false
    let params = {
        mode: mode,
        format: 'json',
        p: page
    }
    if (date) {
        params.date = date
    }
    // GMT+0 9 * 60 * 60 - 86400  = 日本前一天时间 - 8 * 60 * 60 (8点更新)
    // 目前我觉得 pixiv 日榜是 GMT+9 08:00 AM 更新的 等我早起或者挂监控脚本才知道了（（
    date = date ? date : new Date(new Date().getTime() - 82800000).toISOString().split("T")[0].replace(/-/g, "")
    let col = db.collection.ranking
    let data = await col.findOne({
        id: mode + date + '_' + page
    })
    if (!data) {
        data = (await r_p_ajax({
            baseURL: "https://www.pixiv.net/ranking.php",
            params: params
        })).data
        try {
            col.insertOne({
                id: data.mode + data.date + '_' + page,
                ...data,
            })
        }
        catch (error) {
            honsole.dev('insert error', error)
        }
    }
    return {
        data: data.contents.filter((p) => {
            return filter_type.indexOf(parseInt(p.illust_type)) > -1
        }).map((p) => {
            p.url = p.url.replace('https://i.pximg.net/', 'https://i-cf.pximg.net/')
            return {
                id: p.illust_id,
                title: p.title,
                ourl: p.url.replace("/c/240x480/img-master/", "/img-original/").replace("_master1200", ""),
                murl: p.url.replace("/c/240x480/img-master/", "/img-master/"),
                turl: p.url,
                original_urls: [p.url.replace("/c/240x480/img-master/", "/img-original/").replace("_master1200", "")],
                width: p.width,
                height: p.height,
                tags: p.tags,
                author_name: p.user_name,
                author_id: p.user_id
            }
        }),
        date: data.date,
        next_page: data.next
    }
}
export default ranking
