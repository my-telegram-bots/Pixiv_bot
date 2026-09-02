import { cloneSettings, serializeReset, serializeSave } from './protocol.js'

export const SUPPORTED_LOCALES = Object.freeze(['en', 'ja', 'zh-hans', 'zh-hant'])

const en = {
  title: 'Bot settings', intro: 'Review every setting, then save it back to this Telegram chat.',
  loading: 'Opening your settings…', ready: 'Settings are ready to edit.',
  invalid: 'These settings could not be opened because the launch link is invalid. Return to the bot and open settings again. [SETTINGS_MINI_APP_INVALID]',
  noTelegram: 'This page must be opened from the bot in Telegram. Return to the bot and tap Open settings. [SETTINGS_MINI_APP_TELEGRAM_REQUIRED]',
  unsupported: 'This Telegram client cannot send settings. Update Telegram, then open settings from the bot again. [SETTINGS_MINI_APP_UNSUPPORTED]',
  formatHeading: 'Message templates', formatHelp: 'Edit the templates used for normal messages, albums, and inline results.',
  normalTemplate: 'Normal message', albumTemplate: 'Album message', inlineTemplate: 'Inline result', protocolVersion: 'Template version', preview: 'Preview',
  optionsHeading: 'Delivery options', telegraphHeading: 'Telegraph details',
  telegraphTitle: 'Page title', telegraphAuthor: 'Author name', telegraphUrl: 'Author URL',
  targetHeading: 'Whose settings?', personalTarget: 'You are editing the target selected by the bot. Choose another target here if needed.',
  group: 'Choose group', channel: 'Choose channel', targetIdle: 'No target selection is in progress.',
  targetPendingGroup: 'Telegram is waiting for you to choose a group.', targetPendingChannel: 'Telegram is waiting for you to choose a channel.',
  targetSent: 'Your selection was sent to the bot. Continue in the Telegram chat.',
  targetCancelled: 'No target was selected. You can try again.',
  targetUnsupported: 'This Telegram client cannot select a group or channel. Update Telegram, or continue with personal settings. [SETTINGS_MINI_APP_TARGET_UNSUPPORTED]',
  actionsHeading: 'Save or reset', save: 'Save settings', reset: 'Reset to defaults',
  idle: 'Changes are sent only after you choose Save or confirm Reset.', submitting: 'Sending your request to the bot…',
  handedBack: 'Your request was handed to the bot. The Telegram chat will show the final result.',
  sendFailed: 'The request could not be sent from this client. Reopen settings from the bot and try again. [SETTINGS_MINI_APP_SEND_FAILED]',
  tooLarge: 'These settings are too large to send. Shorten the message templates, then try again. [SETTINGS_MINI_APP_TOO_LARGE]',
  confirmTitle: 'Reset all settings?', confirmBody: 'This asks the bot to remove the selected target’s saved settings and restore defaults.',
  cancel: 'Cancel', confirmReset: 'Confirm reset', terminal: 'The bot is the final authority. If the session expired or saving failed, reopen settings from the bot and retry.',
  sample: 'Sample artwork — preview text stays inside this reserved area.'
}

