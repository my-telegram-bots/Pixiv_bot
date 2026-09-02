<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  BOOLEAN_KEYS,
  cloneSettings,
  consumeInitialFragment
} from '../mini-app/protocol.js'
import { createTelegramBridge } from '../mini-app/telegram-bridge.js'
import {
  copyLegacyPayload,
  encodeLegacySettings,
  legacyTelegramShareUrl
} from '../mini-app/legacy-export.js'
import {
  DEFAULT_PREVIEW_FORMATS,
  DEFAULT_TEMPLATE_CHOICES,
  FILE_DELIVERY_MODES,
  OPTION_LABELS,
  applyFileDeliveryMode,
  copyFor,
  createActionController,
  fileDeliveryModeFor,
  normalizeSettings,
  renderTemplatePreview,
  validateEditableSettings
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
const busy = ref(false)
const confirmReset = ref(false)
const templateMarketOpen = ref(false)
const selectedTemplateIndex = ref(0)
const templateMarketTrigger = ref(null)
const presetButtons = ref([])
const legacyPayloadField = ref(null)
const legacyTransferState = ref('legacyIdle')
const legacyExportTime = ref(0)
const settings = reactive({
  format: { ...DEFAULT_PREVIEW_FORMATS },
  default: {
    tags: true,
    description: true,
    open: true,
    share: true,
    single_caption: true,
    album: true,
    album_one: true,
    show_id: true
  }
})
const initial = ref(null)
const controller = ref(null)
const activeTemplate = ref('message')
const target = reactive({ type: 'private', name: '—', username: '', photo_url: '' })
const targetAvatarUrl = ref(initialsAvatar('•'))

const templateTabs = Object.freeze([
  ['message', 'normalTemplate'],
  ['mediagroup_message', 'albumTemplate'],
  ['inline', 'inlineTemplate']
])
const albumOptions = Object.freeze(['album', 'album_one', 'album_equal', 'single_caption'])
const captionOptions = Object.freeze(['remove_caption', 'caption_above'])
const keyboardOptions = Object.freeze(['remove_keyboard', 'open', 'share'])
const contentOptions = Object.freeze(['tags', 'description', 'show_id', 'auto_spoiler', 'caption_extraction'])
const scopeOptions = Object.freeze(['reverse', 'overwrite'])

const canEdit = computed(() => launchState.value === 'ready' && !busy.value)
const canCancelTarget = computed(() => launchState.value === 'ready' && [
  'targetPendingGroup',
  'targetPendingChannel'
].includes(targetState.value))
const launchMessage = computed(() => text[launchState.value])
const submissionMessage = computed(() => text[submissionState.value])
const targetMessage = computed(() => text[targetState.value])
const legacyTransferMessage = computed(() => text[legacyTransferState.value])
const targetTypeLabel = computed(() => text[`targetType${
  target.type[0].toUpperCase()}${target.type.slice(1)}`])
const targetHandle = computed(() => target.username ? `@${target.username}` : text.usernameUnavailable)
const previewHtml = computed(() => renderTemplatePreview(
  settings.format[activeTemplate.value],
  settings,
  text.sample
))
const presetPreviews = computed(() => DEFAULT_TEMPLATE_CHOICES.map(template => ({
  template,
  html: renderTemplatePreview(template, settings, text.sample)
})))
const fileDeliveryMode = computed({
  get: () => fileDeliveryModeFor(settings.default),
  set(mode) {
    applyFileDeliveryMode(settings.default, mode)
    applyNormalized()
  }
})
const legacyExport = computed(() => encodeLegacySettings(
  outboundSettings(),
  legacyExportTime.value
))
const legacyPayload = computed(() => legacyExport.value.ok ? legacyExport.value.data : '')
const legacyShareUrl = computed(() => legacyTelegramShareUrl(legacyPayload.value))
const canTransferLegacy = computed(() => canEdit.value && legacyExport.value.ok)

function applyNormalized() {
  const normalized = normalizeSettings(cloneSettings(settings))
  Object.assign(settings.format, normalized.format)
  Object.assign(settings.default, normalized.default)
}

function outboundSettings() {
  const outbound = cloneSettings(settings)
  if (!outbound.format.version) delete outbound.format.version
  return outbound
}

function onBooleanChange() {
  applyNormalized()
}

function applyTemplate(template) {
  settings.format[activeTemplate.value] = template
  settings.format.version = 'v1'
}

function initialsAvatar(name) {
  const initials = Array.from(String(name).trim()).slice(0, 2).join('').toUpperCase() || '•'
  const escaped = initials.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character])
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#d45a9e"/><text x="48" y="58" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="white">${escaped}</text></svg>`)}`
}

function safeAvatarUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : ''
  } catch (error) {
    return ''
  }
}

function setTargetAvatar(telegramUserPhoto = '') {
  const preferred = target.type === 'private' ? safeAvatarUrl(telegramUserPhoto) : ''
  targetAvatarUrl.value = preferred || safeAvatarUrl(target.photo_url) || initialsAvatar(target.name)
}

function onTargetAvatarError() {
  targetAvatarUrl.value = initialsAvatar(target.name)
}

async function openTemplateMarket() {
  const current = settings.format[activeTemplate.value]
  const exact = DEFAULT_TEMPLATE_CHOICES.indexOf(current)
  selectedTemplateIndex.value = exact >= 0 ? exact : 0
  templateMarketOpen.value = true
  await nextTick()
  presetButtons.value[selectedTemplateIndex.value]?.focus()
}

function selectTemplate(index) {
  selectedTemplateIndex.value = index
}

async function closeTemplateMarket() {
  templateMarketOpen.value = false
  await nextTick()
  templateMarketTrigger.value?.focus()
}

async function confirmTemplateChoice() {
  applyTemplate(DEFAULT_TEMPLATE_CHOICES[selectedTemplateIndex.value])
  await closeTemplateMarket()
}

function onWindowKeydown(event) {
  if (event.key === 'Escape' && templateMarketOpen.value) closeTemplateMarket()
}

async function save() {
  applyNormalized()
  const outbound = outboundSettings()
  if (!validateEditableSettings(outbound)) {
    submissionState.value = 'validationFailed'
    return
  }
  await controller.value?.save(outbound)
}

async function reset() {
  confirmReset.value = false
  await controller.value?.reset()
}

async function chooseTarget(kind) {
  await controller.value?.requestTarget(kind, initial.value.request_chat[kind])
}

function cancelTargetSelection() {
  controller.value?.cancelTarget()
}

function selectLegacyPayload() {
  legacyPayloadField.value?.select()
}

async function copyLegacyExport() {
  if (!canTransferLegacy.value) return
  const copied = await copyLegacyPayload(legacyPayload.value)
  legacyTransferState.value = copied ? 'legacyCopied' : 'legacyCopyFailed'
  if (!copied) {
    await nextTick()
    selectLegacyPayload()
  }
}

function beginLegacyShare(event) {
  if (!canTransferLegacy.value) {
    event.preventDefault()
    return
  }
  legacyTransferState.value = 'legacySharing'
}

watch(legacyPayload, (payload, previous) => {
  if (previous && payload !== previous) legacyTransferState.value = 'legacyIdle'
})

