/**
 * 格式化文字 好像并没有什么模板引擎 只好自己炒冷饭
 * @param {*} td 
 * @param {*} flag 
 * @param {*} mode 
 * @param {*} p 当前 p 数
 * @param {*} custom_template
 */
/*
%title%
%tags:|tags%
%url%
%author_name%
%author_url%
%p% 分p
%illust_id% illust_id
%NSFW% NSFW alert
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
            template = '%NSFW|#NSFW %[%title%](%url%)% / id=|illust_id% / [%author_name%](%author_url%) %p%\n'
            template += '%tags%'
        }else if(mode == 'inline'){
            template = '%NSFW|#NSFW %[%title%](%url%) % / id=|illust_id% / [%author_name%](%author_url%) %p%\n'
            template += '%tags%'
        }
    }else{
        template = custom_template
    }
    if(template == ''){
        return ''
    }else{
        if(td.original_urls && td.original_urls.length > 1 && p !== -1)
            template = template.replaceAll('%p%',`${(p + 1)}/${td.original_urls.length}`)
        else
            template = template.replaceAll('%p%','')
        let tags = '#' + td.tags.join(' #')
        tags = tags.substr(0,tags.length - 1)
        let splited_tamplate = template.replaceAll('\\%','\uff69').split('%')  // 迫真转义 这个符号不会有人打出来把！！！
        let replace_list = [
            ['tags',flag.tags ? tags : false],
            ['illust_id',flag.c_show_id ? td.id : false],
            ['url',`https://pixiv.net/i/${td.id}`],
            ['author_url',`https://www.pixiv.net/users/${td.author_id}`],
            ['author_name',td.author_name],
            ['title',td.title],
            ['NSFW',td.nsfw]
        ]
        splited_tamplate.map((r,id)=>{
            replace_list.forEach(x=>{
                if(x && r.includes(x[0])){
                    splited_tamplate[id] = Treplace(r,...x)
                }
            })
        })
        template = splited_tamplate.join('').replaceAll('\uff69','%')
        template.match(/\[.*?\]/).map(r=>{
            template = template.replace(r,re_escape_strings(r))
        })

    }
    return template
}

/**
 * Markdown 转义
 * @param {String} t 
 */
function escape_strings(t){
    '[]()*_`~'.split('').forEach(x=>{
        t = t.toString().replaceAll(x,`\\${x}`)
    })
    return t
}
/**
 * ta 又转义回来了
 * @param {} t 
 */
function re_escape_strings(t){
    '()*_`~'.split('').forEach(x=>{
        t = t.toString().replaceAll('\\' + x,x)
    })
    return t
}
function Treplace(r,name,value){
    if(!r.includes(name))
        return r
    if(!value)
        return ''
    if(typeof value == 'boolean')
        value = ''
    return r.replaceAll('\\|','\uffb4').split('|').map(l=>{
        if(l == name){
            if(name == 'tags')
                return value
            return escape_strings(value)
        }
        return l
    }).join('').replaceAll('\uffb4','|')
}
function format_group(td, flag, mode = 'message', p, custom_template = false){

}
module.exports = {
    format,
    format_group
}