const ja = {
  title: 'Bot 設定', intro: 'すべての設定を確認し、この Telegram チャットへ保存します。',
  loading: '設定を開いています…', ready: '設定を編集できます。',
  invalid: '起動リンクが正しくないため、設定を開けませんでした。Bot に戻って設定を開き直してください。[SETTINGS_MINI_APP_INVALID]',
  noTelegram: 'このページは Telegram 内の Bot から開いてください。Bot に戻り、「設定を開く」をタップしてください。[SETTINGS_MINI_APP_TELEGRAM_REQUIRED]',
  unsupported: 'この Telegram クライアントから設定を送信できません。Telegram を更新し、Bot から設定を開き直してください。[SETTINGS_MINI_APP_UNSUPPORTED]',
  formatHeading: 'メッセージテンプレート', formatHelp: '通常メッセージ、アルバム、インライン結果のテンプレートを編集します。',
  normalTemplate: '通常メッセージ', albumTemplate: 'アルバムメッセージ', inlineTemplate: 'インライン結果', protocolVersion: 'テンプレート版', preview: 'プレビュー',
  optionsHeading: '送信オプション', telegraphHeading: 'Telegraph 情報', telegraphTitle: 'ページタイトル', telegraphAuthor: '作者名', telegraphUrl: '作者 URL',
  targetHeading: 'どの設定を編集しますか？', personalTarget: 'Bot が選んだ対象を編集中です。必要なら別の対象を選べます。',
  group: 'グループを選択', channel: 'チャンネルを選択', targetIdle: '対象の選択は開始されていません。',
  targetPendingGroup: 'Telegram でグループを選択してください。', targetPendingChannel: 'Telegram でチャンネルを選択してください。',
  targetSent: '選択内容を Bot に送りました。Telegram チャットで続けてください。', targetCancelled: '対象は選択されませんでした。もう一度試せます。',
  targetUnsupported: 'この Telegram クライアントではグループやチャンネルを選べません。Telegram を更新するか、個人設定を続けてください。[SETTINGS_MINI_APP_TARGET_UNSUPPORTED]',
  actionsHeading: '保存またはリセット', save: '設定を保存', reset: '初期値に戻す', idle: '「保存」を選ぶかリセットを確認するまで、変更は送信されません。',
  submitting: 'Bot にリクエストを送信しています…', handedBack: 'リクエストを Bot に渡しました。最終結果は Telegram チャットに表示されます。',
  sendFailed: 'このクライアントからリクエストを送信できませんでした。Bot から設定を開き直して再試行してください。[SETTINGS_MINI_APP_SEND_FAILED]',
  tooLarge: '設定が大きすぎて送信できません。メッセージテンプレートを短くして再試行してください。[SETTINGS_MINI_APP_TOO_LARGE]',
  confirmTitle: 'すべての設定をリセットしますか？', confirmBody: '選択した対象の保存済み設定を削除し、初期値へ戻すよう Bot に依頼します。',
  cancel: 'キャンセル', confirmReset: 'リセットを確定', terminal: '最終結果は Bot が判断します。セッション切れや保存失敗の場合は、Bot から設定を開き直してください。',
  sample: 'サンプル作品 — プレビューはこの固定領域内で更新されます。'
}

const zhHans = {
  title: 'Bot 设置', intro: '检查全部设置，然后将其保存回当前 Telegram 聊天。', loading: '正在打开设置…', ready: '设置已可编辑。',
  invalid: '启动链接无效，无法打开设置。请返回 Bot 并重新打开设置。[SETTINGS_MINI_APP_INVALID]',
  noTelegram: '请从 Telegram 内的 Bot 打开此页面。返回 Bot 后点击“打开设置”。[SETTINGS_MINI_APP_TELEGRAM_REQUIRED]',
  unsupported: '当前 Telegram 客户端无法发送设置。请更新 Telegram，再从 Bot 重新打开设置。[SETTINGS_MINI_APP_UNSUPPORTED]',
  formatHeading: '消息模板', formatHelp: '编辑普通消息、媒体组和内联结果所用的模板。', normalTemplate: '普通消息', albumTemplate: '媒体组消息', inlineTemplate: '内联结果', protocolVersion: '模板版本', preview: '预览',
  optionsHeading: '发送选项', telegraphHeading: 'Telegraph 信息', telegraphTitle: '页面标题', telegraphAuthor: '作者名称', telegraphUrl: '作者 URL',
  targetHeading: '编辑谁的设置？', personalTarget: '当前正在编辑 Bot 选定的目标；如有需要，可在此选择其他目标。', group: '选择群组', channel: '选择频道', targetIdle: '当前没有进行目标选择。',
  targetPendingGroup: '请在 Telegram 中选择一个群组。', targetPendingChannel: '请在 Telegram 中选择一个频道。', targetSent: '选择结果已发送给 Bot，请在 Telegram 聊天中继续。', targetCancelled: '没有选择目标，您可以重试。',
  targetUnsupported: '当前 Telegram 客户端不能选择群组或频道。请更新 Telegram，或继续编辑个人设置。[SETTINGS_MINI_APP_TARGET_UNSUPPORTED]',
  actionsHeading: '保存或重置', save: '保存设置', reset: '恢复默认值', idle: '只有点击“保存”或确认重置后，才会发送更改。', submitting: '正在向 Bot 发送请求…',
  handedBack: '请求已交给 Bot；最终结果会显示在 Telegram 聊天中。', sendFailed: '当前客户端未能发送请求。请从 Bot 重新打开设置后再试。[SETTINGS_MINI_APP_SEND_FAILED]',
  tooLarge: '设置内容过大，无法发送。请缩短消息模板后重试。[SETTINGS_MINI_APP_TOO_LARGE]', confirmTitle: '重置全部设置？', confirmBody: '这会请求 Bot 删除所选目标的已保存设置并恢复默认值。', cancel: '取消', confirmReset: '确认重置',
  terminal: '最终结果由 Bot 确认。如会话已过期或保存失败，请从 Bot 重新打开设置后重试。', sample: '示例作品——预览内容会在这个固定区域内更新。'
}

