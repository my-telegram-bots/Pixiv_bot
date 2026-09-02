---
sidebar: false
editLink: false
title: Settings Mini App Web Adapter
---

# Telegram Settings Mini App Web Adapter

## Ownership and scope

This document is the canonical Web-side implementation and validation contract
for the permanent Telegram Settings Mini App routes `/mini-app`,
`/ja/mini-app`, `/zh-hans/mini-app`, and `/zh-hant/mini-app`.
The Bot-side protocol, target authorization, in-memory sessions, and persistence
remain owned by the `Pixiv_bot` bot process.

The Web application remains static. It must not add a REST API, webhook, server
session, database, Telegram token, or identity lookup. The URL fragment is not
sent to the static host. The browser returns changes only through Telegram's
Mini App SDK, and the bot receives them through long polling.

This document does not authorize switching the current `/s` entry point yet.
The existing Base64 export/import path remains visible until the Mini App page is
deployed and personal, group, and channel flows pass real Telegram-client
acceptance.

## Routes, public Beta, and migration boundary

The current localized settings pages are:

- `docs/s.md`
- `docs/ja/s.md`
- `docs/zh-hans/s.md`
- `docs/zh-hant/s.md`

The four Mini App routes mount one shared settings surface and one shared
protocol/SDK adapter. Register `/ja/` in `docs/.vitepress/config.mts`; Japanese
is part of the initial Beta, not an English fallback. Do not copy behavior into
the localized Markdown route files.

The Bot exposes `/miniapp` as a public Beta command. It is private-chat only:
private use opens the Mini App, while group and channel use returns localized
guidance with stable code `SETTINGS_MINI_APP_PRIVATE_ONLY`. During Beta, bare
`/s` and the legacy Base64 editor remain unchanged. `/miniapp` must be removed
in the same release that makes bare private `/s` open `/mini-app`; `/s +tags`,
`/s reset`, and the other command forms remain supported.

They currently decode a legacy Base64 settings object from `location.hash`, keep
it in `sessionStorage.s`, and save through `tg://msg_url`. That path must remain
unchanged while the Mini App is introduced in parallel. Mini App sessions must
never be copied into `sessionStorage`, local storage, logs, analytics, query
parameters, or the legacy Base64 payload.

When the Mini App is accepted and the bot entry point is switched, remove the
legacy UI branch, `tg://msg_url` save control, raw Base64 copy area, old hash
decoder, and `sessionStorage.s` fallback together. Do not retain a hidden or
dual-write compatibility tail. The owner is the Settings Mini App rollout; the
removal condition is successful personal/group/channel acceptance on supported
Telegram clients, and the deadline is the same release that switches bare
private `/s` to the Mini App.

## Telegram SDK integration

Use Telegram's official browser SDK. VitePress must place it in the document
`<head>` before application scripts only for the four Mini App routes. Use the
per-page `transformHtml` hook because VitePress appends `transformHead` output
after its application module:

```js
transformHtml(html, _id, context) {
  if (!context.pageData.relativePath.endsWith('mini-app.md')) return html
  return html.replace('<head>', '<head>\n<script src="https://telegram.org/js/telegram-web-app.js?63"></script>')
}
```

Do not inject this SDK into legacy `/s` or ordinary documentation routes. Do not
copy, bundle, proxy, or dynamically inject it. The query version must be reviewed
against the official Telegram documentation when this work is implemented; a
build passing with an old SDK URL is not proof that `requestChat` is available
in deployed clients.

The shared settings component must read `window.Telegram?.WebApp` only after the
component mounts. It then calls `ready()` after the initial payload has been
validated and the stable page layout is ready. The component must use feature
detection for `sendData` and `requestChat`; `requestChat` additionally requires
a client that exposes Bot API 9.6 or later.

This flow is intentionally launched from a private-chat reply-keyboard Web App
button. An inline Web App button is not interchangeable: the settings save path
depends on `Telegram.WebApp.sendData`, which sends `web_app_data` only for a
keyboard-button Mini App.

## Initial fragment contract

The bot opens one of the four localized `/mini-app` pages with one
Base64URL-encoded JSON object after `#`:

