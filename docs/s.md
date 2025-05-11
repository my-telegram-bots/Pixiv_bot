---
sidebar: false
editLink: false
title: Bot Configuration
---
<template>
  <div id="setting">
    <h1>Bot Configuration</h1>
    <div class="custom-block alert warning" v-if="alert == 1">
      <p class="custom-block-title">No Configuration Loaded!</p>
      <p>It is recommended to open this page using the bot's <code>/s</code> command.</p>
    </div>
    <div class="custom-block danger" v-else-if="alert == 2">
      <p class="custom-block-title">Your configuration file might be outdated (Generated at {{ new Date(bot_confiuration_time).toString().split(' (')[0] }})
      </p>
      <p>Please send the <code>/s</code> command to the bot to open this configuration page.</p>
    </div>
    <blockquote>Please agree to the bot's privacy policy before proceeding with the configuration.</blockquote>
    <div id="format">
      <h2>Message Format Configuration</h2>
      <blockquote>
        Here you can customize the bot's response message format.
        <br>
        Please note the character count of your custom text format. Messages that are too long cannot be sent.
      </blockquote>
      <div id="template">
        <p style="text-align: center;">Default Templates (Click to apply)</p>
        <div class="cards container">
          <div v-for="template in template_list" class="card container" @click="current_templates[mode]=template">
              <span v-html="format(template)"></span>
            </div>
        </div>
        <p style="text-align: center;">Current Preview</p>
        <div id="customtemplate">
          <div class="card" style="margin: auto;">
            <div style="text-align: center;">
              <img src="./img/67953985_p0.jpg"> </div>
            <span class="container" v-html="format(current_templates[mode])"></span>
          </div>
          <div style="text-align: center; margin-bottom: 10px;">
            <button @click="mode = 'message'">Edit Normal Template</button>
            <button @click="mode = 'inline'">Edit Inline Template</button>
            <button @click="mode = 'mediagroup_message'">Edit mediagroup Template</button>
          </div>
          <div class="textareacard">
            <textarea v-model="current_templates[mode]"></textarea>
          </div>
          <div class="custom-block danger">
            <p>Please note that Telegram's MarkdownV2 template engine uses <strong>strict validation</strong>. You need to use a backslash <code>\</code> to escape the following characters for them to display correctly:</p>
            <p>Characters that must be escaped: <code>_ * [ ] ( ) ~ ` > # + - = | { } . !</code></p>
            <p>For example, the following text:</p>
            <pre><code>_ * [ ] ( ) ~ ` > # + - = | { } . !</code></pre>
            <p>Should be escaped as:</p>
            <pre><code>\_ \* \[ \] \( \) \~ \` \> \# \+ \- \= \| \{ \} \. \!</code></pre>
            <p>This way, they will be displayed correctly in Telegram.</p>
          </div>
          <details class="custom-block details">
            <summary>Format Help</summary>
            <p>
              Telegram's Markdown only supports the following: <br>
              ** __ []() ```<br>
              You need to be aware of these limitations before customizing.<br>
              Need to display links?<br>
              Just follow the Markdown format: <code>[Title](Link)</code>.<br>
              For others, you can modify based on the default template examples.<br><br>
              Here, variables are enclosed in `%%`. You can add text before and after the variable name using `|` as a separator.<br>
              Example: <code>%Link:|url|?233%</code> -> Link: [https://www.pixiv.net/artworks/123?233](https://www.pixiv.net/artworks/123?233)<br>
              If you want to display a literal `|`, please add `\` before it to escape it.<br>
              <code>%Link:\||url|\|?233%</code> -> Link:\| [https://www.pixiv.net/artworks/123](https://www.pixiv.net/artworks/123)\|?233%<br><br>
              <strong>Currently available variables are:</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>%title%</code></td><td>Artwork Title</td></tr>
                <tr><td><code>%description%</code></td><td>Artwork Description</td></tr>
                <tr><td><code>%id%</code></td><td>Artwork ID</td></tr>
                <tr><td><code>%url%</code></td><td>Artwork URL [https://www.pixiv.net/artworks/:id](https://www.pixiv.net/artworks/:id)</td></tr>
                <tr><td><code>%tags%</code></td><td>Artwork Tags</td></tr>
                <tr><td><code>%AI%</code></td><td>Is AI Artwork?</td></tr>
                <tr><td><code>%NSFW%</code></td><td>Is NSFW Artwork?</td></tr>
                <tr><td><code>%author_id%</code></td><td>Author ID</td></tr>
                <tr><td><code>%author_url%</code></td><td>Author URL</td></tr>
                <tr><td><code>%author_name%</code></td><td>Author Name</td></tr>
                <tr><td><code>%p%</code></td><td>Shows current page for multi-page works. Format: Current p / Total p (e.g., 1/2)</td></tr>
                <tr><td><code>%mid%</code></td><td>Variable specific to +sc mode</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
    <div id="save">
      <a target="_tshare" :href="'tg://msg_url?url=' + encodeURIComponent(raw_config)">Save Changes</a>
      <p>For anonymity and to keep this page static, saving changes requires you to send the command to the bot. If the button above doesn't redirect you to Telegram and pre-fill the message for Pixiv_bot, please manually copy the text below and send it to the bot.</p>
      <div class="textareacard">
        <textarea v-model="raw_config" readonly style="resize: none;"></textarea>
      </div>
      <p>For Debugging</p>
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
        '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / %id\\=|id% / [%author_name%](%author_url%) %p%%\n|tags%%\n|description%',
        '%\\#NSFW |NSFW%%\\#AI |AI%%title% \\| %author_name% \\#pixiv [%url%](%url%) %p%%\n|tags%%\n>**|description%',
        '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / [%author_name%](%author_url%)% |p%%\n|tags%%\n>**|description%',
        '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / %id\\=|id% / [%author_name%](%author_url%) %p%%\n|tags%%\n>**|description%'
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