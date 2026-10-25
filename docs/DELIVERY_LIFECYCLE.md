# Delivery lifecycle

## Invariants

- Keep all existing Telegram text, localization keys, captions, and buttons
  unchanged. Adding user-visible text requires prior discussion with the owner.
- Each sender state machine executes once. Concurrent callers share its active
  run; a settled machine cannot replay sends. Independent updates remain concurrent.
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

## Recovery and resource ownership

- MP4 and GIF conversions use FIFO scheduling with bounded concurrency and share an active task
  for the same output. Every return and rejection releases ownership. Waiting
  does not recursively restart conversion or repeat metadata requests.
- Telegram transport owns rate-limit retries (at most one automatic retry).
  Application source fallback requires an explicit media rejection; a network
  error or server error after a send starts is not proof that delivery failed.
  Such errors end that output attempt without another send. Preparation errors
  can use another source because no Telegram send has started.
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
completion/error propagation with deterministic tests. These local tests do not establish
delivery to Telegram or deployment recovery.

Live acceptance requires an authorized test chat and configured bot/Pixiv
credentials: private and channel updates, mixed illustration/novel requests,
ugoira remote-fetch rejection, permission/flood errors, and shutdown during an
active send. Do not create fake `config.js` credentials to run this check.
