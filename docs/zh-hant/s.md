---
sidebar: false
editLink: false
title: 機器人設置
---
<template>
  <div id="setting">
    <h1>機器人設置</h1>
    <blockquote>在進行設置之前，確保您已經同意了 bot 的隱私策略。</blockquote>
    <div>
      <h2>回覆消息設置</h2>
      <blockquote>
        在這裡可以自訂機器人的返回消息格式
        <br>
        在這裡請確保您的回覆格式不會超過 10位元組，太多了的話 bot 是發不出來的。
      </blockquote>
      <div id="officialtemplate">
        <div class="cards">
          <div class="card container" @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% %p%\n%tags%'">
            <p>#NSFW <a href="">XX:Me</a> 1/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
          <div class="card container"
            @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% / [%author_name%](%author_url%) %p%\n%tags%'">
            <p>#NSFW <a href="">XX:Me</a> / <a
                href="">rumikuu</a> 2/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
          <div class="card container"
            @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% / id=|id% / [%author_name%](%author_url%) %p%\n%tags%'">
            <p>#NSFW <a href="">XX:Me</a> / id=67953985 / <a
                href="">rumikuu</a> 3/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
        </div>
        <h3 style="text-align: center;">當前效果</h3>
        <div id="customtemplate">
          <div class="card" style="margin: auto;">
            <img src="../img/67953985_p0.jpg" style="width:100%">
            <!--selfxss 警告 不過無所謂了 能幹什麼呢？-->
            <span class="container" v-html="format(current_template)"></span>
          </div>
          <div class="card textareacard">
            <textarea v-model="current_template"></textarea>
          </div>
          <p>
            Telegram 的 Markdown 只支持以下這些：
            <br>
            ** __ []() ```
            <br>
            在自訂之前需要注意這些限制
            <br> 需要顯示連結？
            <br>
            <code>[標題](連結)</code> 遵循 Markdown 格式即可。
            其它的可以按照默認模板的例子更改就行了
            <br>
            <br>
            這邊均使用 %% 作為變數，其中變數前後都可以添加想要的文本進去使用 | 即可添加。
            <br>
            例子: <code>%連結:|url|?233%</code> -> 連結: https://www.pixiv.net/artworks/123?233
            <br>
            喜歡 | 的話，請在前面添加 | 來轉義掉即可
            <br>
            <code>%連結:\||url|\|?233%</code> -> 連結:| https://www.pixiv.net/artworks/123|?233
            <br>
            目前已經有的變數有:
            <br>
            <code>%title%</code> 作品標題
            <br>
            <code>%id%</code> 作品 id
            <br>
            <code>%url%</code> 作品連結 https://www.pixiv.net/artworks/:id
            <br>
            <code>%tags%</code> 作品標籤
            <br>
            <code>%NSFW%</code> 是否為 NSFW 作品
            <br>
            <code>%author_id%</code> 作者id
            <br>
            <code>%author_url%</code> 作者連結
            <br>
            <code>%author_name%</code> 作者名字
            <br>
            <code>%p%</code> 分p的時候顯示當前第幾p 格式為 當前p/總p數 1/2
          </p>
        </div>
      </div>
    </div>
    <!-- <div id="follow">
      <h2>關注推送設置</h2>
    </div>
    <div id="telegraph">
      <h2>telegraph 生成設置</h2>
    </div> -->
    <div id="save">
      <a target="_tshare" :href="'https://t.me/share?url=' + encodeURIComponent(raw_config)">保存更改</a>
      <p>為了匿名以及靜態化頁面，保存更改需要您複製命令給 bot，如果上面的按鈕無法跳轉至 telegram 並且發送消息給 Pixiv_bot 請手動黏貼以下文本至 bot</p>
      <div class="card textareacard">
        <textarea v-model="raw_config" readonly style="resize: none;"></textarea>
      </div>
    </div>
  </div>
</template>


<script>
let MarkdownIt = require('markdown-it')
let md = new MarkdownIt()
export default {
  data: () => ({
    current_template: '1',
    raw_config: ''
  }),
  methods: {
    format(template = false) {
      return md.render(format({"original_urls":[1,2,3,4],"id":"67953985","title":"XX:Me","author_name":"rumikuu","author_id":"3654183","inline":[],"tags":["DARLINGintheFRANXX","ゼロツー","ココロ","ミク","イクノ","xx:me","トリカゴ"],"nsfw":true},{
        remove_caption: false,
        telegraph: false,
        tags: true,
        c_show_id: true,
        setting: {
          format: {
            message: template,
            inline: template
          }
        }
      },'message',3).replaceAll('\n','  \n'))
    },
    save() {
      this.raw_config = window.btoa(JSON.stringify({
        format: {
          message: this.current_template,
          inline: this.current_template,
        }
      }))
    }
  },
  watch: {
    current_template: function(){
      this.save()
    }
  },
  mounted(){
    let hash = location.hash.substr(1)
    //location.hash = ''
    try {
      console.log(hash)
      let setting = {}
      if(setting = JSON.parse(window.atob(hash))){
        this.current_template = setting.format.message
        this.save()
      }
    } catch (error) {
      alert(error)
    }
  }
}

function format(td, flag, mode = 'message', p){
    console.log(JSON.stringify(td))
    let template = flag.setting.format[mode]
    if(td.original_urls && td.original_urls.length > 1 && p !== -1)
        template = template.replaceAll('%p%',`${(p + 1)}/${td.original_urls.length}`)
    else
        template = template.replaceAll('%p%','')
    let tags = '#' + td.tags.join(' #')
    tags = tags.substr(0,tags.length - 1)
    let splited_tamplate = template.replaceAll('\\%','\uff69').split('%')  // 迫真转义 这个符号不会有人打出来把！！！
    let replace_list = [
        ['tags',flag.tags ? tags : false],
        ['id',flag.c_show_id ? td.id : false],
        ['url',`https://pixiv.net/artworks/${td.id}`],
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
    let temp = template.match(/\[.*?\]/)
    if(temp)
        temp.map(r=>{
            template = template.replace(r,re_escape_strings(r))
        })
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
</script>

