const db = require("../../db")
const r_p = require("./r_p")
/**
 * 获取每日/每周/每月排行榜 当然 会缓存啦
 * @param {int} 页数
 * @param {*} mode daily/weekly/monthly/
 * @param {*} filter_type 过滤类型 默认是 0 2
 * @param {*} date YYYY/MM/DD 默认为GMT+9的今天
 * 
 */
// 本来 date 写了一大坨 后面发现不带参数就是当天的
// 备用 new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0].replace(/-/g,'')
module.exports = async (page = 1, mode = 'daily', filter_type = [0, 2], date = false) => {
    if(page == 0)
        page = 1
    if (['daily', 'weekly', 'monthly'].indexOf(mode) == -1)
        return false
    let params = {
        mode: mode,
        format: 'json',
        p: page
    }
    if (date) params.date = date
    // GMT+0 9 * 60 * 60 - 86400 = 日本前一天时间
    date = date ? date : new Date(new Date().getTime() - 54000000).toISOString().split("T")[0].replace(/-/g, "")
    let col = await db.collection("ranking")
    let data = await col.findOne({
        id: mode + date + '_' + page
    })
    if(!data){
        data = (await r_p({
            baseURL: "https://www.pixiv.net/ranking.php",
            params: params
        })).data
        try {
            col.insertOne({
                id: data.mode + data.date + '_' + page,
                ...data,
            })
        } catch (error) {
            console.warn('insert error',error)
        }
    }
    return {
        data: data.contents.filter((p) => {
            return filter_type.indexOf(parseInt(p.illust_type)) > -1
        }).map((p) => {
            return {
                id: p.illust_id,
                title: p.title,
                ourl: p.url.replace("/c/240x480/img-master/", "/img-original/").replace("_master1200", ""),
                murl: p.url.replace("/c/240x480/img-master/", "/img-master/"),
                width: p.width,
                height: p.height,
                tags: p.tags
            }
        }),
        date: data.date,
        next_page: data.next
    }
}