const zhHant = {
  title: 'Bot 設定', intro: '檢查全部設定，然後將其儲存回目前的 Telegram 聊天。', loading: '正在開啟設定…', ready: '設定已可編輯。',
  invalid: '啟動連結無效，無法開啟設定。請返回 Bot 並重新開啟設定。[SETTINGS_MINI_APP_INVALID]',
  noTelegram: '請從 Telegram 內的 Bot 開啟此頁面。返回 Bot 後點擊「開啟設定」。[SETTINGS_MINI_APP_TELEGRAM_REQUIRED]',
  unsupported: '目前 Telegram 用戶端無法傳送設定。請更新 Telegram，再從 Bot 重新開啟設定。[SETTINGS_MINI_APP_UNSUPPORTED]',
  formatHeading: '訊息範本', formatHelp: '編輯一般訊息、媒體群組和行內結果所用的範本。', normalTemplate: '一般訊息', albumTemplate: '媒體群組訊息', inlineTemplate: '行內結果', protocolVersion: '範本版本', preview: '預覽',
  optionsHeading: '傳送選項', telegraphHeading: 'Telegraph 資訊', telegraphTitle: '頁面標題', telegraphAuthor: '作者名稱', telegraphUrl: '作者 URL',
  targetHeading: '編輯誰的設定？', personalTarget: '目前正在編輯 Bot 選定的目標；如有需要，可在此選擇其他目標。', group: '選擇群組', channel: '選擇頻道', targetIdle: '目前沒有進行目標選擇。',
  targetPendingGroup: '請在 Telegram 中選擇一個群組。', targetPendingChannel: '請在 Telegram 中選擇一個頻道。', targetSent: '選擇結果已傳送給 Bot，請在 Telegram 聊天中繼續。', targetCancelled: '沒有選擇目標，您可以重試。',
  targetUnsupported: '目前 Telegram 用戶端不能選擇群組或頻道。請更新 Telegram，或繼續編輯個人設定。[SETTINGS_MINI_APP_TARGET_UNSUPPORTED]',
  actionsHeading: '儲存或重設', save: '儲存設定', reset: '恢復預設值', idle: '只有點擊「儲存」或確認重設後，才會傳送變更。', submitting: '正在向 Bot 傳送請求…',
  handedBack: '請求已交給 Bot；最終結果會顯示在 Telegram 聊天中。', sendFailed: '目前用戶端未能傳送請求。請從 Bot 重新開啟設定後再試。[SETTINGS_MINI_APP_SEND_FAILED]',
  tooLarge: '設定內容過大，無法傳送。請縮短訊息範本後重試。[SETTINGS_MINI_APP_TOO_LARGE]', confirmTitle: '重設全部設定？', confirmBody: '這會請求 Bot 刪除所選目標的已儲存設定並恢復預設值。', cancel: '取消', confirmReset: '確認重設',
  terminal: '最終結果由 Bot 確認。如工作階段已逾期或儲存失敗，請從 Bot 重新開啟設定後重試。', sample: '範例作品——預覽內容會在這個固定區域內更新。'
}

export const COPY = Object.freeze({ en, ja, 'zh-hans': zhHans, 'zh-hant': zhHant })

