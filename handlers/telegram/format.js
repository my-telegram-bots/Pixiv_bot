/**
 * 格式化文字 好像并没有什么模板引擎 只好自己炒冷饭
 * @param {*} td 
 * @param {*} flag 
 * @param {*} mode 
 * @param {*} p 
 * @param {*} custom 
 */
/*
%title%
%tags:|tags%
%url%
%author_name%
%author_name%
%p% 分p
*/
function format(td, flag, mode = 'message', p, custom_template = false){
    let template = ''
    if(!custom_template){
        if(flag.telegraph){
            if(p == 0){
                template = '%title% / %author_name%\n'
                template += '%url%\n'
                template += '%tags%'
            }
        }else if(mode == 'message'){
            template = '%title% / [%author_name%](%author_url%) %p%\n'
            template += '%tags%\n'
            template += '%url%'
        }else if(mode == 'inline'){
            template = '%title% / [%author_name%](%author_url%) %p%\n'
            template += '%tags%\n'
        }
    }else{
        template = custom_template
    }
    if(!flag.tags)
        template = template.replace(/%tags%/,'')
    if(template !== '')
        template.match(/%.*%/g).forEach((r,id)=>{
            let rr = r.replace(/%/g,'')
            if(rr.includes('tags')){
                let tags = '#' + td.tags.join(' #')
                tags = escape_strings(tags.substr(0,tags.length - 1))
                if(rr != 'tags'){
                    if(rr != rr.replace('|tags',tags))
                        rr = rr.replace('|tags',tags)
                    else
                        rr = rr.replace('tags|',tags)
                }else{
                    rr = tags
                }
                template = template.replace(r,rr)
            }
        })
    if(td.original_urls && td.original_urls.length > 1 && p !== -1)
        template = template.replace(/%p%/g,`${(p + 1)}/${td.original_urls.length}`)
    else
        template = template.replace(/%p%/,'')
    let res = template.replace(/%title%/g,escape_strings(td.title))
    .replaceAll(/%url%/g,`https://pixiv.net/i/${td.id}`)
    .replace(/%author_name%/g,escape_strings(td.author_name))
    .replace(/%author_url%/g,`https://www.pixiv.net/users/${td.author_id}`)
    return res
}

/**
 * markdown 转义
 * @param {String} t 
 */
function escape_strings(t){
    '[]()_*`~'.split('').forEach(x=>{
        t = t.replaceAll(x,`\\${x}`)
    })
    return t
}
function format_group(td, flag, mode = 'message', p, custom_template = false){

}
module.exports = {
    format,
    format_group
}