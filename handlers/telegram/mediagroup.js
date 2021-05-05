const { format } = require("./format")
const {ugoiraurl} = require('../../config.json').pixiv
function mg_create(td,flag){
    let mediagroup_o = mediagroup_r  = []
    if(process.env.dev){
        console.log(td,'mg_create')
    }
    if(td){
        td.size.forEach((size, pid) => {
            let mediagroup_data = {
                type: 'photo',
                caption: format(td,flag,'message',pid),
                parse_mode: 'Markdown'
            }
            // mg2telegraph 还需要作品的 id
            if(flag.telegraph){
                mediagroup_data.id = td.id
                mediagroup_data.q_id = flag.q_id
            }
            if(td.type <= 1){
                mediagroup_o[pid] = {
                    ...mediagroup_data,
                    media: td.original_urls[pid],
                }
                mediagroup_r[pid] = {
                    ...mediagroup_data,
                    media: td.regular_urls[pid]
                }
            }else if(td.type == 2){
                mediagroup_o[pid] = mediagroup_r[pid] = {
                    ...mediagroup_data,
                    type: 'video',
                    media: ugoiraurl + td.id + '.mp4'
                }
            }
        })
    }
    return {
        mediagroup_o,
        mediagroup_r
    }
}
function mg_albumize(mg){
    // 10个一组
    let t = []
    mg.forEach((m,pid) => {  
        let gid = Math.floor(pid / 10)
        if(!t[gid])
            t[gid] = []
        t[gid][pid % 10] = m
    })
    return t
}
module.exports = {
    mg_create,
    mg_albumize
}
