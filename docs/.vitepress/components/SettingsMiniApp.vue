<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import {
  BOOLEAN_KEYS,
  cloneSettings,
  consumeInitialFragment
} from '../mini-app/protocol.js'
import { createTelegramBridge } from '../mini-app/telegram-bridge.js'
import {
  OPTION_LABELS,
  copyFor,
  createActionController,
  normalizeSettings,
  renderTemplatePreview
} from '../mini-app/settings-surface.js'

const props = defineProps({
  locale: { type: String, required: true }
})

const text = copyFor(props.locale)
const labels = Object.freeze(Object.fromEntries(
  BOOLEAN_KEYS.map((key, index) => [key, OPTION_LABELS[props.locale][index]])
))
const launchState = ref('loading')
const submissionState = ref('idle')
const targetState = ref('targetIdle')
const confirmReset = ref(false)
const settings = reactive({ format: {}, default: {} })
const initial = ref(null)
const controller = ref(null)
const activeTemplate = ref('message')

const templateTabs = Object.freeze([
  ['message', 'normalTemplate'],
  ['mediagroup_message', 'albumTemplate'],
  ['inline', 'inlineTemplate']
])

const canEdit = computed(() => launchState.value === 'ready' && !controller.value?.pending)
const launchMessage = computed(() => text[launchState.value])
const submissionMessage = computed(() => text[submissionState.value])
const targetMessage = computed(() => text[targetState.value])
const preview = computed(() => renderTemplatePreview(
  settings.format[activeTemplate.value],
  text.sample
))

function applyNormalized() {
  const normalized = normalizeSettings(cloneSettings(settings))
  Object.assign(settings.format, normalized.format)
  Object.assign(settings.default, normalized.default)
}

function onBooleanChange() {
  applyNormalized()
}

async function save() {
  applyNormalized()
  await controller.value?.save(cloneSettings(settings))
}

async function reset() {
  confirmReset.value = false
  await controller.value?.reset()
}

async function chooseTarget(kind) {
  await controller.value?.requestTarget(kind, initial.value.request_chat[kind])
}

onMounted(async () => {
  const parsed = consumeInitialFragment(window)
  const bridge = createTelegramBridge()
  if (!parsed.ok) {
    launchState.value = 'invalid'
    return
  }
  initial.value = parsed.value
  Object.assign(settings.format, parsed.value.settings.format)
  Object.assign(settings.default, parsed.value.settings.default)
  for (const key of BOOLEAN_KEYS) {
    if (!Object.hasOwn(settings.default, key)) settings.default[key] = false
  }
  settings.format.version ||= 'v1'
  if (!bridge.available) {
    launchState.value = 'noTelegram'
    return
  }
  if (!bridge.canSendData) {
    launchState.value = 'unsupported'
    bridge.ready()
    return
  }
  controller.value = createActionController({
    bridge,
    session: parsed.value.session,
    onState(region, state) {
      if (region === 'target') targetState.value = state
      else submissionState.value = state
    }
  })
  launchState.value = 'ready'
  await nextTick()
  bridge.ready()
})
</script>

