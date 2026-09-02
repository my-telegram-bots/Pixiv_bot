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
    'target-selector', 'action-section', 'terminal-guidance', 'dialog-layer'
  ]) assert.match(component, new RegExp(region))
  assert.doesNotMatch(component, /v-if|v-else|v-show/)
})

test('focus order controls remain present and invalid actions are disabled', () => {
  assert.match(component, /:disabled="!canEdit"/)
  assert.match(component, /@click="save"/)
  assert.match(component, /@click="confirmReset = true"/)
  assert.match(component, /@click="chooseTarget\('group'\)"/)
  assert.match(component, /@click="chooseTarget\('channel'\)"/)
})

test('component has no identity input or browser persistence API', () => {
  assert.doesNotMatch(component, /chat_id|user_id|sessionStorage|localStorage/)
  assert.doesNotMatch(component, /type="number"/)
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
