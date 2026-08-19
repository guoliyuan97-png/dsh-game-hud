# dsh-game-hud

游戏风格悬浮 HUD 插件（DeepSeek Harness）。

- ❤ **血条**：实时显示 DeepSeek 账户余额（官方 `user/balance` 接口），满格 = ¥20。
- ✦ **蓝条**：当前会话上下文剩余（与官方 UI 同源的 `contextPressure` 投影），随对话增长从满格减少。
- ▲▼ **峰谷定价**：官方规则（北京时间 09:00–12:00 / 14:00–18:00 为高峰，谷时半价），显示当前单价与距下次切换倒计时（每秒跳动）。
- ⚡ **自动压缩**：上下文剩余 < 5% 时自动触发 `/compact`；压缩满 2 轮后出现「开启新对话（携带记忆）」按钮；不点击则继续自动压缩。
- 🔁 **携带记忆新对话**：点击后用当前模型生成记忆摘要 → 新建会话并注入记忆（不回答旧问题、不丢记忆），新会话上下文重新累计。

## 实时机制

| 数据 | 刷新机制 | 实时粒度 |
|---|---|---|
| ❤ 血条（余额） | 客户端每 3 秒轮询宿主 → 宿主缓存 30 秒后重查官方余额接口 | 花钱后 ≤30s 内血条下降 |
| ✦ 蓝条（上下文） | 每 3 秒重新测量会话（与官方 UI 同源投影数据） | 每发一条消息就变 |
| ▲▼ 峰谷 + 倒计时 | 价格按官方时段即时计算；倒计时每秒本地跳动 | 秒级 |
| ⚡ 压缩轮数 / 按钮 | 每 3 秒从会话事件日志统计 `compaction/end` | 压缩完成后 3 秒内出现 |

## 数据通道

- 宿主注册三个同源 HTTP 路由：`GET /hud/state`、`POST /hud/digest`、`POST /hud/seed`。
- API Key 经宿主 `credentials` 服务解析（默认 `DEEPSEEK_API_KEY`，自动读取 `llm-deepseek` 配置中的 `apiKeyEnv`）。
- 客户端以 `window.__ModuleLoader__.load()` 手写格式打包，无需构建器。

## 安装

在 DSH 的 web profile（如 `E:\.dsh\profiles\web`）中：

```jsonc
// package.json
{
  "dependencies": { "dsh-game-hud": "file:./packages/dsh-game-hud" },
  "dsh": { "profile": { "bundles": ["dsh-game-hud"] } }
}
```

然后 `pnpm install` 并重启 DSH，浏览器右下角会出现可拖动的 HUD 面板。

## 许可

MIT
