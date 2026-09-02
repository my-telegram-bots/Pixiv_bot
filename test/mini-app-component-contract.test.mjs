import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const component = readFileSync(
  new URL('../docs/.vitepress/components/SettingsMiniApp.vue', import.meta.url),
  'utf8'
)
const japaneseLegacyComponent = readFileSync(
  new URL('../docs/.vitepress/components/LegacySettingsJa.vue', import.meta.url),
  'utf8'
)
const vitePressConfig = readFileSync(
  new URL('../docs/.vitepress/config.mts', import.meta.url),
  'utf8'
)

test('all stable geometry regions remain mounted across state changes', () => {
  for (const region of [
    'launch-status', 'format-editor', 'options-editor', 'telegraph-editor',
    'target-selector', 'legacy-transfer-section', 'action-section',
    'terminal-guidance', 'dialog-layer',
    'template-market-layer'
  ]) assert.match(component, new RegExp(region))
  assert.doesNotMatch(component, /v-if|v-else|v-show/)
})

test('focus order controls remain present and invalid actions are disabled', () => {
  assert.match(component, /:disabled="!canEdit"/)
  assert.match(component, /@click="save"/)
  assert.match(component, /@click="confirmReset = true"/)
  assert.match(component, /@click="chooseTarget\('group'\)"/)
  assert.match(component, /@click="chooseTarget\('channel'\)"/)
  assert.match(component, /@click="cancelTargetSelection"/)
  assert.match(component, /:disabled="!canCancelTarget"/)
})

test('component has no identity input or browser persistence API', () => {
  assert.doesNotMatch(component, /chat_id|user_id|sessionStorage|localStorage/)
  assert.doesNotMatch(component, /type="number"/)
})

test('Mini App preserves the legacy Base64 copy and destination-chat handoff', () => {
  const legacy = component.indexOf('class="surface-card legacy-transfer-section"')
  const actions = component.indexOf('class="surface-card action-section"')
  assert.ok(legacy > 0)
  assert.ok(legacy < actions, 'legacy transfer must precede Mini App save/reset')
  assert.match(component, /:value="legacyPayload"/)
  assert.match(component, /readonly/)
  assert.match(component, /@click="copyLegacyExport"/)
  assert.match(component, /:href="canTransferLegacy \? legacyShareUrl : undefined"/)
  assert.match(component, /target="_tshare"/)
  assert.match(component, /class="surface-status legacy-transfer-status"/)
})

test('Mini App keeps the original visual live-preview workflow', () => {
  assert.match(component, /class="template-market-layer"/)
  assert.match(component, /@click="confirmTemplateChoice"/)
  assert.match(component, /@click="closeTemplateMarket"/)
  assert.doesNotMatch(component, /@click="applyTemplate\(preset\.template\)"/)
  assert.match(component, /src="\/img\/67953985_p0\.jpg"/)
  assert.match(component, /class="artwork-preview-card"/)
  assert.match(component, /class="preview-message" v-html="previewHtml"/)
  assert.match(component, /settings\.format\[activeTemplate\.value\]/)
  assert.doesNotMatch(component, /<pre>\{\{ preview \}\}<\/pre>/)
  const previewCss = component.match(/\.preview-slot\s*\{([^}]*)\}/)?.[1] || ''
  assert.doesNotMatch(previewCss, /(?:^|;)\s*height\s*:|overflow\s*:\s*(?:auto|scroll|hidden)/)
})

test('target context and current-settings loading precede every editor', () => {
  const target = component.indexOf('class="surface-card target-selector"')
  assert.ok(target > 0)
  for (const editor of ['format-editor', 'options-editor', 'telegraph-editor']) {
    assert.ok(target < component.indexOf(editor), `${editor} must follow target selection`)
  }
  assert.match(component, /class="target-avatar" :src="targetAvatarUrl"/)
  assert.match(component, /\{\{ target\.name \}\}/)
  assert.match(component, /\{\{ targetTypeLabel \}\}/)
  assert.match(component, /\{\{ targetHandle \}\}/)
  assert.match(component, /@error="onTargetAvatarError"/)
})

test('delivery behavior is grouped and mutually exclusive in the UI', () => {
  for (const group of [
    'file-delivery-group', 'album-options-group', 'caption-options-group',
    'keyboard-options-group', 'content-options-group', 'scope-options-group'
  ]) assert.match(component, new RegExp(`class="option-group ${group}`))
  assert.match(component, /type="radio"/)
  assert.match(component, /name="file-delivery"/)
  assert.match(component, /v-model="fileDeliveryMode"/)
  assert.match(component, /key !== 'remove_keyboard' && settings\.default\.remove_keyboard/)
  assert.match(component, /key !== 'remove_caption' && settings\.default\.remove_caption/)
  assert.match(component, /key !== 'album' && !settings\.default\.album/)
  assert.doesNotMatch(component, /v-for="key in BOOLEAN_KEYS"/)
})

test('Mini App does not silently reinterpret server default templates as v1', () => {
  assert.match(component, /settings\.format\.version \|\|= ''/)
  assert.match(component, /delete outbound\.format\.version/)
  assert.doesNotMatch(component, /settings\.format\.version \|\|= 'v1'/)
})

test('Japanese locale exposes guide, legacy settings, privacy, and Mini App routes', () => {
  for (const route of ['/ja/', '/ja/s', '/ja/privacy']) {
    assert.match(vitePressConfig, new RegExp(`link: '${route.replace('/', '\\/')}'`))
  }
  assert.match(japaneseLegacyComponent, /メッセージ形式の設定/)
  assert.match(japaneseLegacyComponent, /変更を保存/)
  assert.match(japaneseLegacyComponent, /Bot の <code>\/s<\/code> コマンドからこのページを開き直してください/)
  assert.match(japaneseLegacyComponent, /current_templates\.inline = setting\.format\.inline/)
})
