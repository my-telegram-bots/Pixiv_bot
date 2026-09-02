import { defineConfig } from 'vitepress'

const repository = 'https://github.com/my-telegram-bots/Pixiv_bot'

export default defineConfig({
  title: 'pixiv_bot',
  description: 'A Telegram bot',
  cleanUrls: true,
  lastUpdated: true,
  outDir: '../dist',
  srcExclude: ['SETTINGS_MINI_APP_ADAPTER.md', 'TOOLCHAIN.md'],
  rewrites: {
    'readme.md': 'index.md',
    'ja/readme.md': 'ja/index.md',
    'zh-hans/readme.md': 'zh-hans/index.md',
    'zh-hant/readme.md': 'zh-hant/index.md'
  },
  transformHtml(html, _id, context) {
    if (!context.pageData.relativePath.endsWith('mini-app.md')) return html
    return html.replace(
      '<head>',
      '<head>\n    <script src="https://telegram.org/js/telegram-web-app.js?63"></script>'
    )
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/' },
          { text: 'Configuration', link: '/s' },
          { text: 'Privacy Policy', link: '/privacy' }
        ],
        editLink: {
          pattern: `${repository}/edit/docs/docs/:path`,
          text: 'Edit this page on GitHub'
        },
        lastUpdated: { text: 'Last Updated' },
        outline: { label: 'On this page', level: 'deep' }
      }
    },
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      link: '/ja/',
      title: 'pixiv_bot',
      description: 'Telegram で Pixiv 作品を送信する Bot',
      themeConfig: {
        nav: [
          { text: 'ガイド', link: '/ja/' },
          { text: '設定', link: '/ja/s' },
          { text: 'プライバシーポリシー', link: '/ja/privacy' }
        ],
        editLink: {
          pattern: `${repository}/edit/docs/docs/:path`,
          text: 'このページを編集'
        },
        lastUpdated: { text: '最終更新' },
        outline: { label: 'このページ', level: 'deep' },
        docFooter: { prev: '前へ', next: '次へ' }
      }
    },
    'zh-hans': {
      label: '简体中文',
      lang: 'zh-Hans',
      link: '/zh-hans/',
      title: 'pixiv_bot',
      description: '一个 Telegram 机器人',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh-hans/' },
          { text: '配置', link: '/zh-hans/s' },
          { text: '隐私策略', link: '/zh-hans/privacy' }
        ],
        editLink: {
          pattern: `${repository}/edit/docs/docs/:path`,
          text: '帮助我们改善此页面！'
        },
        lastUpdated: { text: '上次更新' },
        outline: { label: '本页目录', level: 'deep' },
        docFooter: { prev: '上一页', next: '下一页' }
      }
    },
    'zh-hant': {
      label: '繁體中文',
      lang: 'zh-Hant',
      link: '/zh-hant/',
      title: 'pixiv_bot',
      description: '一個 Telegram 機器人',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh-hant/' },
          { text: '配置', link: '/zh-hant/s' },
          { text: '隱私策略', link: '/zh-hant/privacy' }
        ],
        editLink: {
          pattern: `${repository}/edit/docs/docs/:path`,
          text: '幫助我們改善此頁面！'
        },
        lastUpdated: { text: '上次更新' },
        outline: { label: '本頁目錄', level: 'deep' },
        docFooter: { prev: '上一頁', next: '下一頁' }
      }
    }
  },
  themeConfig: {
    socialLinks: [{ icon: 'github', link: repository }]
  }
})
