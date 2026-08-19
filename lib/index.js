/**
 * dsh-game-hud host entry.
 *
 * Serves two same-origin HTTP routes consumed by the browser HUD:
 *   GET  /hud/state?sessionId=<id>   -> balance / context / pricing / compaction
 *   POST /hud/digest                 -> { sessionId } -> memory digest for a new conversation
 *
 * All host services are resolved lazily per request (they may not be mounted
 * when this plugin's apply runs), with the API key falling back to a direct
 * read of $DSH_HOME/.credentials.yaml when the credentials service is silent.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-game-hud'

/**
 * Plugin config (editable in DSH settings / cordis.patch.yml):
 *   maxBalance - the HP bar's full-scale amount in CNY. Default 20 (matches
 *                the original "血条展现为20元" design); users with larger
 *                balances or a different budget can raise it.
 *   priceTable - optional per-model peak/valley prices (CNY per million tokens)
 *                for the pricing panel. Falls back to the built-in table for
 *                models not listed here.
 *   lowAlert   - flash red around the HUD frame when either bar drops below
 *                `lowThreshold` percent. Default true.
 *   lowThreshold - percent below which the low-bar red flash triggers.
 *                Default 10.
 */
export const Config = z.object({
  maxBalance: z.number().min(0.01).default(20),
  priceTable: z.dict(z.object({
    peak: z.object({ input: z.number().min(0), output: z.number().min(0), cacheHit: z.number().min(0).default(0) }),
    valley: z.object({ input: z.number().min(0), output: z.number().min(0), cacheHit: z.number().min(0).default(0) }),
  })).default({}),
  lowAlert: z.boolean().default(true),
  lowThreshold: z.number().min(1).max(99).default(10),
})

const BALANCE_TTL = 30 * 1000
const KEY_TTL = 10 * 60 * 1000
const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]
const PRICE_TABLE = {
  'deepseek-v4-flash': {
    peak: { input: 3.0, output: 9.0, cacheHit: 0.1 },
    valley: { input: 1.5, output: 4.5, cacheHit: 0.05 },
  },
  'deepseek-v4-pro': {
    peak: { input: 9.0, output: 27.0, cacheHit: 0.3 },
    valley: { input: 4.5, output: 13.5, cacheHit: 0.15 },
  },
}

