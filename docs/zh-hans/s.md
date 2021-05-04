---
sidebar: false
editLink: false
title: 机器人设置
---
<template>
  <div id="setting">
    <h1>机器人设置</h1>
    <blockquote>在进行设置之前，确保您已经同意了 bot 的隐私策略。</blockquote>
    <div>
      <h2>回复消息设置</h2>
      <blockquote>
        在这里可以自定义机器人的返回消息格式
        <br>
        在这里请确保您的回复格式不会很长，太多了的话 bot 是发不出来的。
      </blockquote>
      <div id="template">
        <p style="text-align: center;">默认模板（点击应用）</p>
        <div class="cards">
          <div class="card container" @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% %p%\n%tags%'">
            <p>#NSFW <a href="">XX:Me</a> 1/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
          <div class="card container"
            @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% / id=|id% / [%author_name%](%author_url%) %p%\n%tags%'">
            <p>#NSFW <a href="">XX:Me</a> / id=67953985 / <a href="">rumikuu</a> 2/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
          <div class="card container"
            @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% / [%author_name%](%author_url%) %p%\n%tags%'">
            <p>#NSFW <a href="">XX:Me</a> / <a href="">rumikuu</a> 3/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
        </div>
        <p style="text-align: center;">当前效果</p>
        <div id="customtemplate">
          <div class="card" style="margin: auto;">
            <div style="text-align: center;">
              <img src="../img/67953985_p0.jpg">
            </div>
            <!--selfxss 警告 不过无所谓了 能干啥呢？-->
            <span class="container" v-html="format(current_template)"></span>
          </div>
          <div class="textareacard">
            <textarea v-model="current_template"></textarea>
          </div>
          <p>
            Telegram 的 Markdown 只支持以下这些：
            <br>
            ** __ []() ```
            <br>
            在自定义之前需要注意这些限制
            <br> 需要显示链接？
            <br>
            <code>[标题](链接)</code> 遵循 Markdown 格式即可。
            其它的可以按照默认模板的例子更改就行了
            <br>
            <br>
            这边均使用 %% 作为变量，其中变量前后都可以添加想要的文本进去使用 | 即可添加。
            <br>
            例子: <code>%链接:|url|?233%</code> -> 链接: https://www.pixiv.net/artworks/123?233
            <br>
            喜欢 | 的话，请在前面添加 | 来转义掉即可
            <br>
            <code>%链接:\||url|\|?233%</code> -> 链接:| https://www.pixiv.net/artworks/123|?233
            <br>
            目前已经有的变量有:
            <br>
            <code>%title%</code> 作品标题
            <br>
            <code>%id%</code> 作品 id
            <br>
            <code>%url%</code> 作品链接 https://www.pixiv.net/artworks/:id
            <br>
            <code>%tags%</code> 作品标签
            <br>
            <code>%NSFW%</code> 是否为 NSFW 作品
            <br>
            <code>%author_id%</code> 作者id
            <br>
            <code>%author_url%</code> 作者链接
            <br>
            <code>%author_name%</code> 作者名字
            <br>
            <code>%p%</code> 分p的时候显示当前第几p 格式为 当前p/总p数 1/2
          </p>
        </div>
      </div>
    </div>
    <!-- <div id="follow">
      <h2>关注推送设置</h2>
    </div>
    <div id="telegraph">
      <h2>telegraph 生成设置</h2>
    </div> -->
    <div id="save">
      <a target="_tshare" :href="'tg://msg_url?url=' + encodeURIComponent(raw_config)">保存更改</a>
      <p>为了匿名以及静态化页面，保存更改需要您复制命令给 bot，如果上面的按钮无法跳转至 telegram 并且发送消息给 Pixiv_bot 请手动复制以下文本粘贴至 bot</p>
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
      current_template: '%NSFW|#NSFW %[%title%](%url%)% %p%\n%tags%',
      raw_config: ''
    }),
    methods: {
      format(template = false) {
        return md.render(format({ "original_urls": [1, 2, 3, 4], "id": "67953985", "title": "XX:Me", "author_name": "rumikuu", "author_id": "3654183", "inline": [], "tags": ["DARLINGintheFRANXX", "ゼロツー", "ココロ", "ミク", "イクノ", "xx:me", "トリカゴ"], "nsfw": true }, {
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
        }, 'message', 3).replaceAll('\n', '  \n'))
      },
      save() {
        sessionStorage.s = encodeUnicode(JSON.stringify({
          format: {
            message: this.current_template,
            inline: this.current_template,
          }
        }))
        this.raw_config = sessionStorage.s
      }
    },
    watch: {
      current_template: function () {
        this.save()
      }
    },
    mounted() {
      let hash = location.hash.substr(1)
      if (sessionStorage.s) {
        hash = sessionStorage.s
      }else if (!hash || hash.length < 10) {
        this.save()
        return
      } 
      location.hash = '#'
      try {
        console.log(hash)
        let setting = {}
        if (setting = JSON.parse(decodeUnicode(hash))) {
          this.current_template = setting.format.message
          this.save()
        }
      } catch (error) {
      }
    }
  }

  function format(td, flag, mode = 'message', p) {
    console.log(JSON.stringify(td))
    let template = flag.setting.format[mode]
    if (td.original_urls && td.original_urls.length > 1 && p !== -1)
      template = template.replaceAll('%p%', `${(p + 1)}/${td.original_urls.length}`)
    else
      template = template.replaceAll('%p%', '')
    let tags = '#' + td.tags.join(' #')
    tags = tags.substr(0, tags.length - 1)
    let splited_tamplate = template.replaceAll('\\%', '\uff69').split('%')  // 迫真转义 这个符号不会有人打出来把！！！
    let replace_list = [
      ['tags', flag.tags ? tags : false],
      ['id', flag.c_show_id ? td.id : false],
      ['url', `https://pixiv.net/artworks/${td.id}`],
      ['author_url', `https://www.pixiv.net/users/${td.author_id}`],
      ['author_name', td.author_name],
      ['title', td.title],
      ['NSFW', td.nsfw]
    ]
    splited_tamplate.map((r, id) => {
      replace_list.forEach(x => {
        if (x && r.includes(x[0])) {
          splited_tamplate[id] = Treplace(r, ...x)
        }
      })
    })
    template = splited_tamplate.join('').replaceAll('\uff69', '%')
    let temp = template.match(/\[.*?\]/)
    if (temp)
      temp.map(r => {
        template = template.replace(r, re_escape_strings(r))
      })
    return template
  }

  /**
   * Markdown 转义
   * @param {String} t 
   */
  function escape_strings(t) {
    '[]()*_`~'.split('').forEach(x => {
      t = t.toString().replaceAll(x, `\\${x}`)
    })
    return t
  }
  /**
   * ta 又转义回来了
   * @param {} t 
   */
  function re_escape_strings(t) {
    '()*_`~'.split('').forEach(x => {
      t = t.toString().replaceAll('\\' + x, x)
    })
    return t
  }
  function Treplace(r, name, value) {
    if (!r.includes(name))
      return r
    if (!value)
      return ''
    if (typeof value == 'boolean')
      value = ''
    return r.replaceAll('\\|', '\uffb4').split('|').map(l => {
      if (l == name) {
        if (name == 'tags')
          return value
        return escape_strings(value)
      }
      return l
    }).join('').replaceAll('\uffb4', '|')
  }
  function decodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''))
  }
  function encodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
        return String.fromCharCode('0x' + p1);
      }));
  }
