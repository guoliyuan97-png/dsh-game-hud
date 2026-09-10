# Changelog

## [1.3.2] - 2026-09-10

### Fixed
- 峰谷单价更新为官方 2026-09-10 12:00（北京时间）起生效的新价（flash 系列）：空闲时段 缓存命中/未命中/输出 = 0.02 / 1 / 4 元，高峰时段为空闲时段的 2 倍（0.04 / 2 / 8）。内置的旧价（空闲 0.05 / 1.5 / 4.5，高峰 0.1 / 3 / 9）会让 HUD 在官方降价后继续显示旧价。
- 高峰时段按官方规则限制为**周一至周五** 09:00-12:00、14:00-18:00：周末全天为空闲时段；周五 18:00 之后与周末的“下次切换”指向下一个工作日 09:00（并带上星期）。
- 支持新的官方模型名 `deepseek-flash`（与 `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` 同价）。

### Docs
- 明确单价来自内置价格表（`PRICE_TABLE`）而非实时接口；README / 示例配置同步更新。

## [1.3.1] - 2026-08-19

### Fixed
- Settings card now renders as a collapsible card like the built-in plugin cards (header with name/description + chevron, expandable body), instead of a flat always-open block.
- Settings card text is readable again: the dark HUD palette (`#d8e7f6` etc.) was being drawn on the light settings page, making labels and hints nearly invisible. Labels, inputs, hints and messages now use the DSH theme tokens (`--dsw-alias-label-*`, `--dsw-alias-state-*`), matching the other plugin cards in both light and dark themes.
- Card now shows an "未保存" badge when edits are pending and a "放弃修改 / 保存" footer, consistent with the built-in plugin cards.

## [1.3.0] - 2026-08-19

### Added
- Collapsed mini view: the minimized HUD now shows compact HP (balance) and MP (context) bars for a quick glance.
- Low-balance red alert: when the HP bar (balance) drops below `lowThreshold` percent (default 10), the HUD frame flashes red. Configurable via `lowAlert` (default true) and `lowThreshold`; only the balance bar triggers it — the context bar does not.

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
