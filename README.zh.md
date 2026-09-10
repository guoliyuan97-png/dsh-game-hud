# dsh-game-hud

游戏风格悬浮 HUD 插件（DeepSeek Harness）。

- ❤ **血条**：实时显示 DeepSeek 账户余额（官方 `user/balance` 接口），满格金额可配置（默认 ¥20）。
- ✦ **蓝条**：当前会话上下文剩余（与官方 UI 同源的 `contextPressure` 投影），随对话增长从满格减少。
- ▲▼ **峰谷定价**：官方规则（北京时间**周一至周五** 09:00–12:00 / 14:00–18:00 为高峰，其余时段含周末全天为空闲时段、价格为高峰的一半），显示当前单价与距下次切换倒计时（每秒跳动）。
- ⚡ **自动压缩**：上下文剩余 < 5% 时自动触发 `/compact`；压缩满 2 轮后出现「开启新对话（携带记忆）」按钮；不点击则继续自动压缩。
- 🔁 **携带记忆新对话**：点击后用当前模型生成记忆摘要 → 新建会话并注入记忆（不回答旧问题、不丢记忆），新会话上下文重新累计。

## 安装

```bash
dsh plugin --profile web add github:guoliyuan97-png/dsh-game-hud#v1.2.0
```

重启 DSH 后，浏览器右下角出现可拖动的 HUD 面板。

## 配置

打开 **DSH 设置 → 插件 → dsh-game-hud** 即可编辑（保存后实时生效）：

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `maxBalance` | number | `20` | 血条满格金额（CNY）。余额超过此值显示满格，低于按比例减少 |

> ⚠️ 单价来自插件内置价格表（`lib/index.js` 的 `PRICE_TABLE`），**不是实时从官方接口拉取**：官方调价后需要更新插件版本，或用 `priceTable` 覆盖。余额（血条）才是实时调用官方 `user/balance` 接口。

也可在 profile 的 `cordis.patch.yml` 中覆盖：

```yaml
- insert:
    - id: game-hud
      name: 'dsh-game-hud'
      config:
        maxBalance: 50
```

## 文档

- 完整功能与实时机制说明见 [README.md](./README.md)
- 版本历史见 [CHANGELOG.md](./CHANGELOG.md)

## 许可

MIT
