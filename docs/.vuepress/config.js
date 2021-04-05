module.exports = {
  dest: 'dist',
  configureWebpack: {
    resolve: {
      alias: {
        '../img/': '../img/',
        '.../img/': '../img/',
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
      ariaLabel: '选择语言',
      label: '简体中文',
      title: 'pixiv_bot'
    }
  },
  themeConfig: {
    sidebar: 'auto',
    search: false,
    locales: {
      '/': {
        lang: 'en-US',
        label: 'English',
        selectText: 'Languages',
        title: 'pixiv bot',
        description: 'A telegram bot'
      },
      '/zh-hans/': {
        lang: 'zh-hans',
        label: '简体中文',
        selectText: '选择语言',
        title: 'pixiv bot',
        description: '一个电报机器人'
      }
    }
  }
}