```json
{
  "v": 1,
  "session": "opaque bot-issued token",
  "settings": {
    "format": {},
    "default": {}
  },
  "target": {
    "type": "private",
    "name": "Current chat name",
    "username": "public_username_or_empty",
    "photo_url": "public_https_avatar_or_empty"
  },
  "request_chat": {
    "group": "opaque prepared keyboard button id",
    "channel": "opaque prepared keyboard button id"
  }
}
```

The fragment parser must:

1. Read the fragment exactly once during mount.
2. Treat the substring before the first `?` as the bot payload. Telegram appends
   its own `tgWebAppData`, `tgWebAppVersion`, platform, and theme parameters after
   that delimiter when the original fragment is a path-style `#payload`; those
   service parameters are not part of the payload and must not make a valid
   launch fail.
3. Decode Base64URL by translating `-`/`_`, restoring padding, decoding bytes,
   and using UTF-8 `TextDecoder` before `JSON.parse`.
4. Require an ordinary object with exactly `v`, `session`, `settings`, `target`,
   and `request_chat`; require `v === 1`.
5. Require a non-empty opaque session string, `settings.format` and
   `settings.default` objects, an exact display-only target object, and non-empty
   group/channel prepared IDs. The target has exactly `type`, `name`, `username`,
   and `photo_url`; its type is `private`, `group`, `supergroup`, or `channel`,
   its non-empty name is bounded, and its optional public username/avatar values
   are empty strings when unavailable. A non-empty avatar URL must be HTTPS.
6. Reject arrays, unknown fields, wrong types, malformed encoding/JSON, and
   `__proto__`, `constructor`, or `prototype` at any depth.
7. Remove the fragment from the address bar with `history.replaceState` after
   parsing, without navigating or reloading.

The Web page uses the initial settings and target object as display state only.
The target card always shows a fixed-size avatar, chat name, localized chat type,
and public `@username` slot before any editor. For the current private user the
page may prefer `Telegram.WebApp.initDataUnsafe.user.photo_url`; for a public
group or channel the Bot may provide the public `t.me` avatar URL. When no real
photo is available, the same image slot renders a generated initials avatar; it
must never disappear or resize. The Web must not infer authorization from this
display metadata. It must not accept or send a `chat_id`, `user_id`, username,
target type, avatar URL, or permission claim in save/reset data. The session is
the only authority for actor and target.

## Outbound save and reset contract

Save sends exactly:

```json
{"v":1,"action":"save","session":"opaque","settings":{"format":{},"default":{}}}
```

Reset sends exactly:

```json
{"v":1,"action":"reset","session":"opaque"}
```

Before calling `Telegram.WebApp.sendData`, encode the compact JSON and calculate
its UTF-8 length with `new TextEncoder().encode(data).byteLength`. The maximum is
4096 bytes. Character count is not an acceptable substitute. Do not add time,
target, identity, debug, UI-state, unknown setting, or compatibility fields.

The Web allowlist must match the Bot v1 protocol:

- `format`: `message`, `mediagroup_message`, `inline`, `version`; values are
  strings, and `version`, when present, is `v1`.
- Boolean `default` fields: `tags`, `description`, `open`, `share`,
  `remove_keyboard`, `remove_caption`, `single_caption`, `album`, `album_one`,
  `album_equal`, `reverse`, `overwrite`, `asfile`, `append_file`,
  `append_file_immediate`, `caption_extraction`, `caption_above`, `show_id`, and
  `auto_spoiler`.
- String `default` fields: `telegraph_title`, `telegraph_author_name`, and
  `telegraph_author_url`.

Both Web feedback and the Bot save boundary enforce the same dependency order:
album caption/layout options require albums; removing the keyboard disables
open/share; immediate append enables append; append disables file-only
delivery; file-only delivery disables albums, album-one, and the single
caption; channel targets disable share. The Bot remains authoritative.

`sendData` closes the Mini App. Therefore the page must not claim a successful
save before closing. The Telegram chat receives the authoritative saved, reset,
invalid, expired, permission, target, or persistence result from the bot. A
persistence failure leaves the bot's Web App keyboard available, allowing the
same unexpired session to be reopened and retried.

## Group and channel selection