export const OPTION_LABELS = Object.freeze({
  en: ['Show tags', 'Show description', 'Open button', 'Share button', 'Remove keyboard', 'Remove caption', 'Single album caption', 'Group into albums', 'Album single image', 'Equal album layout', 'Reverse image order', 'Override user settings', 'Send as file only', 'Append original file', 'Append file immediately', 'Extract caption', 'Caption above media', 'Show artwork ID', 'Automatic spoiler'],
  ja: ['タグを表示', '説明を表示', '開くボタン', '共有ボタン', 'キーボードを削除', 'キャプションを削除', 'アルバムの単一キャプション', 'アルバムにまとめる', '1 枚でもアルバム', '均等なアルバム配置', '画像順を反転', 'ユーザー設定を上書き', 'ファイルのみで送信', '元ファイルを追加', 'ファイルをすぐ追加', 'キャプションを抽出', 'メディア上部にキャプション', '作品 ID を表示', '自動スポイラー'],
  'zh-hans': ['显示标签', '显示描述', '显示打开按钮', '显示分享按钮', '移除键盘', '移除说明文字', '媒体组单一说明', '合并为媒体组', '单张也使用媒体组', '媒体组均等布局', '反转图片顺序', '覆盖用户设置', '仅以文件发送', '附加原文件', '立即附加文件', '提取说明文字', '说明文字置于媒体上方', '显示作品 ID', '自动剧透'],
  'zh-hant': ['顯示標籤', '顯示描述', '顯示開啟按鈕', '顯示分享按鈕', '移除鍵盤', '移除說明文字', '媒體群組單一說明', '合併為媒體群組', '單張也使用媒體群組', '媒體群組均等排列', '反轉圖片順序', '覆蓋使用者設定', '僅以檔案傳送', '附加原始檔', '立即附加檔案', '擷取說明文字', '說明文字置於媒體上方', '顯示作品 ID', '自動劇透']
})

export function copyFor(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) throw new Error(`Unsupported locale: ${locale}`)
  return COPY[locale]
}

export function normalizeSettings(settings, targetType = 'private') {
  const normalized = cloneSettings(settings)
  const values = normalized.default
  if (values.single_caption || values.album_one || values.album_equal) values.album = true
  if (values.remove_keyboard) {
    values.open = false
    values.share = false
  }
  if (values.append_file_immediate) values.append_file = true
  if (values.append_file) values.asfile = false
  if (values.asfile) {
    values.album = false
    values.album_one = false
    values.album_equal = false
    values.single_caption = false
  }
  if (targetType === 'channel') values.share = false
  return normalized
}

export function createActionController({ bridge, session, onState = () => {} }) {
  let pending = false
  async function handoff(kind, serialized) {
    if (pending) return false
    if (!serialized.ok) {
      onState(kind, serialized.reason === 'too_large' ? 'tooLarge' : 'sendFailed')
      return false
    }
    pending = true
    onState(kind, 'submitting')
    try {
      bridge.sendData(serialized.data)
      onState(kind, 'handedBack')
      return true
    } catch (error) {
      pending = false
      onState(kind, 'sendFailed')
      return false
    }
  }
  return {
    get pending() { return pending },
    save(settings) { return handoff('submit', serializeSave(session, settings)) },
    reset() { return handoff('submit', serializeReset(session)) },
    async requestTarget(kind, preparedId) {
      if (pending) return false
      if (!bridge.canRequestChat) {
        onState('target', 'targetUnsupported')
        return false
      }
      pending = true
      onState('target', kind === 'group' ? 'targetPendingGroup' : 'targetPendingChannel')
      try {
        const selected = await bridge.requestChat(preparedId)
        if (!selected) {
          pending = false
          onState('target', 'targetCancelled')
          return false
        }
        onState('target', 'targetSent')
        bridge.close()
        return true
      } catch (error) {
        pending = false
        onState('target', 'targetCancelled')
        return false
      }
    }
  }
}

export function renderTemplatePreview(template, sample) {
  return String(template || '')
    .replaceAll('%title%', sample)
    .replaceAll('%url%', 'https://www.pixiv.net/artworks/67953985')
    .replaceAll('%author_name%', 'Pixiv artist')
    .replaceAll('%author_url%', 'https://www.pixiv.net/users/3654183')
    .replaceAll('%id%', '67953985')
    .replaceAll('%tags%', '#illustration #pixiv')
    .replaceAll('%description%', sample)
}
