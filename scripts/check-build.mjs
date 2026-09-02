import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
const routes = [
  ['index.html', 'en-US', 'Pixiv bot'],
  ['privacy.html', 'en-US', 'Privacy Policy'],
  ['s.html', 'en-US', 'Bot Configuration'],
  ['ja/index.html', 'ja-JP', 'クイックスタート'],
  ['ja/privacy.html', 'ja-JP', 'プライバシーポリシー'],
  ['ja/s.html', 'ja-JP', 'メッセージ形式の設定'],
  ['zh-hans/index.html', 'zh-Hans', 'Pixiv bot'],
  ['zh-hans/privacy.html', 'zh-Hans', '隐私策略'],
  ['zh-hans/s.html', 'zh-Hans', '机器人配置'],
  ['zh-hant/index.html', 'zh-Hant', 'Pixiv bot'],
  ['zh-hant/privacy.html', 'zh-Hant', '隱私策略'],
  ['zh-hant/s.html', 'zh-Hant', '機器人設定'],
  ['mini-app.html', 'en-US', 'Bot settings'],
  ['ja/mini-app.html', 'ja-JP', 'Bot 設定'],
  ['zh-hans/mini-app.html', 'zh-Hans', 'Bot 设置'],
  ['zh-hant/mini-app.html', 'zh-Hant', 'Bot 設定']
]

const miniAppRoutes = new Set([
  'mini-app.html',
  'ja/mini-app.html',
  'zh-hans/mini-app.html',
  'zh-hant/mini-app.html'
])
const sdkUrl = 'https://telegram.org/js/telegram-web-app.js?63'

const failures = []

for (const [path, language, marker] of routes) {
  let html
  try {
    html = await readFile(join(outputDirectory, path), 'utf8')
  } catch (error) {
    failures.push(`${path}: missing generated route (${error.code ?? error.message})`)
    continue
  }

  if (!html.includes(`<html lang="${language}"`)) {
    failures.push(`${path}: expected html language ${language}`)
  }
  if (!html.includes(marker)) {
    failures.push(`${path}: expected rendered marker ${JSON.stringify(marker)}`)
  }
  if (/href="\/?(?:zh-hans|zh-hant)\/(?:zh-hans|zh-hant)\//.test(html)) {
    failures.push(`${path}: contains a duplicated locale prefix`)
  }
  const sdkIndex = html.indexOf(sdkUrl)
  if (miniAppRoutes.has(path)) {
    const applicationIndex = html.indexOf('<script type="module"')
    if (sdkIndex < 0) failures.push(`${path}: missing Telegram Mini App SDK`)
    if (applicationIndex < 0 || sdkIndex > applicationIndex) {
      failures.push(`${path}: Telegram SDK must precede the VitePress application script`)
    }
    if (html.indexOf(sdkUrl, sdkIndex + sdkUrl.length) >= 0) {
      failures.push(`${path}: Telegram SDK is emitted more than once`)
    }
  } else if (sdkIndex >= 0) {
    failures.push(`${path}: ordinary or legacy route must not load the Telegram SDK`)
  }
}

async function collectHtmlFiles(directory) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) paths.push(...await collectHtmlFiles(path))
    if (entry.isFile() && entry.name.endsWith('.html')) paths.push(path)
  }
  return paths
}

async function collectFiles(directory, extension) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) paths.push(...await collectFiles(path, extension))
    if (entry.isFile() && entry.name.endsWith(extension)) paths.push(path)
  }
  return paths
}

for (const path of await collectHtmlFiles(outputDirectory)) {
  const html = await readFile(path, 'utf8')
  const internalHtmlLink = html.match(/href="\/(?!\/)[^"]*\.html(?:[?#][^"]*)?"/)
  if (internalHtmlLink) {
    failures.push(`${relative(outputDirectory, path)}: dirty URL ${internalHtmlLink[0]}`)
  }
}

const compiledCss = await Promise.all(
  (await collectFiles(outputDirectory, '.css')).map((path) => readFile(path, 'utf8'))
)
if (!compiledCss.some((css) => css.includes('#save>a{') && css.includes('#setting .cards{'))) {
  failures.push('compiled CSS is missing the legacy settings layout')
}

if (failures.length > 0) {
  throw new Error(`VitePress output validation failed:\n- ${failures.join('\n- ')}`)
}

console.log(`Validated ${routes.length} clean, localized documentation routes.`)