The initial fragment contains separate prepared IDs for group and channel
selection. They are presentation capabilities, not chat identities.

- Group action: call `Telegram.WebApp.requestChat(initial.request_chat.group,
  callback)`.
- Channel action: call
  `Telegram.WebApp.requestChat(initial.request_chat.channel, callback)`.
- Disable both actions while one request is pending.
- If the callback reports `true`, show the terminal “selection sent” state and
  call `Telegram.WebApp.close()`. Telegram sends `chat_shared` to the bot; the
  bot verifies the request owner, chat type, and current administrator status,
  then sends a new Web App button for that target's complete current settings.
- If the callback reports `false`, restore the ready state and explain that no
  target was selected and the user can retry.
- Closing or cancelling the native selector must never leave the page in a
  permanent pending state. Treat the SDK failure callback as cancellation; for
  clients that omit it, settle cancellation when the Mini App demonstrably
  returns from the selector. Keep an always-mounted, pending-only-enabled
  “continue editing” recovery control beside the selector so a client defect
  cannot trap the session. A late callback from a cancelled selector must not
  close the app or overwrite the newer state.
- If `requestChat` is unavailable, explain that this Telegram client cannot
  select a group/channel and tell the user to update Telegram or configure
  personal settings. Do not fall back to a text chat ID field.

The selected chat ID never becomes visible to or trusted from this page. The bot
performs another administrator check immediately before every group/channel save
or reset.

## UI state and stable geometry

The settings surface must reserve stable, non-collapsing slots before behavior is
implemented:

- launch validation: loading, ready, invalid/non-Telegram, and unsupported SDK;
- editor: initial values, edited values, validation failure, and reset-confirmed;
- submission: idle, submitting, handed back to Telegram, and local send failure;
- target selection: idle, group pending, channel pending, selection sent,
  cancelled/failed, and unsupported client;
- terminal guidance: reopen/retry through the bot when the session is stale or
  persistence failed.

Target context and the group/channel load controls appear immediately after the
launch status, before any editable field, because the selected target determines
which current settings the user is inspecting and editing. The target region
shows the current chat avatar, name, and localized type, and states plainly that
the Bot-selected target's stored values are already loaded;
choosing another target returns to Telegram and reopens the editor with that
target's current values before edits begin.

Status text, validation errors, button labels, focus, and async transitions must
not move the editor, action row, target selector, or focus order. Save and reset
remain visible in reserved action slots; invalid actions are disabled rather
than removed. Reset must use an honest confirmation dialog and must call the
reset payload after confirmation. While an action is pending, prevent duplicate
submissions.

Do not display the 15-minute server session lifetime as a countdown. The bot owns
expiration and recovery. Do not expose raw SDK exceptions or bot/network error
text; show localized human guidance and keep stable safe codes where defined.

All visible Mini App strings must be implemented in English, Japanese,
Simplified Chinese, and Traditional Chinese together. The same states, recovery
actions, safe error codes, and stable geometry must exist in all four locales.

## Implementation shape

Do not copy settings logic into each localized Markdown page. The Mini App
implementation must have one shared adapter and one shared settings surface used
by all four locale pages. Keep these responsibilities separate:

- SDK bridge: SDK availability, `ready`, `sendData`, `requestChat`, and close.
- protocol module: fragment decode/validation, setting allowlists, compact
  payload construction, and UTF-8 length validation.
- settings surface: stable visual state, editor bindings, confirmation, and
  localized human messages.

The message-template editor must preserve the existing visual editing value,
not replace it with a raw-text echo. It always shows a reserved sample artwork
card with the existing preview image and renders the active normal, album, or
inline template through the v1 placeholder and conditional syntax. Every edit
updates that rendered preview immediately. A localized, keyboard-operable
default-template gallery applies a complete template to the active mode without
moving the editor, preview, action row, or focus order. The gallery is opened
from one compact control into a modal browser; navigating among choices does not
change the active template. A separate explicit “apply this template” action is
required before the editor changes, and cancelling the modal preserves the
current template exactly. Invalid/non-Telegram
launches still show the representative preview in its reserved slot so the
surface never appears to have lost preview support.

