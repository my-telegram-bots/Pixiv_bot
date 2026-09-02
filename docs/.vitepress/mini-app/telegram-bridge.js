export function createTelegramBridge(
  webApp = globalThis.window?.Telegram?.WebApp,
  hostWindow = globalThis.window
) {
  const available = webApp !== null && typeof webApp === 'object'

  return {
    available,
    canSendData: available && typeof webApp.sendData === 'function',
    canRequestChat: available && typeof webApp.requestChat === 'function',
    currentUserPhotoUrl: available && typeof webApp.initDataUnsafe?.user?.photo_url === 'string'
      ? webApp.initDataUnsafe.user.photo_url
      : '',
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
        let leftForSelector = false
        let returnTimer
        const hostDocument = hostWindow?.document
        const finish = selected => {
          if (returnTimer) hostWindow?.clearTimeout?.(returnTimer)
          hostWindow?.removeEventListener?.('blur', onLeave)
          hostWindow?.removeEventListener?.('focus', onReturn)
          hostDocument?.removeEventListener?.('visibilitychange', onVisibilityChange)
          webApp.offEvent?.('deactivated', onLeave)
          webApp.offEvent?.('activated', onReturn)
          resolve(selected === true)
        }
        const onLeave = () => { leftForSelector = true }
        const onReturn = () => {
          if (!leftForSelector || returnTimer) return
          returnTimer = hostWindow?.setTimeout?.(() => finish(false), 250)
        }
        const onVisibilityChange = () => {
          if (hostDocument?.visibilityState === 'hidden') onLeave()
          else if (hostDocument?.visibilityState === 'visible') onReturn()
        }
        try {
          hostWindow?.addEventListener?.('blur', onLeave)
          hostWindow?.addEventListener?.('focus', onReturn)
          hostDocument?.addEventListener?.('visibilitychange', onVisibilityChange)
          webApp.onEvent?.('deactivated', onLeave)
          webApp.onEvent?.('activated', onReturn)
          webApp.requestChat(preparedId, finish)
        } catch (error) {
          hostWindow?.removeEventListener?.('blur', onLeave)
          hostWindow?.removeEventListener?.('focus', onReturn)
          hostDocument?.removeEventListener?.('visibilitychange', onVisibilityChange)
          webApp.offEvent?.('deactivated', onLeave)
          webApp.offEvent?.('activated', onReturn)
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
