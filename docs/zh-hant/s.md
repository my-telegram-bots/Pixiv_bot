---
sidebar: false
editLink: false
title: bot配置
---
<template>
  <div id="setting">
    <h1>機器人設定</h1>
    <div class="custom-block alert warning" v-if="alert == 1">
      <p class="custom-block-title">未載入設定！</p>
      <p>建議透過 bot 的 <code>/s</code> 指令來開啟本頁面</p>
    </div>
    <div class="custom-block danger" v-else-if="alert == 2">
      <p class="custom-block-title">您的設定檔可能不是最新的（產生時間為 {{ new Date(bot_confiuration_time).toString().split(' (')[0] }})
      </p>
      <p>請傳送 <code>/s</code> 指令給 bot 以開啟本設定頁面。</p>
    </div>
    <blockquote>在進行設定之前，請先同意 bot 的隱私權政策。</blockquote>
    <div id="format">
      <h2>訊息格式設定</h2>
      <blockquote>
        在這裡可以自訂機器人回傳的訊息格式
        <br>
        請留意您自訂的文字格式字數，過長的訊息將無法傳送。
      </blockquote>
      <div id="template">
        <p style="text-align: center;">預設範本（點擊套用）</p>
        <div class="cards container">
          <div v-for="template in template_list" class="card container" @click="current_templates[mode]=template">
              <span v-html="format(template)"></span>
            </div>
        </div>
        <p style="text-align: center;">目前效果</p>
        <div id="customtemplate">
          <div class="card" style="margin: auto;">
            <div style="text-align: center;">
              <img src="../img/67953985_p0.jpg">
            </div>
            <span class="container" v-html="format(current_templates[mode])"></span>
          </div>
          <div style="text-align: center; margin-bottom: 10px;">
            <button @click="mode = 'message'">編輯一般範本</button>
            <button @click="mode = 'inline'">編輯 Inline 範本</button>
            <button @click="mode = 'mediagroup_message'">編輯媒體群組範本</button>
          </div>
          <div class="textareacard">
            <textarea v-model="current_templates[mode]"></textarea>
          </div>
          <div class="custom-block danger">
            <p>請注意 Telegram 的 MarkdownV2 範本引擎是<strong>嚴格驗證模式</strong>，您需要使用反斜線 <code>\</code> 對以下字元進行跳脫才能正常顯示：</p>
            <p>必須跳脫的字元有：<code>_ * [ ] ( ) ~ ` > # + - = | { } . !</code></p>
            <p>例如，以下文字：</p>
            <pre><code>_ * [ ] ( ) ~ ` > # + - = | { } . !</code></pre>
            <p>應跳脫為：</p>
            <pre><code>\_ \* \[ \] \( \) \~ \` \> \# \+ \- \= \| \{ \} \. \!</code></pre>
            <p>這樣，最終在 Telegram 中才能正常顯示。</p>
          </div>
          <details class="custom-block details">
            <summary>格式說明</summary>
            <p>
              Telegram 的 Markdown 僅支援以下這些：<br>
              ** __ []() ```<br>
              在自訂之前需要注意這些限制<br>
              需要顯示連結？<br>
              <code>[標題](連結)</code> 遵循 Markdown 格式即可。<br>
              其他的可以依照預設範本的範例進行修改即可<br><br>
              這裡均使用 %% 作為變數，其中變數前後都可以加入想要的文字，使用 | 即可加入。<br>
              範例: <code>%連結:|url|?233%</code> -> 連結: [https://www.pixiv.net/artworks/123?233](https://www.pixiv.net/artworks/123?233)<br>
              如果想顯示 | 符號，請在前面加上 \ 來跳脫即可<br>
              <code>%連結:\||url|\|?233%</code> -> 連結:\| [https://www.pixiv.net/artworks/123](https://www.pixiv.net/artworks/123)\|?233<br><br>
              <strong>目前已有的變數有：</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>變數</th>
                  <th>說明</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>%title%</code></td><td>作品標題</td></tr>
                <tr><td><code>%description%</code></td><td>作品描述</td></tr>
                <tr><td><code>%id%</code></td><td>作品 ID</td></tr>
                <tr><td><code>%url%</code></td><td>作品連結 [https://www.pixiv.net/artworks/:id](https://www.pixiv.net/artworks/:id)</td></tr>
                <tr><td><code>%tags%</code></td><td>作品標籤</td></tr>
                <tr><td><code>%AI%</code></td><td>是否為 AI 生成作品</td></tr>
                <tr><td><code>%NSFW%</code></td><td>是否為 NSFW 作品</td></tr>
                <tr><td><code>%author_id%</code></td><td>作者 ID</td></tr>
                <tr><td><code>%author_url%</code></td><td>作者連結</td></tr>
                <tr><td><code>%author_name%</code></td><td>作者名稱</td></tr>
                <tr><td><code>%p%</code></td><td>多頁作品顯示目前頁數，格式為 目前頁數/總頁數，例如 1/2</td></tr>
                <tr><td><code>%mid%</code></td><td>供 +sc 模式專用變數</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
    <div id="save">
      <a target="_tshare" :href="'tg://msg_url?url=' + encodeURIComponent(raw_config)">儲存變更</a>
      <p>為了匿名以及靜態化頁面，儲存變更需要您複製指令傳送給 bot。如果上方的按鈕無法跳轉至 Telegram 並傳送訊息給 Pixiv_bot，請手動複製以下文字並貼上給 bot</p>
      <div class="textareacard">
        <textarea v-model="raw_config" readonly style="resize: none;"></textarea>
      </div>
      <p>除錯用</p>
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