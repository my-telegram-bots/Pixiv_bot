<template>
  <div id="setting">
    <h1>Bot 設定</h1>
    <div class="custom-block alert warning" v-if="alert == 1">
      <p class="custom-block-title">設定が読み込まれていません</p>
      <p>Bot の <code>/s</code> コマンドからこのページを開き直してください。</p>
    </div>
    <div class="custom-block danger" v-else-if="alert == 2">
      <p class="custom-block-title">この設定は古い可能性があります（生成日時：{{ new Date(bot_confiuration_time).toString().split(' (')[0] }}）</p>
      <p>Bot に <code>/s</code> コマンドを送信し、最新の設定ページを開いてください。</p>
    </div>
    <blockquote>設定を続ける前に、Bot のプライバシーポリシーへ同意してください。</blockquote>
    <div id="format">
      <h2>メッセージ形式の設定</h2>
      <blockquote>
        Bot が返すメッセージ形式をカスタマイズできます。
        <br>
        カスタム形式の文字数に注意してください。長すぎるメッセージは送信できません。
      </blockquote>
      <div id="template">
        <p style="text-align: center;">既定のテンプレート（クリックして適用）</p>
        <div class="cards container">
          <div v-for="template in template_list" class="card container" @click="current_templates[mode]=template">
            <span v-html="format(template)"></span>
          </div>
        </div>
        <p style="text-align: center;">現在のプレビュー</p>
        <div id="customtemplate">
          <div class="card" style="margin: auto;">
            <div style="text-align: center;">
              <img src="../../img/67953985_p0.jpg">
            </div>
            <span class="container" v-html="format(current_templates[mode])"></span>
          </div>
          <div style="text-align: center; margin-bottom: 10px;">
            <button @click="mode = 'message'">通常テンプレートを編集</button>
            <button @click="mode = 'inline'">インラインテンプレートを編集</button>
            <button @click="mode = 'mediagroup_message'">MediaGroup テンプレートを編集</button>
          </div>
          <div class="textareacard">
            <textarea v-model="current_templates[mode]"></textarea>
          </div>
          <div class="custom-block danger">
            <p>Telegram の MarkdownV2 テンプレートエンジンでは<strong>厳密な検証</strong>が行われます。次の文字を正しく表示するには、バックスラッシュ <code>\</code> でエスケープしてください。</p>
            <p>エスケープが必要な文字：<code>_ * [ ] ( ) ~ ` &gt; # + - = | { } . !</code></p>
            <p>たとえば、次の文字列は</p>
            <pre><code>_ * [ ] ( ) ~ ` &gt; # + - = | { } . !</code></pre>
            <p>次のようにエスケープします。</p>
            <pre><code>\_ \* \[ \] \( \) \~ \` \&gt; \# \+ \- \= \| \{ \} \. \!</code></pre>
            <p>これにより、Telegram 上で正しく表示されます。</p>
          </div>
          <details class="custom-block details">
            <summary>形式のヘルプ</summary>
            <p>
              Telegram の Markdown で使用できる記法は次のとおりです。<br>
              ** __ []() ```<br>
              カスタマイズする前に、この制限を確認してください。<br>
              リンクを表示する場合は、Markdown の <code>[タイトル](リンク)</code> 形式を使用します。<br>
              その他の形式は、既定のテンプレートを参考に変更できます。<br><br>
              変数は <code>%%</code> で囲み、<code>|</code> で区切ると変数の前後に文字を追加できます。<br>
              例：<code>%リンク:|url|?233%</code> → リンク: https://www.pixiv.net/artworks/123?233<br>
              <code>|</code> 自体を表示する場合は、直前に <code>\</code> を付けてエスケープしてください。<br>
              <code>%リンク:\||url|\|?233%</code> → リンク:\| https://www.pixiv.net/artworks/123\|?233<br><br>
              <strong>利用できる変数：</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>変数</th>
                  <th>説明</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>%title%</code></td><td>作品タイトル</td></tr>
                <tr><td><code>%description%</code></td><td>作品の説明</td></tr>
                <tr><td><code>%id%</code></td><td>作品 ID</td></tr>
                <tr><td><code>%url%</code></td><td>作品 URL https://www.pixiv.net/artworks/:id</td></tr>
                <tr><td><code>%tags%</code></td><td>作品タグ</td></tr>
                <tr><td><code>%AI%</code></td><td>AI 生成作品かどうか</td></tr>
                <tr><td><code>%NSFW%</code></td><td>NSFW 作品かどうか</td></tr>
                <tr><td><code>%author_id%</code></td><td>作者 ID</td></tr>
                <tr><td><code>%author_url%</code></td><td>作者 URL</td></tr>
                <tr><td><code>%author_name%</code></td><td>作者名</td></tr>
                <tr><td><code>%p%</code></td><td>複数ページ作品の現在ページと総ページ数（例：1/2）</td></tr>
                <tr><td><code>%mid%</code></td><td><code>+sc</code> モード専用の変数</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
    <div id="save">
      <a target="_tshare" :href="'tg://msg_url?url=' + encodeURIComponent(raw_config)">変更を保存</a>
      <p>匿名性を保ち、このページを静的に運用するため、変更内容は Bot へコマンドとして送信します。上のボタンで Telegram が開かない、または Pixiv_bot 宛てのメッセージが入力されない場合は、下の文字列をコピーして Bot へ送信してください。</p>
      <div class="textareacard">
        <textarea v-model="raw_config" readonly style="resize: none;"></textarea>
      </div>
      <p>デバッグ情報</p>
      <div class="textareacard">
        <textarea v-model="json_config" readonly style="resize: none;"></textarea>
      </div>
    </div>
  </div>
</template>

<script>
  import MarkdownIt from 'markdown-it'

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
  const md = new MarkdownIt()
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
        const content = format({ "ai": true, description: "説明 1 行目 \n説明 2 行目", "original_urls": [1, 2, 3, 4], "id": "67953985", "title": "XX:Me", "author_name": "rumikuu", "author_id": "3654183", "inline": [], "tags": ["DARLINGintheFRANXX", "ゼロツー", "ココロ", "ミク", "イクノ", "xx:me", "トリカゴ"], "nsfw": true }, {
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
          this.current_templates.inline = setting.format.inline
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
  #setting p {
    overflow: hidden;
  }
</style>