<template>
  <main class="settings-mini-app" :data-launch-state="launchState">
    <header class="mini-app-header">
      <h1>{{ text.title }}</h1>
      <p>{{ text.intro }}</p>
    </header>

    <section class="surface-status launch-status" aria-live="polite">
      <p>{{ launchMessage }}</p>
    </section>

    <fieldset class="surface-card format-editor" :disabled="!canEdit">
      <legend>{{ text.formatHeading }}</legend>
      <p class="section-help">{{ text.formatHelp }}</p>
      <div class="template-tabs" role="tablist" :aria-label="text.formatHeading">
        <button
          v-for="([key, label]) in templateTabs"
          :key="key"
          type="button"
          role="tab"
          :aria-selected="activeTemplate === key"
          @click="activeTemplate = key"
        >{{ text[label] }}</button>
      </div>
      <label class="template-field">
        <span>{{ text[templateTabs.find(([key]) => key === activeTemplate)[1]] }}</span>
        <textarea v-model="settings.format[activeTemplate]" rows="7" spellcheck="false" />
      </label>
      <label class="version-field">
        <span>{{ text.protocolVersion }}</span>
        <select v-model="settings.format.version">
          <option value="v1">v1</option>
        </select>
      </label>
      <div class="preview-slot" aria-live="polite">
        <strong>{{ text.preview }}</strong>
        <pre>{{ preview }}</pre>
      </div>
    </fieldset>

    <fieldset class="surface-card options-editor" :disabled="!canEdit">
      <legend>{{ text.optionsHeading }}</legend>
      <div class="option-grid">
        <label v-for="key in BOOLEAN_KEYS" :key="key" class="option-row">
          <input v-model="settings.default[key]" type="checkbox" @change="onBooleanChange">
          <span>{{ labels[key] }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset class="surface-card telegraph-editor" :disabled="!canEdit">
      <legend>{{ text.telegraphHeading }}</legend>
      <label><span>{{ text.telegraphTitle }}</span><input v-model="settings.default.telegraph_title" type="text" maxlength="255"></label>
      <label><span>{{ text.telegraphAuthor }}</span><input v-model="settings.default.telegraph_author_name" type="text" maxlength="127"></label>
      <label><span>{{ text.telegraphUrl }}</span><input v-model="settings.default.telegraph_author_url" type="url" maxlength="511" inputmode="url"></label>
    </fieldset>

    <section class="surface-card target-selector" aria-labelledby="target-heading">
      <h2 id="target-heading">{{ text.targetHeading }}</h2>
      <p>{{ text.personalTarget }}</p>
      <div class="button-row">
        <button type="button" :disabled="!canEdit" @click="chooseTarget('group')">{{ text.group }}</button>
        <button type="button" :disabled="!canEdit" @click="chooseTarget('channel')">{{ text.channel }}</button>
      </div>
      <div class="surface-status target-status" aria-live="polite">
        <p>{{ targetMessage }}</p>
      </div>
    </section>

    <section class="surface-card action-section" aria-labelledby="actions-heading">
      <h2 id="actions-heading">{{ text.actionsHeading }}</h2>
      <div class="button-row action-row">
        <button class="primary" type="button" :disabled="!canEdit" @click="save">{{ text.save }}</button>
        <button class="danger" type="button" :disabled="!canEdit" @click="confirmReset = true">{{ text.reset }}</button>
      </div>
      <div class="surface-status submission-status" aria-live="polite">
        <p>{{ submissionMessage }}</p>
      </div>
    </section>

    <section class="surface-status terminal-guidance">
      <p>{{ text.terminal }}</p>
    </section>

    <div class="dialog-layer" :data-open="confirmReset">
      <div class="dialog-backdrop" aria-hidden="true" />
      <section
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        :aria-hidden="!confirmReset"
        :aria-labelledby="confirmReset ? 'reset-title' : undefined"
      >
        <h2 id="reset-title">{{ text.confirmTitle }}</h2>
        <p>{{ text.confirmBody }}</p>
        <div class="button-row">
          <button type="button" @click="confirmReset = false">{{ text.cancel }}</button>
          <button class="danger" type="button" @click="reset">{{ text.confirmReset }}</button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings-mini-app {
  --surface-bg: var(--tg-theme-secondary-bg-color, var(--vp-c-bg-soft));
  --surface-text: var(--tg-theme-text-color, var(--vp-c-text-1));
  --surface-muted: var(--tg-theme-hint-color, var(--vp-c-text-2));
  --surface-accent: var(--tg-theme-button-color, var(--vp-c-brand-1));
  --surface-accent-text: var(--tg-theme-button-text-color, #fff);
  color: var(--surface-text);
  max-width: 920px;
  margin: 0 auto;
  padding: max(16px, var(--tg-safe-area-inset-top, 0px))
    max(16px, var(--tg-safe-area-inset-right, 0px))
    max(24px, var(--tg-safe-area-inset-bottom, 0px))
    max(16px, var(--tg-safe-area-inset-left, 0px));
  min-height: var(--tg-viewport-stable-height, 100vh);
  box-sizing: border-box;
}
.mini-app-header { min-height: 112px; }
.mini-app-header h1 { margin: 0 0 8px; font-size: clamp(1.75rem, 5vw, 2.5rem); }
.mini-app-header p, .section-help, .target-selector > p { color: var(--surface-muted); }
.surface-card { margin: 16px 0; padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 14px; background: var(--surface-bg); box-sizing: border-box; }
fieldset.surface-card { min-inline-size: 0; }
.surface-card legend, .surface-card h2 { font-size: 1.25rem; font-weight: 700; }
.surface-card h2 { margin: 0 0 8px; }
.surface-status { display: grid; align-items: center; box-sizing: border-box; border-radius: 10px; background: var(--surface-bg); padding: 12px 14px; }
.surface-status p { margin: 0; }
.launch-status { min-height: 76px; }
.target-status, .submission-status { min-height: 88px; margin-top: 12px; }
.terminal-guidance { min-height: 96px; margin-top: 16px; }
.format-editor { min-height: 620px; }
.template-tabs, .button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.template-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 16px 0; }
button, input, textarea, select { font: inherit; }
button { min-height: 46px; border: 1px solid var(--vp-c-divider); border-radius: 9px; padding: 8px 12px; color: var(--surface-text); background: var(--tg-theme-bg-color, var(--vp-c-bg)); cursor: pointer; }
button[aria-selected="true"], button.primary { border-color: var(--surface-accent); color: var(--surface-accent-text); background: var(--surface-accent); }
button.danger { border-color: var(--vp-c-danger-1); color: var(--vp-c-danger-1); }
button:disabled { cursor: not-allowed; opacity: .55; }
.template-field, .telegraph-editor label, .version-field { display: grid; gap: 7px; margin: 12px 0; }
textarea, input[type="text"], input[type="url"], select { width: 100%; color: var(--surface-text); background: var(--tg-theme-bg-color, var(--vp-c-bg)); border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 10px; box-sizing: border-box; }
textarea { min-height: 168px; resize: vertical; }
.version-field { max-width: 180px; }
.preview-slot { min-height: 168px; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: auto; }
.preview-slot pre { min-height: 108px; margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.options-editor { min-height: 544px; }
.option-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 20px; }
.option-row { display: flex; align-items: center; gap: 10px; min-height: 44px; }
.option-row input { width: 20px; height: 20px; flex: 0 0 auto; }
.telegraph-editor { min-height: 326px; }
.target-selector { min-height: 292px; }
.action-section { min-height: 236px; }
.dialog-layer { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; pointer-events: none; visibility: hidden; }
.dialog-layer[data-open="true"] { pointer-events: auto; visibility: visible; }
.dialog-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .55); }
.confirm-dialog { position: relative; width: min(420px, calc(100vw - 32px)); min-height: 236px; box-sizing: border-box; padding: 24px; border-radius: 14px; background: var(--tg-theme-bg-color, var(--vp-c-bg)); }
.confirm-dialog h2 { margin-top: 0; }
@media (max-width: 640px) {
  .settings-mini-app { padding-inline: max(12px, var(--tg-safe-area-inset-left, 0px)); }
  .template-tabs, .option-grid { grid-template-columns: 1fr; }
  .format-editor { min-height: 760px; }
  .options-editor { min-height: 972px; }
  .target-selector { min-height: 316px; }
  .surface-card { padding: 16px; }
}
</style>
