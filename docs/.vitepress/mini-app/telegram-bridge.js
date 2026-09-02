export function createTelegramBridge(webApp = globalThis.window?.Telegram?.WebApp) {
  const available = webApp !== null && typeof webApp === 'object'

  return {
    available,
    canSendData: available && typeof webApp.sendData === 'function',
    canRequestChat: available && typeof webApp.requestChat === 'function',
    ready() {
      if (available && typeof webApp.ready === 'function') webApp.ready()
    },
    sendData(data) {
      if (!available || typeof webApp.sendData !== 'function') {
        throw new Error('send_data_unsupported')
      }
      webApp.sendData(data)
    },
    requestChat(preparedId) {
      if (!available || typeof webApp.requestChat !== 'function') {
        return Promise.resolve(false)
      }
      return new Promise((resolve, reject) => {
        try {
          webApp.requestChat(preparedId, selected => resolve(selected === true))
        } catch (error) {
          reject(new Error('request_chat_failed'))
        }
      })
    },
    close() {
      if (available && typeof webApp.close === 'function') webApp.close()
    },
    themeParams: available && ordinaryObject(webApp.themeParams) ? webApp.themeParams : {}
  }
}

function ordinaryObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
