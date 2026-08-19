# Changelog

## [1.2.0] - 2026-08-19

### Added
- Settings UI integration: the plugin now appears under **DSH Settings → Plugins → dsh-game-hud** with an editable `maxBalance` field. Changes persist to the profile settings file and apply live to the HUD (no restart).
- Live config resolution: `/hud/state` resolves `maxBalance` and `priceTable` from the registered `game-hud` settings namespace at request time.
- `dsh plugin --profile web add github:guoliyuan97-png/dsh-game-hud#v1.2.0` install path verified.

## [1.1.0] - 2026-08-19

### Added
- `maxBalance` config: HP bar full-scale amount in CNY (default 20). Users with larger balances or a different budget can raise it.
- `priceTable` config: optional per-model peak/valley prices (CNY per million tokens). Falls back to the built-in table for unlisted models.

## [1.0.0] - 2026-08-19

### Added
- Game-style floating HUD for DeepSeek Harness:
  - ❤ HP bar: real-time DeepSeek account balance (official `user/balance` API), full scale = ¥20.
  - ✦ MP bar: current conversation context remaining (`contextPressure` projection).
  - ▲▼ Peak/valley pricing: official Beijing-time windows (09:00–12:00 / 14:00–18:00 peak, valley = half price), per-second switch countdown.
  - ⚡ Auto-compaction: triggers `/compact` when context remaining < 5%; after 2 compaction rounds shows the "new conversation (with memory)" button; keeps compacting until clicked.
  - 🔁 Memory-carrying new conversation: generates a digest with the current model, creates a new session, injects the memory without answering old questions.
- Host routes: `GET /hud/state`, `POST /hud/digest`, `POST /hud/seed`.
- Client served as a hand-written `window.__ModuleLoader__.load()` bundle — no build step.
