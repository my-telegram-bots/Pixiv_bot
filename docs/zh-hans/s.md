---
sidebar: false
editLink: false
title: 机器人配置
---

<template>
  <div id="setting">
    <h1>机器人配置</h1>
    <div class="custom-block alert warning" v-if="alert == 1">
      <p class="custom-block-title">无配置载入！</p>
      <p>建议通过 bot 的 <code>/s</code> 命令来打开本页面</p>
    </div>
    <div class="custom-block danger" v-else-if="alert == 2">
      <p class="custom-block-title">您的配置文件可能不是最新的（生成时间为 {{ new Date(bot_confiuration_time).toString().split(' (')[0] }})
      </p>
      <p>请给 bot 发送 <code>/s</code> 命令打开本配置页面。</p>
    </div>
    <blockquote>在进行配置之前，请先同意 bot 的隐私策略。</blockquote>
    <div id="format">
      <h2>消息格式配置</h2>
      <blockquote>
        在这里可以自定义机器人的返回消息格式
        <br>
        在这里请确保您自定义的文本格式不会太长，太长的消息将无法发送。
      </blockquote>
      <div id="template">
        <p style="text-align: center;">默认模板（点击应用）</p>
        <div class="cards">
          <div class="card container" @click="current_template = '%NSFW|#NSFW %title% #pixiv [%url%](%url%) %p%%\n|tags%'">
            <p>#NSFW XX:Me <a>#pixiv</a> <a>https://pixiv.net/artworks/...</a> 1/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
          <div class="card container"
            @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% / id=|id% / [%author_name%](%author_url%) %p%%\n|tags%'">
            <p>#NSFW <a>XX:Me</a> / id=67953985 / <a>rumikuu</a> 2/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
          <div class="card container"
            @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% / [%author_name%](%author_url%) %p%%\n|tags%'">
            <p>#NSFW <a>XX:Me</a> / <a>rumikuu</a> 3/4<br>
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
            <!-- selfxss 警告 不过无所谓了 攻击者能偷到什么东西呢？-->
            <!-- self xss warning -->
            <span class="container" v-html="format(current_template)"></span>
          </div>
          <div class="textareacard">
            <textarea v-model="current_template"></textarea>
          </div>
          <details class="custom-block details">
            <summary>格式帮助</summary>
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
              <br>
              对于 +sc 模式，bot还有个 <code>%sid%</code> 选项
            </p>
          </details>
        </div>
      </div>
    </div>
    <div id="save" v-if="raw_config !== ''">
      <a target="_tshare" :href="'tg://msg_url?url=' + encodeURIComponent(raw_config)">保存更改</a>
      <p>为了匿名以及静态化页面，保存更改需要您复制命令给 bot，如果上面的按钮无法跳转至 Telegram 并且发送消息给 Pixiv_bot 请手动复制以下文本粘贴至 bot</p>
      <div class="textareacard">
        <textarea v-model="raw_config" readonly style="resize: none;"></textarea>
      </div>
    </div>
  </div>
</template>

<script>
  let md = new require('markdown-it')()
  export default {
    data: () => ({
      alert: 0,
      bot_confiuration_time: 0,
      current_template: '%NSFW|#NSFW %[%title%](%url%)% %p%%\n|tags%',
      raw_config: ''
    }),
    methods: {
      format(template = false, mode = 'message') {
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
        let d = {
          format: {
            message: this.current_template,
            inline: this.current_template,
          },
          time: this.bot_confiuration_time
        }
        sessionStorage.s = encodeUnicode(JSON.stringify(d))
        this.raw_config = encodeUnicode(JSON.stringify(d))
      }
    },
    watch: {
      current_template: function () {
        this.save()
      }
    },
    mounted() {
      // load configure from hash
      let hash = location.hash.substr(1)
      if (sessionStorage.s && (!hash || hash.length < 10)) {
        hash = sessionStorage.s
      }
      try {
        location.hash = '#'
        let setting = {}
        if (setting = JSON.parse(decodeUnicode(hash))) {
          // I don't wanna design the tabs to hold message / inline reply format.....
          this.current_template = setting.format.message
          this.bot_confiuration_time = setting.time
          if (+new Date() - setting.time > 120000 && setting.time !== undefined && setting.time !== 0) { // time - bot generate time > 120s
            this.alert = 2
          }
        }
      } catch (error) {
        this.alert = 1
        console.warn(error, hash)
      }
    }
  }
  function format(td, flag, mode = 'message', p) { let template = flag.setting.format[mode]; if (template == '') { return '' } else { let splited_tamplate = template.replaceAll('\\%', '\uff69').split('%'); let replace_list = [['title', td.title], ['id', flag.c_show_id ? td.id : false], ['url', `https://pixiv.net/artworks/${td.id}`], ['NSFW', td.nsfw], ['author_id', td.author_id], ['author_url', `https://www.pixiv.net/users/${td.author_id}`], ['author_name', td.author_name]]; if (td) { if (td.original_urls && td.original_urls.length > 1 && p !== -1) { replace_list.push(['p', `${(p + 1)}/${td.original_urls.length}`]) } else { replace_list.push(['p', '']) } if (flag.tags) { let tags = '#' + td.tags.join(' #'); replace_list.push(['tags', tags.substr(0, tags.length - 1)]) } else { replace_list.push(['tags', '']) } } if (flag.single_caption) { if (!td) { replace_list.push(['mid', flag.mid]) } else { replace_list.push(['mid', '%mid%']) } } splited_tamplate.map((r, id) => { replace_list.forEach(x => { if (x && r.includes(x[0])) { splited_tamplate[id] = Treplace(r, ...x) } }) }); template = splited_tamplate.join('').replaceAll('\uff69', '%'); let temp = template.match(/\[.*?\]/); if (temp) { temp.map(r => { template = template.replace(r, re_escape_strings(r)) }) } } return template } function escape_strings(t) { '[]()*_`~'.split('').forEach(x => { t = t.toString().replaceAll(x, `\\${x}`) }); return t } function re_escape_strings(t) { '()*_`~'.split('').forEach(x => { t = t.toString().replaceAll('\\' + x, x) }); return t } function Treplace(r, name, value) { if (!r.includes(name)) { return r } if (!value) { return '' } if (typeof value == 'boolean') { value = '' } return r.replaceAll('\\|', '\uffb4').split('|').map(l => { if (l == name) { if (name == 'tags') { return value } return escape_strings(value) } return l }).join('').replaceAll('\uffb4', '|') } function decodeUnicode(str) { return decodeURIComponent(atob(str).split('').map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2) }).join('')) } function encodeUnicode(str) { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) { return String.fromCharCode('0x' + p1) })) }
</script>
