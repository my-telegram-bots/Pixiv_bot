---
title: Documentation Toolchain
sidebar: false
editLink: false
---

# Documentation toolchain

This repository builds its static documentation with the latest stable
VitePress 1.x release and the current Node.js 24 LTS line. Prerelease VitePress
2 builds are not production dependencies.

The migration from VuePress is complete only when all of these invariants hold:

- `yarn build` produces the site in the repository-level `dist/` directory.
- Legacy public routes remain `/`, `/s`, `/privacy`, `/zh-hans/`,
  `/zh-hans/s`, `/zh-hans/privacy`, `/zh-hant/`, `/zh-hant/s`, and
  `/zh-hant/privacy`.
- Permanent Settings Mini App routes are `/mini-app`, `/ja/mini-app`,
  `/zh-hans/mini-app`, and `/zh-hant/mini-app`; all four mount the same shared
  implementation and render their own language without fallback.
- Japanese is a complete documentation locale, not a Mini App-only locale. It
  must provide `/ja/`, `/ja/s`, `/ja/privacy`, and `/ja/mini-app`, with Japanese
  navigation, page titles, visible guidance, error/recovery text, and legacy
  settings controls. None of these routes may silently fall back to English.
- Every locale selector must land on an existing page. Production validation
  must assert the generated `ja-JP` entry points and representative Japanese
  content for the guide, privacy policy, legacy settings editor, and Mini App.
- Internal links use clean URLs without a `.html` suffix. URL rewriting must be
  owned by VitePress configuration, not by post-processing generated files.
- The existing legacy Base64 settings editor behavior remains unchanged until
  the separate Settings Mini App rollout contract authorizes its removal.
- The Mini App preserves the visual template workflow: default templates,
  normal/album/inline mode switching, and a live rendered sample artwork card.
- The official Telegram Mini App SDK is emitted only on the four Mini App pages
  and precedes the VitePress application module script in each generated page.
- A production build must be followed by inspection of every generated locale
  entry point and an audit proving that no VuePress config, dependency, command,
  or generated-link rewrite remains.

Use `yarn dev` for local editing, `yarn build` for production output, and
`yarn preview` to serve the production build locally.
