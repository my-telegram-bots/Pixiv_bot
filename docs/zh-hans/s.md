---
sidebar: false
editLink: false
title: bot配置
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
        请留意您自定义的文本格式字数，太长的消息将无法发送。
      </blockquote>
      <div id="template">
        <p style="text-align: center;">默认模板（点击应用）</p>
        <div class="cards container">
          <div v-for="template in template_list" class="card container" @click="current_templates[mode]=template">
              <span v-html="format(template)"></span>
            </div>
        </div>
        <p style="text-align: center;">当前效果</p>
        <div id="customtemplate">
          <div class="card" style="margin: auto;">
            <div style="text-align: center;">
              <img src="../img/67953985_p0.jpg">
            </div>
            <!-- self xss warning -->
            <span class="container" v-html="format(current_templates[mode])"></span>
          </div>
          <div style="text-align: center; margin-bottom: 10px;">
            <button @click="mode = 'message'">编辑普通模版</button>
            <button @click="mode = 'inline'">编辑 Inline 模版</button>
            <button @click="mode = 'mediagroup_message'">编辑媒体组模版</button>
          </div>
          <div class="textareacard">
            <textarea v-model="current_templates[mode]"></textarea>
          </div>
          <div class="custom-block danger">
            <p>请注意 Telegram 的 MarkdownV2 模板引擎是<strong>强校验模式</strong>，您需要使用反斜杠 <code>\</code> 对以下字符进行转义才能正常显示：</p>
            <p>必须转义的字符有：<code>_ * [ ] ( ) ~ ` > # + - = | { } . !</code></p>
            <p>例如，以下文本：</p>
            <pre><code>_ * [ ] ( ) ~ ` > # + - = | { } . !</code></pre>
            <p>应转义为：</p>
            <pre><code>\_ \* \[ \] \( \) \~ \` \> \# \+ \- \= \| \{ \} \. \!</code></pre>
            <p>这样，最终在 Telegram 中才会被正常显示。</p>
          </div>
          <details class="custom-block details">
            <summary>格式帮助</summary>
            <p>
              Telegram 的 Markdown 只支持以下这些：<br>
              ** __ []() ```<br>
              在自定义之前需要注意这些限制<br>
              需要显示链接？<br>
              <code>[标题](链接)</code> 遵循 Markdown 格式即可。<br>
              其它的可以按照默认模板的例子更改就行了<br><br>
              这边均使用 %% 作为变量，其中变量前后都可以添加想要的文本进去使用 | 即可添加。<br>
              例子: <code>%链接:|url|?233%</code> -> 链接: https://www.pixiv.net/artworks/123?233<br>
              喜欢 | 的话，请在前面添加 \ 来转义掉即可<br>
              <code>%链接:\||url|\|?233%</code> -> 链接:\| https://www.pixiv.net/artworks/123\|?233<br><br>
              <strong>目前已经有的变量有：</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>变量</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>%title%</code></td><td>作品标题</td></tr>
                <tr><td><code>%description%</code></td><td>作品描述</td></tr>
                <tr><td><code>%id%</code></td><td>作品 id</td></tr>
                <tr><td><code>%url%</code></td><td>作品链接 https://www.pixiv.net/artworks/:id</td></tr>
                <tr><td><code>%tags%</code></td><td>作品标签</td></tr>
                <tr><td><code>%AI%</code></td><td>是否为 AI 作品</td></tr>
                <tr><td><code>%NSFW%</code></td><td>是否为 NSFW 作品</td></tr>
                <tr><td><code>%author_id%</code></td><td>作者 id</td></tr>
                <tr><td><code>%author_url%</code></td><td>作者链接</td></tr>
                <tr><td><code>%author_name%</code></td><td>作者名字</td></tr>
                <tr><td><code>%p%</code></td><td>分 p 的时候显示当前第几 p，格式为 当前 p/总 p 数，例如 1/2</td></tr>
                <tr><td><code>%mid%</code></td><td>For +sc mode 专用变量</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
    <div id="save">
      <a target="_tshare" :href="'tg://msg_url?url=' + encodeURIComponent(raw_config)">保存更改</a>
      <p>为了匿名以及静态化页面，保存更改需要您复制命令给 bot，如果上面的按钮无法跳转至 Telegram 并且发送消息给 Pixiv_bot 请手动复制以下文本粘贴至 bot</p>
      <div class="textareacard">
        <textarea v-model="raw_config" readonly style="resize: none;"></textarea>
      </div>
      <p>DEBUG 用</p>
      <div class="textareacard">
        <textarea v-model="json_config" readonly style="resize: none;"></textarea>
      </div>
    </div>
  </div>
</template>

