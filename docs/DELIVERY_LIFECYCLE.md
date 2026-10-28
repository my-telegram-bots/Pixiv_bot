# Delivery lifecycle

## Invariants

- Keep all existing Telegram text, localization keys, captions, and buttons
  unchanged. Adding user-visible text requires prior discussion with the owner.
- Each sender state machine executes once. Concurrent callers share its active
  run; a settled machine cannot replay sends. Different destination chats remain concurrent.
- Collection keeps one illustration lifecycle per normalized Pixiv ID, including
  overlap between explicit IDs and author results.
- Finish independent items and later phases after a handled delivery failure.
  Failure reporting is best effort: its own failure must not replace the original
  delivery error or interrupt subsequent work.
- A completed processing loop does not imply successful delivery. Failed or
  unfinished illustrations and recorded delivery errors must produce `ok: false`.
  Preserve the structured error code returned by the error handler.
- Only an explicit remote-media rejection permits an external ugoira URL to fall
  back to a local upload. Timeouts, transport failures, permissions, and flood
  limits must not trigger another upload with an uncertain delivery outcome.
  Existing transport retry limits remain in force. Each failure is reported once,
  and a successful specific error notice suppresses the generic duplicate notice.
- Channel and bootstrap middleware await downstream processing. Private and group
  dispatch await sending and any error notice, so errors and completion stay owned
  by the update runner. Shutdown drains that runner and active ranking/prewarm
  tasks before closing PostgreSQL; repeated signals share one shutdown. Stopped
  ranking tasks cannot schedule another run.

## Recovery and resource ownership

- Bot ingress deduplicates exact numeric Telegram update IDs within one process.
  Concurrent duplicates await the original attempt without invoking handlers or
  reporting its error again. Settled IDs, including failures with potentially
  delivered output, are retained for 15 minutes, up to 10,000 IDs. Active IDs are
  never evicted. A new update ID is a new request even with identical content.
  This is bounded process-local protection, not durable exactly-once delivery
  across restarts, multiple processes, or retention expiry/eviction.
- Ordinary content delivery queues FIFO by the actual destination chat, across
  topics and source/linked deliveries. A reservation spans the entire sender
  (albums and appended documents included), and source error handling. It is
  released on success or failure; idle chat entries are removed. Each delivery
  holds only its own destination, never a source lock while awaiting linked
  targets. Queue order is delivery submission order, not numeric update order.
  Settings, callbacks, inline and Guest answers do not wait behind media work.
  Update handlers await queued deliveries so runner shutdown also drains them.
- MP4 and GIF conversions use FIFO scheduling with bounded concurrency and share an active task
  for the same output. Every return and rejection releases ownership. Waiting
  does not recursively restart conversion or repeat metadata requests.
- Telegram transport owns rate-limit retries (at most one automatic retry).
  Application source fallback requires an explicit media rejection; a network
  error or server error after a send starts is not proof that delivery failed.
  Such errors end that output attempt without another send. Preparation errors
  can use another source because no Telegram send has started.
- Album recovery must reach a complete local-upload attempt within its existing
  retry budget after explicit remote-media rejection. Per-item fallback must not
  consume every attempt while leaving other rejected remote URLs in the batch.
  This includes appended original-file albums and mixed-work albums with uncached
  multi-page illustrations; keep every item in its original work/page order.
- Error notices distinguish pending, sent, failed, and suppressed. Concurrent
  notices share one attempt. Only confirmed delivery sets `failureNotified`.
  An uncertain notification outcome is not replayed. A definite rejection may
  be tried once on a later notification boundary; there is no recursive retry.
- In-memory downloads share four network slots. Buffered media delivery reserves
  its whole batch before downloading and holds its reservation until upload
  settles, with at most ten 50 MiB source buffers reserved globally. Albums
  reserve atomically so partial batches cannot deadlock. Waiting queues are
  bounded and expire; all failures release permits. This bounds source buffers,
  not total process RSS or multipart/network implementation overhead.

## Validation boundary

Exercise state transitions, partial failure summaries, reporter rejection,
duplicate collection, remote-media fallback decisions, and channel middleware
completion/error propagation with deterministic tests. Runner lifecycle tests
must cover active work and repeated shutdown. These local tests do not establish
delivery to Telegram or deployment recovery.

Live acceptance requires an authorized test chat and configured bot/Pixiv
credentials: private and channel updates, mixed illustration/novel requests,
ugoira remote-fetch rejection, permission/flood errors, and shutdown during an
active send. Do not create fake `config.js` credentials to run this check.
