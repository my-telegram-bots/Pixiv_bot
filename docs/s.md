---
sidebar: false
editLink: false
title: Bot configuration
---
<template>
  <div id="setting">
    <h1>Pixiv bot configuration</h1>
    <blockquote>Make sure you have agreed to the bot's privacy policy before editing bot's configuration</blockquote>
    <div class="custom-block tip" v-if="alert == 1">
      <p class="custom-block-title">There is no configuration!</p>
      <p>We suggest send <code>/s</code> command to reopen this page to get your latest bot's configuration.</p>
    </div>
    <div class="custom-block danger" v-else-if="alert == 2">
      <p class="custom-block-title">Your bot's configuration maybe not a latest version (configuration generate time: {{ new Date(bot_confiuration_time).toString().split(' (')[0] }})</p>
      <p>We suggest send <code>/s</code> command to reopen this page to get your latest bot's configuration.</p>
    </div>
    <div>
      <h2>Reply / inline message format settings</h2>
      <blockquote>
        This is where you can customize the format of the bot's return messages
        <br>
        Make sure that your reply format is not too long, as the bot won't be able to send too many content.
      </blockquote>
      <div id="template">
        <p style="text-align: center;">Default template (click to apply)</p>
        <div class="cards">
          <div class="card container" @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% %p%\n%tags%'">
            <p>#NSFW <a>XX:Me</a> 1/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
          <div class="card container"
            @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% / id=|id% / [%author_name%](%author_url%) %p%\n%tags%'">
            <p>#NSFW <a>XX:Me</a> / id=67953985 / <a>rumikuu</a> 2/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
          <div class="card container"
            @click="current_template = '%NSFW|#NSFW %[%title%](%url%)% / [%author_name%](%author_url%) %p%\n%tags%'">
            <p>#NSFW <a>XX:Me</a> / <a>rumikuu</a> 3/4<br>
              #DARLINGintheFRANXX #ゼロツー #ココロ #ミク #イクノ #xx:me #トリカ
            </p>
          </div>
        </div>
        <h3 style="text-align: center;">Current</h3>
        <div id="customtemplate">
          <div class="card" style="margin: auto;">
            <div style="text-align: center;">
              <img src="./img/67953985_p0.jpg">
            </div>
            <span class="container" v-html="format(current_template)"></span>
          </div>
          <div class="textareacard">
            <textarea v-model="current_template"></textarea>
          </div>
          <p>
            Telegram's Markdown supports only the following:
            <br>
            ** __ []() ```
            <br>
            You need to be aware of these limitations before customizing.
            <br> Need to show links?
            <br>
            <code>[title](link)</code> Just follow the Markdown format.
            <br>
            <br>
            Here we use %% as the variable, where you can add the text you want before and after the variable using | to
            add it.
            <br>
            example: <code>%link:|url|?233%</code> -> link: https://www.pixiv.net/artworks/123?233
            <br>
            if you like |, just add | in front of it to escape it
            <br>
            <code>%link:\||url|\|?233%</code> -> link:| https://www.pixiv.net/artworks/123|?233
            <br>
            The variables that are currently available are :
            <br>
            <code>%title%</code> illust's title
            <br>
            <code>%id%</code> illust's id
            <br>
            <code>%url%</code> illust's link https://www.pixiv.net/artworks/:id
            <br>
            <code>%tags%</code> illust's tags
            <br>
            <code>%NSFW%</code> No safe fork work!
            <br>
            <code>%author_id%</code> author's id
            <br>
            <code>%author_url%</code> author's link
            <br>
            <code>%author_name%</code> author's name
            <br>
            <code>%p%</code> Show current page when muilt page current/totalpage example: 1/2
          </p>
        </div>
      </div>
    </div>
    <div id="save" v-if="raw_config !== ''">
      <a target="_tshare" :href="'tg://msg_url?url=' + encodeURIComponent(raw_config)">save changes</a>
      <p>In order to anonymize, saving the changes requires you to copy the command to bot, if the button above does not
        jump to Telegram and send a message to Pixiv_bot please manually copy the following text to bot.</p>
      <div class="card textareacard">
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
      // location.hash = '#'
      try {
        let setting = {}
        if (setting = JSON.parse(decodeUnicode(hash))) {
          // I don't wanna design the tabs to hold message / inline reply format.....
          this.current_template = setting.format.message
          this.bot_confiuration_time = setting.time
          if(+new Date() - setting.time > 120000 && setting.time !== undefined && setting.time !== 0){ // time - bot generate time > 120s
            this.alert = 2
          }
        }
      } catch (error) {
        this.alert = 1
        console.warn(hash)
      }
    }
  }
  function format(td, flag, mode = 'message', p) { console.log(JSON.stringify(td)); let template = flag.setting.format[mode]; if (td.original_urls && td.original_urls.length > 1 && p !== -1) { template = template.replaceAll('%p%', `${(p + 1)}/${td.original_urls.length}`) } else { template = template.replaceAll('%p%', '') } let tags = '#' + td.tags.join(' #'); tags = tags.substr(0, tags.length - 1); let splited_tamplate = template.replaceAll('\\%', '\uff69').split('%'); let replace_list = [['tags', flag.tags ? tags : false], ['id', flag.c_show_id ? td.id : false], ['url', `https://pixiv.net/artworks/${td.id}`], ['author_url', `https://www.pixiv.net/users/${td.author_id}`], ['author_name', td.author_name], ['title', td.title], ['NSFW', td.nsfw]]; splited_tamplate.map((r, id) => { replace_list.forEach(x => { if (x && r.includes(x[0])) { splited_tamplate[id] = Treplace(r, ...x) } }) }); template = splited_tamplate.join('').replaceAll('\uff69', '%'); let temp = template.match(/\[.*?\]/); if (temp) { temp.map(r => { template = template.replace(r, re_escape_strings(r)) }) } return template } function escape_strings(t) { '[]()*_`~'.split('').forEach(x => { t = t.toString().replaceAll(x, `\\${x}`) }); return t } function re_escape_strings(t) { '()*_`~'.split('').forEach(x => { t = t.toString().replaceAll('\\' + x, x) }); return t } function Treplace(r, name, value) { if (!r.includes(name)) { return r } if (!value) { return '' } if (typeof value == 'boolean') { value = '' } return r.replaceAll('\\|', '\uffb4').split('|').map(l => { if (l == name) { if (name == 'tags') { return value } return escape_strings(value) } return l }).join('').replaceAll('\uffb4', '|') } function decodeUnicode(str) { return decodeURIComponent(atob(str).split('').map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2) }).join('')) } function encodeUnicode(str) { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) { return String.fromCharCode('0x' + p1) })) }
</script>