The preview must use the established Telegram-template rendering semantics,
including conditional prefixes/suffixes, MarkdownV2 escaping, links, ordinary
block quotes, and expandable block quotes. Telegram control markers such as
`**>`, `>**`, and the terminal `||` marker must render as their visible message
effect and must never leak as literal preview text. The sample card and template
gallery are primary content: neither may use a fixed-height inner scroller or
clip message content. The document owns vertical scrolling. User-entered
template output may therefore grow the format section downward; controls before
the preview retain their bounds and the later sections follow the complete
preview without overlap, while focus order remains unchanged.

Delivery settings are presented by behavior, not as one undifferentiated list
of implementation booleans. File delivery is one four-way exclusive choice:
media only, files only, media followed by files, or media with files sent
immediately. The selected choice maps atomically to `asfile`, `append_file`, and
`append_file_immediate`. Related album, caption, keyboard, content, ordering,
and scope settings stay in labeled groups. Album-only controls are disabled
when albums are off; open/share are disabled when the keyboard is removed; and
caption-placement controls are disabled when captions are removed. Disabled
dependent values keep their stored value when the Bot contract does not require
normalizing it away, so restoring the parent option restores the user's choice.

Pure protocol code must accept dependencies such as the Web App object and text
encoder so it can be tested without inventing a Telegram identity. Browser or
unit mocks are diagnostic evidence only; they do not count as real Telegram
acceptance.

## Validation and rollout

Before changing the public `/s` behavior:

1. Unit-test valid/invalid Base64URL fragments, the real Telegram
   `#payload?tgWebAppData=...` launch shape, UTF-8 decoding, exact field
   allowlists, dangerous keys, save/reset serialization, and the 4096-byte edge.
2. Test SDK absence, unsupported `requestChat`, save/reset duplicate prevention,
   cancellation, successful handoff, and group/channel selection callbacks.
   Test v1 placeholder/conditional rendering, live preview source changes,
   active-mode switching, and default-template application; assert that the
   preview contains the sample artwork image and rendered message content rather
   than a plain `<pre>` echo. Assert that expandable-quote control markers render
   as a quote rather than literal `**>`/`>**`/`||` text, and that neither the
   preview nor template gallery creates an inner scrolling region. Test all four
   exclusive file-delivery combinations and every parent/dependent disabled
   relationship. Test native-selector cancel callbacks, return-without-callback,
   explicit pending recovery, and stale callbacks after cancellation; each path
   must re-enable group/channel selection without changing focus order. Assert
   that target/current-settings context precedes every editor control, and that
   its fixed avatar/name/type identity is populated from the strict launch
   contract with an initials fallback while never entering outbound data. Assert
   that
   opening, browsing, and cancelling the template modal cannot apply a template;
   only its explicit confirmation action may do so.
3. Build with `yarn build`. Inspect the generated English, Japanese, Simplified
   Chinese, and Traditional Chinese `/mini-app` pages and prove the official SDK
   script is loaded before the VitePress application code, while legacy `/s`
   output remains unchanged and contains no Telegram SDK.
4. Deploy the Web build while the old bot `/s` behavior remains intact.
5. Use the public, private-chat-only `/miniapp` Beta command to create real sessions.
   Validate current Telegram clients on Android, iOS, and Desktop for personal
   save/reset, group selection/save, channel selection/save, permission loss,
   expired session, database failure/reopen/retry, and duplicate submission.
6. Remove `/miniapp` in the same bot release that switches bare private `/s`.
   Do not leave it as a compatibility tail.
7. Only after that acceptance, atomically switch bare private `/s` and remove the
   legacy Web branch described above. Keep command forms such as `/s +tags` and
   `/s reset` supported by the bot.

A VitePress build proves static compilation only. It does not prove SDK loading,
Telegram launch mode, `web_app_data`, `chat_shared`, bot authorization,
persistence, deployment, or any real client behavior.

## Official references

- [Telegram Keyboard Button Mini Apps and `sendData`](https://core.telegram.org/bots/webapps#keyboard-button-mini-apps)
- [Telegram Mini App SDK initialization and `requestChat`](https://core.telegram.org/bots/webapps#initializing-mini-apps)
- [`savePreparedKeyboardButton`](https://core.telegram.org/bots/api#savepreparedkeyboardbutton)
