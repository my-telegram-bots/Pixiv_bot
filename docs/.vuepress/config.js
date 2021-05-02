module.exports = {
  dest: 'dist',
  configureWebpack: {
    resolve: {
      alias: {
        '../img/': '../img/',
        '../../img/': '../img/',
        './img/': '../img/'
      }
    }
  },
  locales: {
    '/': {
      lang: 'en-US',
      label: 'English',
      ariaLabel: 'Languages',
      title: 'pixiv_bot'
    },
    '/zh-hans/': {
      lang: 'zh-hans',
      label: '简体中文',
      title: 'pixiv_bot'
    },
    '/zh-hant/': {
      lang: 'zh-hant',
      label: '繁體中文',
      title: 'pixiv_bot'
    }
  },
  themeConfig: {
    sidebar: 'auto',
    search: false,
    repo: 'my-telegram-bots/Pixiv_bot',
    docsBranch: 'docs',
    docsDir: 'docs',
    editLinks: true,
    locales: {
      '/': {
        lang: 'en-US',
        label: 'English',
        selectText: 'Languages',
        title: 'pixiv bot',
        description: 'A telegram bot',
        lastUpdated: 'Last Updated',
        nav: [
          { text: 'Guide', link: '/' },
          { text: 'Configuration', link: '/s' },
          { text: 'Privacy Policy', link: '/privacy' }
        ],
      },
      '/zh-hans/': {
        lang: 'zh-hans',
        label: '简体中文',
        selectText: '选择语言',
        title: 'pixiv bot',
        description: '一个电报机器人',
        lastUpdated: '上次更新',
        editLinkText: '帮助我们改善此页面！',
        nav: [
          { text: '指南', link: '/zh-hans/' },
          { text: '设置', link: '/zh-hans/s' },
          { text: '隐私策略', link: '/zh-hans/privacy' }
        ],
      },
      '/zh-hant/': {
        lang: 'zh-hans',
        label: '簡體中文',
        selectText: '選擇語言',
        title: 'pixiv bot',
        description: '一個電報機器人',
        lastUpdated: '上次更新',
        editLinkText: '幫助我們改善此頁面！',
        nav: [
          { text: '指南', link: '/zh-hant/' },
          { text: '設置', link: '/zh-hant/s' },
          { text: '隱私策略', link: '/zh-hant/privacy' }
        ],
      }
    }
  }
}