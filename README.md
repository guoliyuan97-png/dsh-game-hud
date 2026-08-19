# dsh-game-hud

游戏风格悬浮 HUD 插件（DeepSeek Harness）。

- ❤ **血条**：实时显示 DeepSeek 账户余额（官方 `user/balance` 接口），满格金额可配置（默认 ¥20）。
- ✦ **蓝条**：当前会话上下文剩余（与官方 UI 同源的 `contextPressure` 投影），随对话增长从满格减少。
- 🚨 **低余额告警**：余额（血条）低于阈值（默认 10%）时，悬浮窗四周闪烁红光（可配置开关）。
- 🗜️ **折叠迷你视图**：折叠后显示紧凑的血条 + 蓝条，随时扫一眼余额与上下文。
- ▲▼ **峰谷定价**：官方规则（北京时间 09:00–12:00 / 14:00–18:00 为高峰，谷时半价），显示当前单价与距下次切换倒计时（每秒跳动）。
- ⚡ **自动压缩**：上下文剩余 < 5% 时自动触发 `/compact`；压缩满 2 轮后出现「开启新对话（携带记忆）」按钮；不点击则继续自动压缩。
- 🔁 **携带记忆新对话**：点击后用当前模型生成记忆摘要 → 新建会话并注入记忆（不回答旧问题、不丢记忆），新会话上下文重新累计。

## 配置

所有配置项都有默认值，可通过 **DSH 设置 → 插件 → dsh-game-hud** 界面编辑（保存后 HUD 实时生效，无需重启），或在 profile 的 `cordis.patch.yml` 中覆盖：

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `maxBalance` | number | `20` | 血条满格金额（CNY）。余额超过此值显示满格，低于按比例减少 |
| `lowAlert` | boolean | `true` | 低余额红光告警开关：余额（血条）低于 `lowThreshold` 时，悬浮窗四周闪烁红光 |
| `lowThreshold` | number | `10` | 告警阈值（%）。仅血条触发，蓝条（上下文）不触发 |
| `priceTable` | object | `{}` | 可选：按模型覆盖峰谷单价（元/百万 tokens）。未覆盖的模型用内置价格表 |

`cordis.patch.yml` 示例：

```yaml
- insert:
    - id: game-hud
      name: 'dsh-game-hud'
      config:
        maxBalance: 50
        lowAlert: true
        lowThreshold: 10
        priceTable:
          deepseek-v4-flash:
            peak: { input: 3.0, output: 9.0, cacheHit: 0.1 }
            valley: { input: 1.5, output: 4.5, cacheHit: 0.05 }
```

## 实时机制

| 数据 | 刷新机制 | 实时粒度 |
|---|---|---|
| ❤ 血条（余额） | 客户端每 3 秒轮询宿主 → 宿主缓存 30 秒后重查官方余额接口 | 花钱后 ≤30s 内血条下降 |
| ✦ 蓝条（上下文） | 每 3 秒重新测量会话（与官方 UI 同源投影数据） | 每发一条消息就变 |
| ▲▼ 峰谷 + 倒计时 | 价格按官方时段即时计算；倒计时每秒本地跳动 | 秒级 |
| ⚡ 压缩轮数 / 按钮 | 每 3 秒从会话事件日志统计 `compaction/end` | 压缩完成后 3 秒内出现 |

## 数据通道

- 宿主注册三个同源 HTTP 路由：
  - `GET /hud/state?sessionId=<id>` — 实时状态：余额 / 上下文 / 峰谷定价 / 压缩轮数 / `maxBalance`
  - `POST /hud/digest` — 用当前模型生成记忆摘要（携带记忆新对话的数据源）
  - `POST /hud/seed` — 向新会话静默注入记忆（`user/message` append，不触发 agent 回复、不回答旧问题）
- API Key 经宿主 `credentials` 服务解析（默认 `DEEPSEEK_API_KEY`，自动读取 `llm-deepseek` 配置中的 `apiKeyEnv`）。
- 客户端以 `window.__ModuleLoader__.load()` 手写格式打包，无需构建器。

## 安装

### 方式一：dsh 命令安装（推荐）

```bash
dsh plugin --profile web add github:guoliyuan97-png/dsh-game-hud#v1.2.0
```

安装后重启 DSH：HUD 面板出现在浏览器右下角；配置入口在 **设置 → 插件 → dsh-game-hud**。

### 方式二：从 GitHub 直接安装

在 DSH 的 web profile（如 `E:\.dsh\profiles\web`）中：

```jsonc
// package.json
{
  "dependencies": {
    "dsh-game-hud": "github:guoliyuan97-png/dsh-game-hud#v1.2.0"
  },
  "dsh": { "profile": { "bundles": ["dsh-game-hud"] } }
}
```

然后 `pnpm install` 并重启 DSH，浏览器右下角会出现可拖动的 HUD 面板。

### 方式三：本地开发（file: 引用）

```jsonc
// package.json
{
  "dependencies": { "dsh-game-hud": "file:./packages/dsh-game-hud" },
  "dsh": { "profile": { "bundles": ["dsh-game-hud"] } }
}
```

## 许可

MIT