export function apply(ctx, config = {}) {
  let keyCache = null
  let balanceCache = null

  // Resolve config defensively: Cordis validates against `Config` at load time,
  // but direct/programmatic callers may pass a partial object.
  // Live values come from the registered `game-hud` settings namespace (editable
  // in Settings → Plugins → dsh-game-hud without a restart); the composition
  // entry config acts as the boot-time base.
  const bootMaxBalance = Number.isFinite(Number(config.maxBalance)) && Number(config.maxBalance) > 0
    ? Number(config.maxBalance)
    : 20
  const bootPriceTable = config.priceTable && typeof config.priceTable === 'object' && !Array.isArray(config.priceTable)
    ? config.priceTable
    : {}
  const bootAlert = typeof config.lowAlert === 'boolean' ? config.lowAlert : true
  const bootThreshold = Number.isFinite(Number(config.lowThreshold)) ? Number(config.lowThreshold) : 10

  const svc = () => ({
    settings: ctx.get('settings'),
    credentials: ctx.get('credentials'),
    sessions: ctx.get('sessions'),
    tokenMeter: ctx.get('tokenMeter'),
    sessionProjections: ctx.get('sessionProjections'),
    llm: ctx.get('llm'),
    agentDefaultModel: ctx.get('agentDefaultModel'),
  })

  // Resolve the current maxBalance from the settings namespace when mounted.
  function resolveMaxBalance() {
    const s = svc()
    if (s.settings && typeof s.settings.get === 'function') {
      try {
        const v = s.settings.get('game-hud')
        if (v && Number.isFinite(Number(v.maxBalance)) && Number(v.maxBalance) > 0) {
          return Number(v.maxBalance)
        }
      } catch (e) { /* ignore */ }
    }
    return bootMaxBalance
  }

  // Resolve the effective price table: settings overrides boot config, which
  // overrides the built-in table.
  function effectivePriceTable() {
    let userTable = bootPriceTable
    const s = svc()
    if (s.settings && typeof s.settings.get === 'function') {
      try {
        const v = s.settings.get('game-hud')
        if (v && v.priceTable && typeof v.priceTable === 'object') userTable = v.priceTable
      } catch (e) { /* ignore */ }
    }
    const table = { ...PRICE_TABLE }
    if (userTable && typeof userTable === 'object') {
      for (const key of Object.keys(userTable)) {
        const entry = userTable[key]
        if (entry && typeof entry === 'object' && entry.peak && entry.valley) {
          table[key.toLowerCase()] = {
            peak: {
              input: Number(entry.peak.input) || 0,
              output: Number(entry.peak.output) || 0,
              cacheHit: Number(entry.peak.cacheHit) || 0,
            },
            valley: {
              input: Number(entry.valley.input) || 0,
              output: Number(entry.valley.output) || 0,
              cacheHit: Number(entry.valley.cacheHit) || 0,
            },
          }
        }
      }
    }
    return table
  }

  // Resolve the low-balance alert config: whether the HUD flashes red when the
  // HP bar (balance) drops below `lowThreshold` percent.
  function resolveAlert() {
    const s = svc()
    let alert = typeof bootAlert === 'boolean' ? bootAlert : true
    let threshold = Number.isFinite(Number(bootThreshold)) ? Number(bootThreshold) : 10
    if (s.settings && typeof s.settings.get === 'function') {
      try {
        const v = s.settings.get('game-hud')
        if (v && typeof v.lowAlert === 'boolean') alert = v.lowAlert
        if (v && Number.isFinite(Number(v.lowThreshold))) threshold = Number(v.lowThreshold)
      } catch (e) { /* ignore */ }
    }
    return { enabled: alert, threshold }
  }

  function fileApiKey(refName) {
    try {
      const home = process.env.DSH_HOME || ''
      const files = home ? [join(home, '.credentials.yaml'), join(home, '.env')] : []
      for (const f of files) {
        if (!existsSync(f)) continue
        const text = readFileSync(f, 'utf8')
        for (const line of text.split(/\r?\n/)) {
          const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*["']?([^"'\s#]+)/.exec(line)
          if (m && m[1] === refName && m[2]) return m[2]
        }
      }
    } catch (e) { /* ignore */ }
    return null
  }

  async function resolveApiKey() {
    if (keyCache && Date.now() - keyCache.at < KEY_TTL) return keyCache.value
    const s = svc()
    let refName = 'DEEPSEEK_API_KEY'
    if (s.settings) {
      try {
        const cfg = s.settings.get('llm-deepseek')
        if (cfg && typeof cfg.apiKeyEnv === 'string' && cfg.apiKeyEnv) refName = cfg.apiKeyEnv
      } catch (e) { /* ignore */ }
    }
    let value = null
    if (s.credentials) {
      try {
        const cred = await s.credentials.resolve(refName)
        if (cred && cred.value) value = cred.value
      } catch (e) { /* ignore */ }
      if (!value && refName !== 'DEEPSEEK_API_KEY') {
        try {
          const cred = await s.credentials.resolve('DEEPSEEK_API_KEY')
          if (cred && cred.value) value = cred.value
        } catch (e) { /* ignore */ }
      }
    }
    if (!value) value = fileApiKey(refName) || (refName !== 'DEEPSEEK_API_KEY' ? fileApiKey('DEEPSEEK_API_KEY') : null)
    if (value) keyCache = { value, at: Date.now() }
    return value
  }

  async function fetchBalance() {
    if (balanceCache && Date.now() - balanceCache.at < BALANCE_TTL) {
      return Object.assign({ cached: true }, balanceCache.data)
    }
    const key = await resolveApiKey()
    if (!key) {
      const data = { ok: false, reason: 'no-api-key' }
      balanceCache = { data, at: Date.now() }
      return data
    }
    try {
      const response = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: 'Bearer ' + key },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        const data = { ok: false, reason: 'http-' + response.status }
        balanceCache = { data, at: Date.now() }
        return data
      }
      const body = await response.json()
      const infos = Array.isArray(body.balance_infos) ? body.balance_infos : []
      const cny = infos.find((i) => i && i.currency === 'CNY') || infos[0]
      if (!cny || cny.total_balance === undefined) {
        const data = { ok: false, reason: 'bad-response' }
        balanceCache = { data, at: Date.now() }
        return data
      }
      const data = { ok: true, total: Number(cny.total_balance), currency: cny.currency }
      balanceCache = { data, at: Date.now() }
      return data
    } catch (e) {
      const data = { ok: false, reason: 'fetch-failed' }
      balanceCache = { data, at: Date.now() }
      return data
    }
  }

  function currentRoute(session) {
    if (session) {
      try {
        const rc = typeof session.requestContext === 'function' ? session.requestContext() : undefined
        if (rc && rc.provider && rc.model) return { provider: rc.provider, model: rc.model }
      } catch (e) { /* ignore */ }
    }
    const s = svc()
    if (s.agentDefaultModel) {
      try {
        const sel = s.agentDefaultModel.currentSelection()
        if (sel && sel.provider && sel.model) return { provider: sel.provider, model: sel.model }
      } catch (e) { /* ignore */ }
    }
    if (s.settings) {
      try {
        const cfg = s.settings.get('agent-default-model')
        if (cfg && cfg.provider && cfg.model) return { provider: cfg.provider, model: cfg.model }
      } catch (e) { /* ignore */ }
    }
    return null
  }

  async function contextState(session) {
    if (!session) return null
    const s = svc()
    let used = null
    let window = null
    try {
      if (s.sessionProjections) {
        const snap = s.sessionProjections.snapshot(session)
        const cp = snap && snap.contextPressure
        if (cp) {
          used = cp.projectedTokens != null ? cp.projectedTokens : cp.pressureTokens
          window = cp.contextWindow
        }
      }
    } catch (e) { /* ignore */ }
    if (used == null && s.tokenMeter) {
      try {
        const m = s.tokenMeter.measure(session)
        if (m) used = m.totalTokens
      } catch (e) { /* ignore */ }
    }
    if (window == null) {
      try {
        const rc = typeof session.requestContext === 'function' ? session.requestContext() : undefined
        if (rc && rc.contextWindow) window = rc.contextWindow
      } catch (e) { /* ignore */ }
    }
    if (window == null) {
      const route = currentRoute(session)
      if (route && s.llm) {
        try {
          const mi = await s.llm.resolveModelInfo(route.provider, route.model)
          if (mi && mi.context && mi.context.contextWindow) window = mi.context.contextWindow
        } catch (e) { /* ignore */ }
      }
    }
    if (used == null || window == null) {
      return { usedTokens: used, contextWindow: window, ratio: null, remainingRatio: null }
    }
    const ratio = Math.max(0, Math.min(1, used / window))
    return { usedTokens: used, contextWindow: window, ratio, remainingRatio: 1 - ratio }
  }

  function compactionStats(session) {
    if (!session) return { rounds: 0, compressing: false }
    let starts = 0
    let ends = 0
    try {
      const events = session.events
      if (Array.isArray(events)) {
        for (let i = 0; i < events.length; i++) {
          const ev = events[i]
          if (!ev || typeof ev.type !== 'string') continue
          if (ev.type === 'compaction/start') starts++
          else if (ev.type === 'compaction/end') ends++
        }
      }
    } catch (e) { /* ignore */ }
    return { rounds: ends, compressing: starts > ends }
  }

  function beijingMinutes() {
    const d = new Date(Date.now() + 8 * 3600 * 1000)
    return d.getUTCHours() * 60 + d.getUTCMinutes()
  }

  function fmtHM(totalMins) {
    const m = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60)
    const h = Math.floor(m / 60)
    const mm = m % 60
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
  }

  function pricingState(model) {
    const mins = beijingMinutes()
    let isPeak = false
    let next = null
    for (let i = 0; i < PEAK_WINDOWS.length; i++) {
      const w = PEAK_WINDOWS[i]
      if (mins >= w[0] && mins < w[1]) { isPeak = true; next = w[1]; break }
    }
    if (next == null) {
      let earliest = null
      for (let i = 0; i < PEAK_WINDOWS.length; i++) {
        const s = PEAK_WINDOWS[i][0]
        if (s > mins && (earliest == null || s < earliest)) earliest = s
      }
      next = earliest == null ? 9 * 60 + 24 * 60 : earliest
    }
    const nextSwitchMinutes = next - mins
    const nextIsPeak = !isPeak
    let table = null
    const key = model ? String(model).toLowerCase() : ''
    if (key) {
      const ks = Object.keys(effectivePriceTable())
      for (let i = 0; i < ks.length; i++) {
        if (key.indexOf(ks[i]) !== -1) { table = effectivePriceTable()[ks[i]]; break }
      }
    }
    const price = table ? table[isPeak ? 'peak' : 'valley'] : null
    return {
      isPeak,
      price,
      nextSwitchMinutes,
      nextTime: fmtHM(next),
      nextIsPeak,
      peakWindows: ['09:00-12:00', '14:00-18:00'],
      tz: 'UTC+8',
    }
  }

  function textOf(content) {
    if (content == null) return ''
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      const parts = []
      for (let i = 0; i < content.length; i++) {
        const b = content[i]
        if (b == null) continue
        if (typeof b === 'string') parts.push(b)
        else if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
      }
      return parts.join(' ')
    }
    return ''
  }

  function json(res, status, data) {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(body)
  }

  async function buildDigest(sessionId) {
    const s = svc()
    if (!sessionId || !s.sessions) return { ok: false, error: 'session-missing' }
    const session = s.sessions.get(sessionId)
    if (!session) return { ok: false, error: 'session-not-found' }
    let msgs = []
    try {
      if (typeof session.deriveMessages === 'function') msgs = session.deriveMessages()
    } catch (e) { /* ignore */ }
    let provider = null
    let model = null
    try {
      const rc = typeof session.requestContext === 'function' ? session.requestContext() : undefined
      if (rc && rc.provider && rc.model) { provider = rc.provider; model = rc.model }
    } catch (e) { /* ignore */ }
    if (!provider || !model) {
      const route = currentRoute(session)
      if (route) { provider = route.provider; model = route.model }
    }
    if (!provider || !model) return { ok: false, error: 'no-route' }
    const recent = msgs.slice(-48)
    let digest = ''
    if (s.llm && recent.length > 0) {
      try {
        const system = [
          '你是 DSH 的"记忆迁移官"。用户即将开启一个新对话，需要把当前对话的核心记忆带到新会话。',
          '请用简体中文输出一份精炼的"前情提要"，包含：1) 用户的目标与当前任务进度；2) 已经完成的关键工作（文件、命令、结论）；3) 尚未完成的事项和下一步计划；4) 重要的数据、路径、约定。',
          '要求：结构化分点、直白无废话、300~800字；只输出摘要正文，不要任何开场白。',
        ].join('\n')
        const stream = s.llm.stream({
          provider,
          model,
          messages: recent,
          system,
          purpose: 'compaction',
          maxTokens: 2048,
        })
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') digest += chunk.text
          else if (chunk.type === 'finish' || chunk.type === 'error' || chunk.type === 'aborted') break
        }
        digest = digest.trim()
      } catch (e) {
        digest = ''
      }
    }
    if (!digest) {
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]
        if (m && m.role === 'user') {
          const t = textOf(m.content)
          if (t) {
            digest = '（自动生成记忆摘要失败，以下为最近一次提问，完整历史请回看原会话）\n' + t.slice(0, 1000)
            break
          }
        }
      }
    }
    if (!digest) digest = '（当前会话暂无可以迁移的对话内容）'
    return { ok: true, digest, fromSession: sessionId }
  }

  const stateHandler = async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const sessionId = url.searchParams.get('sessionId')
      const s = svc()
      const session = sessionId && s.sessions ? s.sessions.get(sessionId) : undefined
      const route = currentRoute(session)
      const model = route ? route.model : null
      const balance = await fetchBalance()
      const context = await contextState(session)
      const pricing = pricingState(model)
      const cs = compactionStats(session)
      json(res, 200, {
        ok: true,
        model: route,
        balance,
        maxBalance: resolveMaxBalance(),
        alert: resolveAlert(),
        context,
        pricing,
        compression: { rounds: cs.rounds, compressing: cs.compressing },
        ts: Date.now(),
      })
    } catch (e) {
      json(res, 500, { ok: false, error: e && e.message ? e.message : String(e) })
    }
  }

  const digestHandler = async (req, res) => {
    try {
      let raw = ''
      for await (const chunk of req) raw += chunk
      let sessionId = null
      try {
        const parsed = JSON.parse(raw || '{}')
        sessionId = parsed && parsed.sessionId ? String(parsed.sessionId) : null
      } catch (e) { /* ignore */ }
      const result = await buildDigest(sessionId)
      json(res, 200, result)
    } catch (e) {
      json(res, 500, { ok: false, error: e && e.message ? e.message : String(e) })
    }
  }

  const seedHandler = async (req, res) => {
    try {
      let raw = ''
      for await (const chunk of req) raw += chunk
      let sessionId = null
      let digest = ''
      try {
        const parsed = JSON.parse(raw || '{}')
        sessionId = parsed && parsed.sessionId ? String(parsed.sessionId) : null
        digest = parsed && typeof parsed.digest === 'string' ? parsed.digest : ''
      } catch (e) { /* ignore */ }
      if (!sessionId || !digest) {
        json(res, 400, { ok: false, error: 'missing-sessionId-or-digest' })
        return
      }
      const s = svc()
      const session = s.sessions ? s.sessions.get(sessionId) : undefined
      if (!session) {
        json(res, 404, { ok: false, error: 'session-not-found' })
        return
      }
      const text = '【前情提要 · 自动迁移】\n\n' + digest + '\n\n以上记忆已迁移到本会话。请先读取并记住这些内容，但不要回答其中提到的任何旧问题，也不要继续执行旧任务，等待用户的新指令。'
      const event = session.append('user/message', {
        id: 'hud-memory-' + Date.now(),
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'user', rpcId: 'dsh-game-hud' },
      }, { surfaceOp: 'append' })
      json(res, 200, { ok: true, seq: event.seq, sessionId })
    } catch (e) {
      json(res, 500, { ok: false, error: e && e.message ? e.message : String(e) })
    }
  }

  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => {
      const offState = hostCtx.webServer.register({ kind: 'exact', path: '/hud/state', handler: stateHandler })
      const offDigest = hostCtx.webServer.register({ kind: 'exact', path: '/hud/digest', handler: digestHandler })
      const offSeed = hostCtx.webServer.register({ kind: 'exact', path: '/hud/seed', handler: seedHandler })
      return () => {
        offState()
        offDigest()
        offSeed()
      }
    }, 'dsh-game-hud: hud routes')
  })

  // Register the `game-hud` settings namespace: makes the plugin appear under
  // Settings → Plugins with an editable config card (maxBalance / priceTable),
  // persisted to the profile settings file and live-resolved by the HUD routes.
  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register('game-hud', Config, { base: config })
    ctx.effect(() => () => {
      try { scope.dispose?.() } catch (e) { /* ignore */ }
    }, 'dsh-game-hud: settings scope')
  })
}