<script>
  const default_template_list = {
        message: '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / [%author_name%](%author_url%)% |p%'
            + '%\n|tags%'
            + '%\n>|description%',
        // single caption
        mediagroup_message: '[%mid| %%title%% |p%](%url%)'
            + '%\n|tags%',
        inline: '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / [%author_name%](%author_url%)% |p%'
            + '%\n|tags%'
            + '%\n>|description%'
  }
  let md = new require('markdown-it')()
  export default {
    data: () => ({
      alert: 0,
      bot_confiuration_time: 0,
      template_list: [
        '%\\#NSFW |NSFW%%\\#AI |AI%%title% \\| %author_name% \\#pixiv [%url%](%url%) %p%%\n|tags%%\n|description%',
        '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / [%author_name%](%author_url%)% |p%%\n|tags%%\n|description%',
        '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / %id\=|id% / [%author_name%](%author_url%) %p%%\n|tags%%\n|description%',
        '%\\#NSFW |NSFW%%\\#AI |AI%%title% \\| %author_name% \\#pixiv [%url%](%url%) %p%%\n|tags%%\n>|description%',
        '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / [%author_name%](%author_url%)% |p%%\n|tags%%\n>|description%',
        '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / %id\=|id% / [%author_name%](%author_url%) %p%%\n|tags%%\n>|description%'
      ],
      mode: 'message',
      current_templates: {...default_template_list},
      json_config: '',
      raw_config: ''
    }),
    methods: {
      format(template = false, mode = 'message') {
        const content = format({ "ai": true, description: "description line1 \ndescription line2", "original_urls": [1, 2, 3, 4], "id": "67953985", "title": "XX:Me", "author_name": "rumikuu", "author_id": "3654183", "inline": [], "tags": ["DARLINGintheFRANXX", "ゼロツー", "ココロ", "ミク", "イクノ", "xx:me", "トリカゴ"], "nsfw": true }, {
          remove_caption: false,
          telegraph: false,
          tags: true,
          description: true,
          show_id: true,
          c_show_id: true,
          setting: {
            format: {
              message: template,
              inline: template
            }
          }
        }, 'message', 1,1).replaceAll('\n', '  \n')
        console.log(content)
        return md.render(content)
      },
      save() {
        let d = {
          format: {
            message: this.current_templates.message,
            inline: this.current_templates.inline,
            mediagroup_message: this.current_templates.mediagroup_message
          },
          time: this.bot_confiuration_time
        }
        this.json_config = JSON.stringify(d)
        this.raw_config = encodeUnicode(this.json_config)
        sessionStorage.s = this.raw_config
      }
    },
    watch: {
      ['current_templates.message']: function () {
        this.save()
      },
      ['current_templates.inline']: function () {
        this.save()
      },
      ['current_templates.mediagroup_message']: function () {
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
          // this.current_template = setting.format.message
          this.current_templates.message = setting.format.message
          this.current_templates.message = setting.format.inline
          this.current_templates.mediagroup_message = setting.format.mediagroup_message
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
function format(td,flag,mode='message',p,mid){let template='';let result='';if(flag.remove_caption){return ''}if(flag.telegraph){if(p==0){template=df.format.telegraph;mode='telegraph'}}else if(!flag.setting.format[mode]){template=df.format[mode];if(!template){template=df.format.message}}else{template=flag.setting.format[mode]}template=template.replaceAll('\\|','\uff69');let replace_list={title:td.title.trim(),url:`https://www.pixiv.net/artworks/${td.id }`,NSFW:td.nsfw,AI:td.ai,author_id:td.author_id,author_url:`https://www.pixiv.net/users/${td.author_id }`,author_name:td.author_name.trim()};if(td){if(flag.show_id){replace_list.id=td.id}if(flag.description){replace_list.description=td.description}if(td.imgs_&&td.imgs_.size&&td.imgs_.size.length>1&&p!==-1){replace_list.p=`${(p+1)}/${td.imgs_.size.length }`}else{replace_list.p=false}if(flag.tags&&td.tags.length>0){replace_list.tags='#'+td.tags.join(' #')}if(flag.single_caption){replace_list.mid=mid}}let i=0;const len=template.length;const key_list=Object.keys(replace_list);while(i<len){const percent_index=template.indexOf('%',i);if(percent_index===-1){result+=template.substring(i);break}result+=template.substring(i,percent_index);const endpercent_index=template.indexOf('%',percent_index+1);if(endpercent_index===-1){result+='%';i=percent_index+1;continue}const placeholderContent=template.substring(percent_index+1,endpercent_index);let replacement='';const s=placeholderContent.split('|');let prefix='';let key='';let suffix='';if(key_list.includes(s[0])){key=s[0];if(s[1]){suffix=s[1]}}else if(key_list.includes(s[1])){prefix=s[0];key=s[1];if(s[2]){suffix=s[2]}}else{i=endpercent_index+1;continue}let dataValue=replace_list[key];if(typeof dataValue==='boolean'){if(dataValue){replacement=prefix+suffix}}else if(dataValue!==undefined){if(prefix.endsWith('\n>')){replacement=prefix+escape_markdownV2(dataValue).split('\n').map((line, i) =>(i===0?'':'>')+line).join('\n')+suffix}else{replacement=prefix+escape_markdownV2(dataValue)+suffix}}result+=replacement;i=endpercent_index+1}return result.replaceAll('\uff69','\|')}
function escape_markdownV2(str){if(typeof str!=='string'){if(!str){return ''}str=String(str)}const markdown_escape_regex=/([_*\[\]()~`>#+\-=|{}.!])/g;return str.replace(markdown_escape_regex,'\\$1')}
function decodeUnicode(str) { return decodeURIComponent(atob(str).split('').map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2) }).join('')) }
function encodeUnicode(str) { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) { return String.fromCharCode('0x' + p1) })) }
</script>
<style>
  p {
    overflow: hidden;
  }
</style>