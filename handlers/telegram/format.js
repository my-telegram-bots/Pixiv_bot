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
        if(mode == 'message'){
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
    template.match(/%.*%/g).forEach((r,id)=>{
        let rr = r.replace(/%/g,'')
        if(rr.includes('tags')){
            let tags = '#' + td.tags.join(' #')
            tags = tags.substr(0,tags.length - 1)
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
    return template.replace(/%title%/g,td.title)
    .replace(/%url%/g,`https://pixiv.net/i/${td.id}`)
    .replace(/%author_name%/g,td.author_name.replace(/\[/,'\\[').replace(/\]/,'\\]').replace(/_/,'\\_'))
    .replace(/%author_url%/g,`https://www.pixiv.net/users/${td.author_id}`)
}

function format_group(td, flag, mode = 'message', p, custom_template = false){

}
module.exports = {
    format,
    format_group
}