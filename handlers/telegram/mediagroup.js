const { format } = require("./format")
function mg_create(td,flag){
    let mediagroup_o = mediagroup_r  = []
    if(td && td.original_urls)
        td.size.forEach((size, pid) => {
            let mediagroup_data = {
                type: 'photo',
                media: td.original_urls[pid],
                caption: format(td,flag,'message',pid),
                parse_mode: 'Markdown',
                type: 'photo'
            }
            // mg2telegraph 还需要作品的 id
            if(flag.telegraph){
                mediagroup_data.id = td.id
                mediagroup_data.q_id = flag.q_id
            }
            mediagroup_o[pid] = mediagroup_data
            mediagroup_r[pid] = {
                ...mediagroup_data,
                media: td.regular_urls[pid]
            }
        })
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