onMounted(async () => {
  legacyExportTime.value = Date.now()
  const parsed = consumeInitialFragment(window)
  const bridge = createTelegramBridge()
  if (!parsed.ok) {
    launchState.value = 'invalid'
    return
  }
  initial.value = parsed.value
  Object.assign(target, parsed.value.target)
  for (const key of Object.keys(settings.format)) delete settings.format[key]
  for (const key of Object.keys(settings.default)) delete settings.default[key]
  Object.assign(settings.format, parsed.value.settings.format)
  Object.assign(settings.default, parsed.value.settings.default)
  for (const key of BOOLEAN_KEYS) {
    if (!Object.hasOwn(settings.default, key)) settings.default[key] = false
  }
  settings.format.version ||= ''
  applyNormalized()
  setTargetAvatar(bridge.currentUserPhotoUrl)
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
      busy.value = ['submitting', 'handedBack', 'targetPendingGroup',
        'targetPendingChannel', 'targetSent'].includes(state)
    }
  })
  launchState.value = 'ready'
  await nextTick()
  bridge.ready()
  window.addEventListener('keydown', onWindowKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
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

    <section class="surface-card target-selector" aria-labelledby="target-heading">
      <h2 id="target-heading">{{ text.targetHeading }}</h2>
      <div class="target-identity">
        <img class="target-avatar" :src="targetAvatarUrl" :alt="target.name" @error="onTargetAvatarError">
        <div class="target-copy">
          <strong>{{ target.name }}</strong>
          <span>{{ targetTypeLabel }}</span>
          <span>{{ targetHandle }}</span>
        </div>
      </div>
      <p>{{ text.personalTarget }}</p>
      <div class="button-row target-actions">
        <button type="button" :disabled="!canEdit" @click="chooseTarget('group')">{{ text.group }}</button>
        <button type="button" :disabled="!canEdit" @click="chooseTarget('channel')">{{ text.channel }}</button>
        <button type="button" :disabled="!canCancelTarget" @click="cancelTargetSelection">{{ text.continueEditing }}</button>
      </div>
      <div class="surface-status target-status" aria-live="polite">
        <p>{{ targetMessage }}</p>
      </div>
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
      <button ref="templateMarketTrigger" class="template-market-trigger" type="button" @click="openTemplateMarket">{{ text.openTemplateMarket }}</button>
      <label class="template-field">
        <span>{{ text[templateTabs.find(([key]) => key === activeTemplate)[1]] }}</span>
        <textarea v-model="settings.format[activeTemplate]" rows="7" spellcheck="false" />
      </label>
      <label class="version-field">
        <span>{{ text.protocolVersion }}</span>
        <select v-model="settings.format.version">
          <option value="">{{ text.protocolAutomatic }}</option>
          <option value="v1">v1</option>
        </select>
      </label>
      <div class="preview-slot" aria-live="polite">
        <strong>{{ text.preview }}</strong>
        <article class="artwork-preview-card">
          <img src="/img/67953985_p0.jpg" :alt="text.previewImageAlt">
          <div class="preview-message" v-html="previewHtml" />
        </article>
      </div>
    </fieldset>

    <fieldset class="surface-card options-editor" :disabled="!canEdit">
      <legend>{{ text.optionsHeading }}</legend>
      <section class="option-group file-delivery-group" :aria-labelledby="'file-delivery-heading'">
        <h3 id="file-delivery-heading">{{ text.fileDeliveryHeading }}</h3>
        <div class="choice-grid">
          <label v-for="mode in FILE_DELIVERY_MODES" :key="mode" class="choice-card">
            <input v-model="fileDeliveryMode" type="radio" name="file-delivery" :value="mode">
            <span>{{ text[mode] }}</span>
          </label>
        </div>
      </section>
      <section class="option-group album-options-group" :aria-labelledby="'album-options-heading'">
        <h3 id="album-options-heading">{{ text.albumOptionsHeading }}</h3>
        <div class="option-grid">
          <label v-for="key in albumOptions" :key="key" class="option-row">
            <input v-model="settings.default[key]" type="checkbox" :disabled="!canEdit || (key !== 'album' && !settings.default.album)" @change="onBooleanChange">
            <span>{{ labels[key] }}</span>
          </label>
        </div>
      </section>
      <section class="option-group caption-options-group" :aria-labelledby="'caption-options-heading'">
        <h3 id="caption-options-heading">{{ text.captionOptionsHeading }}</h3>
        <div class="option-grid">
          <label v-for="key in captionOptions" :key="key" class="option-row">
            <input v-model="settings.default[key]" type="checkbox" :disabled="!canEdit || (key !== 'remove_caption' && settings.default.remove_caption)" @change="onBooleanChange">
            <span>{{ labels[key] }}</span>
          </label>
        </div>
      </section>
      <section class="option-group keyboard-options-group" :aria-labelledby="'keyboard-options-heading'">
        <h3 id="keyboard-options-heading">{{ text.keyboardOptionsHeading }}</h3>
        <div class="option-grid">
          <label v-for="key in keyboardOptions" :key="key" class="option-row">
            <input v-model="settings.default[key]" type="checkbox" :disabled="!canEdit || (key !== 'remove_keyboard' && settings.default.remove_keyboard)" @change="onBooleanChange">
            <span>{{ labels[key] }}</span>
          </label>
        </div>
      </section>
      <section class="option-group content-options-group" :aria-labelledby="'content-options-heading'">
        <h3 id="content-options-heading">{{ text.contentOptionsHeading }}</h3>
        <div class="option-grid">
          <label v-for="key in contentOptions" :key="key" class="option-row">
            <input v-model="settings.default[key]" type="checkbox" @change="onBooleanChange">
            <span>{{ labels[key] }}</span>
          </label>
        </div>
      </section>
      <section class="option-group scope-options-group" :aria-labelledby="'scope-options-heading'">
        <h3 id="scope-options-heading">{{ text.scopeOptionsHeading }}</h3>
        <div class="option-grid">
          <label v-for="key in scopeOptions" :key="key" class="option-row">
            <input v-model="settings.default[key]" type="checkbox" @change="onBooleanChange">
            <span>{{ labels[key] }}</span>
          </label>
        </div>
      </section>
    </fieldset>

    <fieldset class="surface-card telegraph-editor" :disabled="!canEdit">
      <legend>{{ text.telegraphHeading }}</legend>
      <label><span>{{ text.telegraphTitle }}</span><input v-model="settings.default.telegraph_title" type="text" maxlength="255" :aria-invalid="submissionState === 'validationFailed'"></label>
      <label><span>{{ text.telegraphAuthor }}</span><input v-model="settings.default.telegraph_author_name" type="text" maxlength="127" :aria-invalid="submissionState === 'validationFailed'"></label>
      <label><span>{{ text.telegraphUrl }}</span><input v-model="settings.default.telegraph_author_url" type="url" maxlength="511" inputmode="url" :aria-invalid="submissionState === 'validationFailed'"></label>
    </fieldset>

    <section class="surface-card legacy-transfer-section" aria-labelledby="legacy-transfer-heading">
      <h2 id="legacy-transfer-heading">{{ text.legacyHeading }}</h2>
      <p class="section-help">{{ text.legacyHelp }}</p>
      <label class="legacy-payload-field">
        <span>{{ text.legacyPayloadLabel }}</span>
        <textarea
          ref="legacyPayloadField"
          :value="legacyPayload"
          rows="5"
          readonly
          spellcheck="false"
          @click="selectLegacyPayload"
          @focus="selectLegacyPayload"
        />
      </label>
      <div class="button-row legacy-transfer-actions">
        <button type="button" :disabled="!canTransferLegacy" @click="copyLegacyExport">{{ text.legacyCopy }}</button>
        <a
          class="button-link primary"
          :href="canTransferLegacy ? legacyShareUrl : undefined"
          :aria-disabled="!canTransferLegacy"
          :tabindex="canTransferLegacy ? 0 : -1"
          target="_tshare"
          @click="beginLegacyShare"
        >{{ text.legacySend }}</a>
      </div>
      <div class="surface-status legacy-transfer-status" aria-live="polite">
        <p>{{ legacyTransferMessage }}</p>
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

    <div class="template-market-layer" :data-open="templateMarketOpen">
      <div class="dialog-backdrop" aria-hidden="true" />
      <section
        class="template-market-dialog"
        role="dialog"
        aria-modal="true"
        :aria-hidden="!templateMarketOpen"
        :aria-labelledby="templateMarketOpen ? 'template-market-title' : undefined"
      >
        <h2 id="template-market-title">{{ text.templateMarketTitle }}</h2>
        <p>{{ text.templateMarketHelp }}</p>
        <div class="preset-gallery" role="listbox" :aria-label="text.presetHeading">
          <button
            v-for="(preset, index) in presetPreviews"
            :key="preset.template"
            ref="presetButtons"
            type="button"
            role="option"
            :aria-selected="selectedTemplateIndex === index"
            :aria-label="`${text.presetHeading} ${index + 1}`"
            @click="selectTemplate(index)"
          ><span v-html="preset.html" /></button>
        </div>
        <div class="button-row template-market-actions">
          <button type="button" @click="closeTemplateMarket">{{ text.cancel }}</button>
          <button class="primary" type="button" @click="confirmTemplateChoice">{{ text.templateMarketApply }}</button>
        </div>
      </section>
    </div>

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
.format-editor { min-height: 750px; }
.template-tabs, .button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.template-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 16px 0; }
button, input, textarea, select { font: inherit; }
button, .button-link { min-height: 46px; border: 1px solid var(--vp-c-divider); border-radius: 9px; padding: 8px 12px; color: var(--surface-text); background: var(--tg-theme-bg-color, var(--vp-c-bg)); cursor: pointer; box-sizing: border-box; }
.button-link { display: grid; place-items: center; text-align: center; text-decoration: none; }
button[aria-selected="true"], button.primary, .button-link.primary { border-color: var(--surface-accent); color: var(--surface-accent-text); background: var(--surface-accent); }
button.danger { border-color: var(--vp-c-danger-1); color: var(--vp-c-danger-1); }
button:disabled, .button-link[aria-disabled="true"] { cursor: not-allowed; opacity: .55; }
.template-field, .telegraph-editor label, .version-field { display: grid; gap: 7px; margin: 12px 0; }
textarea, input[type="text"], input[type="url"], select { width: 100%; color: var(--surface-text); background: var(--tg-theme-bg-color, var(--vp-c-bg)); border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 10px; box-sizing: border-box; }
textarea { min-height: 168px; resize: vertical; }
.version-field { max-width: 180px; }
.template-market-trigger { width: 100%; margin: 0 0 12px; }
.preset-gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-content: start; }
.preset-gallery button { min-height: 112px; padding: 10px; text-align: left; }
.preset-gallery button[aria-selected="true"] { border-color: var(--surface-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--surface-accent) 30%, transparent); }
.preset-gallery :deep(p), .preview-message :deep(p) { margin: 0 0 7px; }
.preset-gallery :deep(.preview-link), .preview-message :deep(.preview-link) { color: var(--tg-theme-link-color, var(--vp-c-brand-1)); text-decoration: underline; }
.preview-slot { min-height: 330px; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; box-sizing: border-box; }
.artwork-preview-card { width: min(360px, 100%); min-height: 270px; margin: 10px auto 0; border-radius: 12px; overflow: hidden; background: var(--tg-theme-bg-color, var(--vp-c-bg)); box-shadow: 0 5px 18px rgba(0, 0, 0, .16); }
.artwork-preview-card img { display: block; width: 100%; height: 190px; object-fit: cover; object-position: center 38%; }
.preview-message { min-height: 80px; padding: 12px; overflow-wrap: anywhere; white-space: normal; }
.preview-message :deep(.preview-quote) { margin: 8px 0 0; padding: 4px 0 4px 11px; border-left: 3px solid var(--surface-accent); }
.options-editor { min-height: 1110px; }
.option-group { min-height: 150px; margin: 14px 0; padding: 14px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--tg-theme-bg-color, var(--vp-c-bg)); box-sizing: border-box; }
.option-group h3 { margin: 0 0 10px; font-size: 1rem; }
.choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.choice-card { display: flex; align-items: center; gap: 10px; min-height: 58px; padding: 10px; border: 1px solid var(--vp-c-divider); border-radius: 9px; }
.choice-card:has(input:checked) { border-color: var(--surface-accent); background: color-mix(in srgb, var(--surface-accent) 10%, transparent); }
.choice-card input { width: 20px; height: 20px; flex: 0 0 auto; }
.option-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 20px; }
.option-row { display: flex; align-items: center; gap: 10px; min-height: 44px; }
.option-row input { width: 20px; height: 20px; flex: 0 0 auto; }
.telegraph-editor { min-height: 326px; }
.legacy-transfer-section { min-height: 410px; }
.legacy-payload-field { display: grid; gap: 7px; margin: 12px 0; }
.legacy-payload-field textarea { min-height: 126px; resize: vertical; overflow-wrap: anywhere; }
.legacy-transfer-status { min-height: 88px; margin-top: 12px; }
.target-selector { min-height: 404px; }
.target-identity { display: flex; align-items: center; gap: 14px; min-height: 112px; margin: 14px 0; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--tg-theme-bg-color, var(--vp-c-bg)); box-sizing: border-box; }
.target-avatar { display: block; width: 78px; height: 78px; flex: 0 0 78px; border-radius: 50%; object-fit: cover; background: var(--surface-accent); }
.target-copy { display: grid; gap: 3px; min-width: 0; }
.target-copy strong, .target-copy span { overflow-wrap: anywhere; }
.target-copy strong { font-size: 1.16rem; }
.target-copy span { color: var(--surface-muted); }
.target-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.action-section { min-height: 236px; }
.dialog-layer, .template-market-layer { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 16px; box-sizing: border-box; pointer-events: none; visibility: hidden; }
.dialog-layer[data-open="true"], .template-market-layer[data-open="true"] { pointer-events: auto; visibility: visible; }
.template-market-layer { z-index: 21; align-items: start; overflow-y: auto; }
.dialog-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .55); }
.confirm-dialog { position: relative; width: min(420px, calc(100vw - 32px)); min-height: 236px; box-sizing: border-box; padding: 24px; border-radius: 14px; background: var(--tg-theme-bg-color, var(--vp-c-bg)); }
.confirm-dialog h2 { margin-top: 0; }
.template-market-dialog { position: relative; width: min(900px, calc(100vw - 32px)); min-height: 620px; margin: max(16px, var(--tg-safe-area-inset-top, 0px)) 0 max(16px, var(--tg-safe-area-inset-bottom, 0px)); padding: 24px; box-sizing: border-box; border-radius: 14px; background: var(--tg-theme-bg-color, var(--vp-c-bg)); }
.template-market-dialog h2 { margin: 0 0 8px; }
.template-market-dialog > p { color: var(--surface-muted); }
.template-market-actions { margin-top: 18px; }
@media (max-width: 640px) {
  .settings-mini-app { padding-inline: max(12px, var(--tg-safe-area-inset-left, 0px)); }
  .template-tabs, .option-grid, .choice-grid, .target-actions { grid-template-columns: 1fr; }
  .preset-gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .format-editor { min-height: 790px; }
  .options-editor { min-height: 1540px; }
  .target-selector { min-height: 536px; }
  .target-avatar { width: 68px; height: 68px; flex-basis: 68px; }
  .template-market-dialog { padding: 16px; }
  .surface-card { padding: 16px; }
}
</style>