</script>

<style>
  .card {
    flex-grow: 1;
    flex-basis: 30%;
    max-width: 30%;
    box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
    transition: 0.3s;
    padding-top: 5px;
    cursor: pointer;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    align-content: stretch;
    justify-content: space-between;
  }

  .card:hover,
  #save a:hover {
    box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.2);
  }

  #template .card {
    min-height: 125px;
  }


  #customtemplate>.card {
    cursor: unset;
  }

  .textareacard {
    margin: auto;
    max-width: 550px;
  }

  .textareacard>textarea {
    width: 100%;
    min-height: 66px;
    max-width: 550px;
  }

  .container p,
  .container a {
    font-size: 13px;
    margin-top: 0;
    padding-left: 3px;
    padding-right: 3px;
  }

  #save {
    text-align: center;
  }

  #save>a {
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

  @media (max-width: 719px) {
    .cards {
      flex-direction: column
    }

    .card {
      max-width: 100%;
      margin-top: 20px;
    }

    .container {
      margin: auto;
      margin-top: 10px !important;
      min-height: 0px !important;
    }

    .textareacard>textarea {
      max-width: calc(100% - 5px);
    }
    #customtemplate img {
      width: 40%;
    }
  }

  @media (max-width: 419px) {
    .card {
      padding-left: 0.5rem;
      padding-right: 0.5rem
    }
  }
</style>