<style>
.card {
  flex-grow: 1;
  flex-basis: 30%;
  max-width: 30%;
  box-shadow: 0 4px 8px 0 rgba(0,0,0,0.2);
  transition: 0.3s;
  padding-top: 5px;
  cursor: pointer;
}
.cards {
  border-top: 1px solid #eaecef;
  padding: 1.2rem 0;
  margin-top: 2.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  align-content: stretch;
  justify-content: space-between;
}

.card:hover, #save a:hover {
  box-shadow: 0 8px 16px 0 rgba(0,0,0,0.2);
}

@media (max-width: 719px) {
    .cards {
        flex-direction:column
    }

    .card {
        max-width: 100%;
        padding: 0 1.5rem
    }
    /* #officialtemplate img {
      display: none;
    } */
    .textareacard {
      min-width: 100%;
    }
}

@media (max-width: 419px) {
    .card {
        padding-left: 0.5rem;
        padding-right: 0.5rem
    }
}
#officialtemplate .card {
  min-height: 80px;
}
.textareacard {
  max-width: 550px;
  margin: auto;
}
#customtemplate > .card{
  cursor: unset;
}

.textareacard > textarea {
  width: 100%;
  min-height: 66px;
}
.container p, .container a{
  font-size: 13px;
  margin-top: 0;
  padding-left: 3px;
  padding-right: 3px;
}
#save {
  text-align:center;
}
#save > a {
  display: inline-block;
  font-size: 1.2rem;
  color: #fff;
  background-color: #ff69b4;
  padding: .8rem 1.6rem;
  border-radius: 4px;
  box-sizing: border-box;
  border-bottom: 1px solid #ff69b4;
  text-decoration: none;
  cursor: pointer;
  margin-top: 40px;
  transition: 0.3s;
}
</style>