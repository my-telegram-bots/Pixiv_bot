# Telegram Settings Lifecycle

## Ownership

Settings are not input parsing. Pixiv URL and metadata parsing belongs in
`handlers/telegram/input-parser.js` and follows `docs/INPUT_PARSER.md`. The
settings lifecycle belongs in focused settings modules and must not return to
`pre_handle.js` or `app.js`.

The lifecycle has two entry paths:

- Request resolution computes the effective settings for one Telegram update.
- Configuration commands authorize and execute `/s` export, reset, import, or
  save operations.

The Mini App adapter is a third, independent entry path. During public Beta it
is opened by the private-chat-only `/miniapp` command and is owned by
`handlers/telegram/settings-mini-app-lifecycle.js`; its strict wire parser is
owned by `handlers/telegram/settings-mini-app-protocol.js`. `app.js` wires the
command and two Telegram service updates into that lifecycle. Group or channel
use of `/miniapp` must stop before generic settings/Pixiv routing and return
localized guidance with `SETTINGS_MINI_APP_PRIVATE_ONLY` in the current chat;
it must not attempt a private send or settings write.

The static page, official Telegram browser SDK integration, localized UI,
fragment decoding, display-only target card, and browser-side rollout contract
are owned by the sibling
`Pixiv_bot-web` repository's
[`docs/SETTINGS_MINI_APP_ADAPTER.md`](https://github.com/Redlnn/Pixiv_bot-web/blob/docs/docs/SETTINGS_MINI_APP_ADAPTER.md).
Keep Web implementation details there; this document owns the Bot-side protocol
and authorization boundary.

## Mini App Telegram Protocol

The Mini App settings adapter is Telegram-only. It does not expose a REST API,
webhook, or static-host write endpoint. The bot receives `web_app_data` and
`chat_shared` through the existing long-polling connection. Initial settings,
display-only target identity, opaque session identifiers, and prepared
chat-selector identifiers are placed
after one of the localized permanent `/mini-app` URL's `#` fragments, so the
static host does not receive them.

`web_app_data.data` is a UTF-8 JSON string with an absolute limit of 4096 bytes.
Version 1 accepts exactly these two shapes:

```json
{"v":1,"action":"save","session":"opaque","settings":{"format":{},"default":{}}}
{"v":1,"action":"reset","session":"opaque"}
```

Unknown versions, actions, fields, setting keys, invalid types, malformed JSON,
arrays, and `__proto__`, `constructor`, or `prototype` keys at any depth are
rejected before persistence. `format` accepts only the existing format fields;
`default` accepts only the existing boolean and Telegraph metadata fields.
Identity and target fields are never accepted from the client. The existing
database allowlist remains a second validation boundary.

Immediately before a save, the Bot applies the same dependency normalization
as command settings: album caption/layout options require albums; removing the
keyboard disables open/share; immediate append enables append; append disables
file-only delivery; file-only delivery disables albums, album-one, equal album
layout, and the single caption; channel targets disable share.
Browser feedback is advisory; this Bot boundary is authoritative.

Mini App launches use a private-chat reply-keyboard Web App button because only
that launch mode can return `web_app_data` through `sendData`. Each launch has a
bot-generated, single-use edit session that binds the Telegram actor to one
target. Personal sessions always target `ctx.from.id`; the client cannot select
or replace that ID.

The same reply-keyboard row always includes a localized control that removes the
settings keyboard. Selecting it sends one localized confirmation with
`remove_keyboard`, terminates before ordinary text or Pixiv routing, and never
saves, resets, or consumes the current edit session. The Web App launch must not
be replaced by a message-attached inline Web App button: that launch mode cannot
return this static adapter's `sendData` service message and would require a new
server-side `query_id` channel.

The initial fragment also contains an exact display-only `target` object with
chat type, bounded name, public username, and a public HTTPS avatar URL when one
can be derived safely. It contains no chat ID. The Web surface renders that
identity before its editors and falls back to a fixed-size initials avatar when
Telegram exposes no photo. This object is never accepted back in save/reset and
never participates in identity, target, or administrator authorization; the
server-side edit session remains the sole authority.

Sessions live only in the bot process, expire after 15 minutes, and share a
fixed upper bound. Expired, evicted, consumed, or restart-lost sessions do not
write settings and tell the user to open settings again. A successful save or
reset consumes its edit session. A database failure keeps the session until its
original expiry and leaves the reply-keyboard Web App button available so the
same page can be reopened and retried safely. A successful operation removes
that keyboard so it cannot present a stale action.

### Group and Channel Selection

Group and channel editing is a two-stage flow:

1. For the current Telegram user, the bot creates separate group and channel
   `request_chat` buttons with signed 32-bit request IDs and stores them through
   `savePreparedKeyboardButton`. The returned opaque prepared-button IDs may be
   passed to `Telegram.WebApp.requestChat`; button text is presentation only and
   is never trusted as authority.
2. Telegram closes the selection page and sends `chat_shared` to the bot. The
   bot resolves the request by `(request_id, user_id)`, verifies the selected
   chat's group/channel type through `getChat`, and verifies the actor is still
   an administrator or creator through `getChatMember`.
3. The bot reads the target's complete current `format` and `default` settings,
   creates a new edit session bound to that target, and sends a new private-chat
   reply-keyboard Web App button. Its URL fragment contains the initial UI state,
   display-only target identity without chat ID, and opaque bot-issued identifiers.
4. Immediately before saving or resetting a non-personal target, the bot repeats
   the live administrator check. Loss of permission never falls back to a
   personal write or another target.

Unknown, expired, already-consumed, or another user's request IDs are rejected.
Unavailable targets, mismatched chat types, and administrator-check failures do
not create an edit session. Every Mini App service update terminates in its
dedicated handler and cannot enter Pixiv content sending.

## Settings Command Grammar

`handlers/telegram/settings-command-parser.js` owns the `/s` grammar and parses
the input once per update. Callers consume its structured result rather than
searching the raw text again.

- `/s` exports settings and `/s reset` resets them. Command whitespace is
  normalized before classification.
- `/s` flags are `+name` or `-name` tokens that begin at the input or after
  whitespace and end before whitespace, punctuation, or the end of input. A
  declarative registry maps every alias to one canonical setting; unknown tokens
  never trigger a settings write and produce a localized
  `SETTINGS_UNKNOWN_DIRECTIVE` error naming the rejected tokens.
- Each canonical flag records positive and negative presence. Resolution keeps
  the established conflict rules: explicit disable wins for ordinary flags,
  removal flags retain inverted polarity, `-rm` wins over `+rm`, and
  `+overwrite` wins over `-overwrite`.
- `+god`, `rm`, and `overwrite` are explicit control tokens in the same parser,
  not ad-hoc substring checks in lifecycle code.
- Base64 configuration payload detection remains a separate command form.
- Telegraph metadata may make an otherwise flag-free `/s` command saveable,
  but arbitrary `+` or `-` characters do not.

Adding a flag means adding one registry entry and table-driven cases. Do not add
another regular expression call or raw `includes()` check to the resolver or
lifecycle.

## Request Resolution

Every applicable update follows this order:

1. Resolve chat ID, user ID, and update type.
2. Create a fresh default setting object and query the chat setting record.
3. Apply the existing chat-versus-user precedence, including `+god` and group
   overwrite behavior. Linked chats are resolved separately by the link lifecycle.
4. Merge stored defaults and formats into the fresh request object.
5. Resolve temporary `+flag` and `-flag` overrides, including inverted keyboard
   and caption removal flags.
6. Enforce dependent settings: Telegraph and single-caption modes require
   albums; immediate append implies append; append disables file-only mode;
   file-only mode disables albums and their one-image/equal-layout/single-caption
   dependents; channel and inline restrictions apply.
7. Parse and validate optional Telegraph title and author metadata.
8. Return the effective request settings, or the existing `error` sentinel after
   notifying the user of invalid metadata.

The resolver may mutate `ctx.type` and `ctx.us`, matching the middleware contract.
It must create fresh nested defaults for every invocation and must not share
mutable defaults across updates.

## Configuration Commands

Configuration updates follow this order:

1. Authorize the actor. Channels retain their current behavior; anonymous
   sender-chat messages are ignored; non-anonymous group actors must be an
   administrator or creator.
2. Classify the command:
   - `/s`: export the effective format/default settings in the existing web URL.
   - `/s reset`: clear persisted defaults and formats and notify success.
   - Base64 JSON payload: decode, parse, recursively sanitize dangerous keys,
     persist allowed settings, and notify success or failure.
   - `/s` with flags or validated Telegraph values: persist the effective
     defaults and notify success or failure.
3. Reject persistent group `+god` rather than storing the temporary override.
4. Complete without falling through into Pixiv content sending.

Persistence validation remains owned by `db.update_setting`: only known format
strings, known booleans, Telegraph strings, and subscriptions may reach
PostgreSQL. Reset preserves subscriptions; links live in the dedicated link store.

## Compatibility Invariants

- Keep the current default booleans and aliases exactly stable.
- Explicit disable flags retain priority over enable flags; inverted `-kb` and
  `-cp` behavior remains stable.
- Preserve every documented flag alias and the established special conflict
  rules for `rm`, `overwrite`, and `god`.
- Preserve the existing chat/user precedence during this structural extraction,
  including its behavior when a chat setting is absent. Change it only in a
  separately specified behavior change with direct tests.
- Preserve the `dbless`, `q_id`, `setting`, Telegraph metadata, and
  `value_update_flag` shapes consumed by senders and formatters.
- Preserve all current localized success and failure messages and reply targets.
- Reject prototype-pollution keys recursively during imported configuration.
- Delete the superseded `pre_handle.js`; do not leave wrappers or dual imports.
- This public Beta does not change the visible behavior of `/s`, `/s +tags`,
  `/s reset`, or Base64 imports. The legacy Base64 import remains owned by the
  settings command lifecycle until a deployed static Mini App covers personal,
  group, and channel editing and passes real Telegram-client acceptance. Its
  removal must be reconsidered and recorded no later than that UI-switch
  release; until then it is a named compatibility boundary owned by the bot
  settings lifecycle. The temporary `/miniapp` command is removed in the same
  release that switches bare private `/s`; it is not retained as an alias.

## Validation

- Unit-test command tokenization, known and unknown flags, defaults, aliases,
  inverted and special conflict rules, dependent-setting normalization,
  chat/user precedence decisions, recursive sanitization, and command
  classification using modules that do not require private `config.js`.
- Syntax-check all extracted modules, `app.js`, and `tg-sender.js`.
- Run focused tests independently, then the full AVA suite when private local
  configuration permits it.
- Real Telegram acceptance is separate: group authorization, `/s` web export,
  reset, payload import, flag save, inline settings, and linked-chat behavior are
  not proven by unit tests alone.
- Mini App unit coverage must include strict payload parsing and UTF-8 limits,
  personal target binding, exact display-only target projection without chat ID,
  the terminal keyboard-removal control without settings/session mutation,
  prepared group/channel selectors, `(request_id,
  user_id)` ownership, target-type checks, both administrator checks, session
  expiry/consumption, persistence retry, and routing termination. These tests do
  not prove the future static UI, `requestChat` behavior in a real client, or
  production Telegram delivery.

Official protocol references:

- [Keyboard Button Mini Apps and `sendData`](https://core.telegram.org/bots/webapps#keyboard-button-mini-apps)
- [`Telegram.WebApp.requestChat`](https://core.telegram.org/bots/webapps#initializing-mini-apps)
- [`savePreparedKeyboardButton`](https://core.telegram.org/bots/api#savepreparedkeyboardbutton)
