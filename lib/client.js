// dsh-game-hud browser half: a draggable cyber-neon floating HUD (shell.overlay)
// showing an HP bar (DeepSeek balance vs ¥20), an MP bar (context remaining),
// official peak/valley pricing with a switch countdown, auto-compaction at
// <5% context, and a memory-carrying "new conversation" button.
//
// Self-contained by hand (no bundler): the client module system wraps this in
// a CJS factory and the kernel adopts { apply, inject } as a client plugin.
// Host data flows over the same-origin routes /hud/state and /hud/digest.
window.__ModuleLoader__.load({
  id: 'dsh-game-hud',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const AUTO_COMPACT_RATIO = 0.95
    const AUTO_COMPACT_COOLDOWN_MS = 90 * 1000
    const NEW_CONVERSATION_ROUNDS = 2
    const MAX_BALANCE_FALLBACK = 20

    const CSS = [
      '.dsh-hud{position:fixed;width:320px;z-index:20;pointer-events:auto;background:linear-gradient(160deg,rgba(10,14,26,.95),rgba(5,8,16,.97));border:1px solid rgba(90,220,255,.4);border-radius:12px;color:#d8e7f6;font-family:"Cascadia Code",Consolas,"JetBrains Mono",monospace;font-size:12px;box-shadow:0 0 20px rgba(0,180,255,.28),0 10px 36px rgba(0,0,0,.65),inset 0 0 24px rgba(0,180,255,.05);overflow:hidden;user-select:none;-webkit-user-select:none}',
      '.dsh-hud::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.028) 0 1px,transparent 1px 3px)}',
      '.dsh-hud-head{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;cursor:move;background:linear-gradient(90deg,rgba(0,180,255,.2),rgba(255,45,85,.14));border-bottom:1px solid rgba(90,220,255,.28);font-size:11px;letter-spacing:2px;text-shadow:0 0 8px rgba(0,220,255,.9);touch-action:none}',
      '.dsh-hud-head-right{display:flex;align-items:center;gap:8px}',
      '.dsh-hud-sess{color:rgba(216,231,246,.5);font-size:10px;letter-spacing:0;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-hud-min{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);color:#cfe9ff;border-radius:4px;cursor:pointer;font-size:11px;line-height:1;padding:2px 6px}',
      '.dsh-hud-min:hover{background:rgba(255,255,255,.18)}',
      '.dsh-hud-body{padding:2px 0 8px}',
      '.dsh-hud-row{padding:8px 12px 2px}',
      '.dsh-hud-mini .dsh-hud-row{padding:6px 10px 2px}',
      '.dsh-hud-mini .dsh-bar{height:10px}',
      '.dsh-hud-mini .dsh-bar-label{margin-bottom:3px;font-size:10px}',
      '.dsh-bar-label{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;margin-bottom:4px}',
      '.dsh-label-hp{color:#ff6b81;text-shadow:0 0 8px rgba(255,45,85,.9)}',
      '.dsh-label-mp{color:#58c6ff;text-shadow:0 0 8px rgba(31,143,255,.9)}',
      '.dsh-bar{position:relative;height:15px;border-radius:8px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);overflow:hidden;box-shadow:inset 0 2px 6px rgba(0,0,0,.75)}',
      '.dsh-bar-fill{position:absolute;inset:0 auto 0 0;border-radius:8px;transition:width .6s cubic-bezier(.2,.8,.2,1)}',
      '.dsh-bar-fill.hp{background:linear-gradient(90deg,#5a0a18,#ff2d55 55%,#ff7a8f);box-shadow:0 0 14px rgba(255,45,85,.85)}',
      '.dsh-bar-fill.mp{background:linear-gradient(90deg,#05325c,#1f8fff 55%,#6fd0ff);box-shadow:0 0 14px rgba(31,143,255,.85)}',
      '.dsh-bar-fill.low{animation:dshPulse .8s ease-in-out infinite}',
      '@keyframes dshPulse{0%,100%{opacity:1}50%{opacity:.4}}',
      '.dsh-bar-ticks{position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(0,0,0,.4) 0 2px,transparent 2px 20%);pointer-events:none}',
      '.dsh-hud-note{font-size:10px;color:rgba(216,231,246,.55);margin-top:3px}',
      '.dsh-price-row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px}',
      '.dsh-price-left{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dsh-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;letter-spacing:1px;white-space:nowrap}',
      '.dsh-badge-peak{color:#ffb35c;background:rgba(255,120,30,.16);border:1px solid rgba(255,140,40,.7);box-shadow:0 0 10px rgba(255,120,30,.5);animation:dshPulse 1.6s ease-in-out infinite}',
      '.dsh-badge-valley{color:#58e0ff;background:rgba(0,180,255,.14);border:1px solid rgba(0,200,255,.7);box-shadow:0 0 10px rgba(0,180,255,.5)}',
      '.dsh-countdown{font-size:10px;color:rgba(216,231,246,.7)}',
      '.dsh-price-right{font-size:11px;color:#ffe9a8;text-shadow:0 0 8px rgba(255,210,63,.6);white-space:nowrap}',
      '.dsh-comp-row{margin-top:6px;border-top:1px dashed rgba(90,220,255,.22);padding-top:8px}',
      '.dsh-comp-status{font-size:11px;color:rgba(216,231,246,.75);margin-bottom:6px}',
      '.dsh-new-btn{width:100%;padding:9px 12px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;color:#ffd9a8;background:rgba(20,28,48,.65);border:1px solid rgba(255,190,90,.4);box-shadow:0 0 10px rgba(255,170,60,.12)}',
      '.dsh-new-btn:hover{background:rgba(40,52,84,.8);border-color:rgba(255,200,110,.6)}',
      '.dsh-new-btn:disabled{opacity:.6;cursor:wait}',
      '.dsh-new-hint{font-size:10px;color:rgba(216,231,246,.5);text-align:center;margin-top:5px}',
      '.dsh-hud-error{font-size:10px;color:#ff7a8f;margin-top:6px;word-break:break-all}',
      '.dsh-hud-collapsed .dsh-hud-body{display:none}',
      '.dsh-hud-collapsed{width:auto}',
      '.dsh-hud-mini{display:flex;align-items:center;gap:10px;padding:7px 10px 9px;border-top:1px solid rgba(90,220,255,.22)}',
      '.dsh-hud-mini .dsh-bar{height:10px;flex:1;min-width:0}',
      '.dsh-hud-mini .dsh-bar-label{margin-bottom:3px;font-size:10px}',
      '.dsh-hud-mini .dsh-bar-fill{transition:width .6s cubic-bezier(.2,.8,.2,1)}',
      '.dsh-hud-mini .dsh-hud-note{margin-top:2px}',
      '.dsh-hud-standby{width:auto;padding:10px 14px;font-size:11px;letter-spacing:1px;color:rgba(216,231,246,.7)}',
      '.dsh-hud-alert{animation:dshAlert .9s ease-in-out infinite}',
      '@keyframes dshAlert{0%,100%{box-shadow:0 0 18px rgba(255,45,85,.85),0 0 40px rgba(255,45,85,.45),inset 0 0 24px rgba(255,45,85,.25);border-color:rgba(255,80,110,.95)}50%{box-shadow:0 0 6px rgba(255,45,85,.25),0 0 14px rgba(255,45,85,.12),inset 0 0 8px rgba(255,45,85,.08);border-color:rgba(255,80,110,.5)}}',
    ].join('\n')

    function fmtTokens(n) {
      if (n == null) return '—'
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
      return String(Math.round(n))
    }

    function fmtDur(mins) {
      const m = Math.max(0, Math.round(mins))
      if (m >= 60) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'
      return m + 'm'
    }

    function apply(ctx) {
      const sessionsSvc = ctx.get('sessions')
      const slotsSvc = ctx.get('slots')
      if (slotsSvc === undefined) return

      function Hud(props) {
        const useSessions = props.useSessions
        if (typeof useSessions !== 'function') {
          return React.createElement('div', { className: 'dsh-hud dsh-hud-standby' }, '⚡ HUD 等待会话…')
        }
        const currentId = useSessions((s) => {
        	if (!s || !s.byId) return null
        	const entries = Object.values(s.byId)
        	for (let i = 0; i < entries.length; i++) {
        		const item = entries[i]
        		if (item && ((item.retainedBy && item.retainedBy.mainView) || 0) > 0) return item.id
        	}
        	return null
        })

        const [hud, setHud] = React.useState(null)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState('')
        const [minimized, setMinimized] = React.useState(false)
        const [pos, setPos] = React.useState({ x: null, y: null })
        const [drag, setDrag] = React.useState(null)
        const flags = React.useState({ lastAutoCompact: 0 })[0]
        const [tick, setTick] = React.useState(Date.now())

        React.useEffect(function () {
          const t = ctx.interval(function () { setTick(Date.now()) }, 1000)
          return function () { t() }
        }, [])

        React.useEffect(function () {
          if (!currentId) return
          let alive = true
          const poll = async function () {
            try {
              const res = await fetch('/hud/state?sessionId=' + encodeURIComponent(currentId))
              const data = await res.json()
              if (!alive) return
              setHud(data)
              if (data && data.ok) {
                const ratio = data.context && data.context.ratio
                const now = Date.now()
                const cooldownOk = now - flags.lastAutoCompact >= AUTO_COMPACT_COOLDOWN_MS
                const notCompressing = !(data.compression && data.compression.compressing)
                if (ratio != null && ratio > AUTO_COMPACT_RATIO && cooldownOk && notCompressing) {
                  flags.lastAutoCompact = now
                  const b = sessionsSvc.binding(currentId)
                  if (b && b.session) {
                    b.session.command('/compact').catch(function () {})
                  }
                }
              }
            } catch (e) { /* ignore */ }
          }
          poll()
          const t = ctx.interval(poll, 3000)
          return function () { alive = false; t() }
        }, [currentId])

        const onHandleDown = function (e) {
          if (e.button !== 0) return
          if (e.target && e.target.closest && e.target.closest('.dsh-hud-min')) return
          const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
          const vh = typeof window !== 'undefined' ? window.innerHeight : 800
          const W = 320
          const H = 340
          const baseX = pos.x == null ? vw - W - 16 : pos.x
          const baseY = pos.y == null ? vh - H - 16 : pos.y
          setDrag({ startX: e.clientX, startY: e.clientY, baseX, baseY })
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
        }
        const onHandleMove = function (e) {
          if (!drag) return
          const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
          const vh = typeof window !== 'undefined' ? window.innerHeight : 800
          const W = 320
          const H = 340
          let nx = drag.baseX + (e.clientX - drag.startX)
          let ny = drag.baseY + (e.clientY - drag.startY)
          nx = Math.max(8, Math.min(nx, vw - W - 8))
          ny = Math.max(8, Math.min(ny, vh - H - 8))
          setPos({ x: nx, y: ny })
        }
        const onHandleUp = function () { setDrag(null) }

        const pendingSeed = React.useRef(null)

        // The new session is selected by startSession(); seed it as soon as the
        // selection changes, so the memory lands before the user types anything.
        React.useEffect(function () {
        	const pending = pendingSeed.current
        	if (!pending || !currentId || currentId === pending.fromId) return
        	pendingSeed.current = null
        	fetch('/hud/seed', {
        		method: 'POST',
        		headers: { 'Content-Type': 'application/json' },
        		body: JSON.stringify({ sessionId: currentId, digest: pending.digest }),
        	})
        		.then(function (res) { return res.json() })
        		.then(function (data) {
        			if (!data || !data.ok) throw new Error(data && data.error ? String(data.error) : 'seed-failed')
        		})
        		.catch(function (e) { setError(e && e.message ? e.message : String(e)) })
        }, [currentId])

        const onNewConversation = async function () {
        	if (!currentId || busy) return
        	setBusy(true)
        	setError('')
        	try {
        		// 1. Ask the host half for a digest of the session we are leaving.
        		const res = await fetch('/hud/digest', {
        			method: 'POST',
        			headers: { 'Content-Type': 'application/json' },
        			body: JSON.stringify({ sessionId: currentId }),
        		})
        		const data = await res.json()
        		if (!data || !data.ok || !data.digest) {
        			throw new Error(data && data.error ? String(data.error) : 'digest-failed')
        		}
        		// 2. Start a fresh session through the workspace service and let the
        		//    effect above inject the digest once the selection moves.
        		const workspace = ctx.get('uiWorkspace')
        		if (!workspace || typeof workspace.startSession !== 'function') throw new Error('ui-workspace-unavailable')
        		pendingSeed.current = { fromId: currentId, digest: data.digest }
        		workspace.startSession()
        	} catch (e) {
        		setError(e && e.message ? e.message : String(e))
        	} finally {
        		setBusy(false)
        	}
        }
        const b = hud && hud.balance
        const c = hud && hud.context
        const p = hud && hud.pricing
        const comp = hud && hud.compression
        const maxBalance = hud && Number(hud.maxBalance) > 0 ? Number(hud.maxBalance) : MAX_BALANCE_FALLBACK
        // 低余额红光告警（仅血条）：配置开关 lowAlert + 阈值 lowThreshold（默认 10%）
        const alertCfg = hud && hud.alert && typeof hud.alert === 'object' ? hud.alert : {}
        const alertEnabled = alertCfg.enabled !== false
        const alertThreshold = Number.isFinite(Number(alertCfg.threshold)) ? Number(alertCfg.threshold) : 10
        const roundsN = comp ? comp.rounds : 0
        const showNewBtn = roundsN >= NEW_CONVERSATION_ROUNDS
        const balanceOk = !!(b && b.ok)
        const balanceTotal = balanceOk ? Number(b.total) : 0
        const hpPct = balanceOk ? Math.max(0, Math.min(100, (balanceTotal / maxBalance) * 100)) : 0
        const lowHp = balanceOk && hpPct < alertThreshold
        const hudAlert = alertEnabled && lowHp
        const mpPct = c && c.remainingRatio != null ? Math.max(0, Math.min(100, c.remainingRatio * 100)) : 0
        const remainingPct = c && c.remainingRatio != null ? Math.round(c.remainingRatio * 100) : null
        const lowMp = remainingPct != null && remainingPct < 5

        const panelStyle = pos.x == null ? { right: 16, bottom: 16 } : { left: pos.x, top: pos.y }

        // 峰谷倒计时每秒跳动（基于最后一次轮询的基准时刻，本地递减）
        let countdownNode = null
        if (p && p.nextSwitchMinutes != null && hud && hud.ts) {
          const remainingMs = p.nextSwitchMinutes * 60000 - (tick - hud.ts)
          const remainingMin = Math.max(0, remainingMs / 60000)
          countdownNode = React.createElement('span', { className: 'dsh-countdown' },
            fmtDur(remainingMin) + ' 后→' + (p.nextIsPeak ? '高峰' : '低谷') + ' ' + p.nextTime)
        }

        return React.createElement('div', { className: 'dsh-hud' + (minimized ? ' dsh-hud-collapsed' : '') + (hudAlert ? ' dsh-hud-alert' : ''), style: panelStyle },
          React.createElement('style', null, CSS),
          React.createElement('div', {
            className: 'dsh-hud-head',
            onPointerDown: onHandleDown,
            onPointerMove: onHandleMove,
            onPointerUp: onHandleUp,
            onPointerCancel: onHandleUp,
          },
            React.createElement('span', null, '⚡ DSH HUD'),
            React.createElement('div', { className: 'dsh-hud-head-right' },
              currentId ? React.createElement('span', { className: 'dsh-hud-sess' }, String(currentId).slice(0, 20)) : null,
              React.createElement('button', {
                className: 'dsh-hud-min',
                onPointerDown: function (e) { e.stopPropagation() },
                onClick: function (e) { e.stopPropagation(); setMinimized(!minimized) },
              }, minimized ? '▢' : '—'),
            ),
          ),
          minimized ? React.createElement('div', { className: 'dsh-hud-mini' },
            React.createElement('div', { className: 'dsh-hud-row' },
              React.createElement('div', { className: 'dsh-bar-label' },
                React.createElement('span', { className: 'dsh-label-hp' }, '❤'),
                React.createElement('span', null, balanceOk ? ('¥' + balanceTotal.toFixed(1)) : '¥ --'),
              ),
              React.createElement('div', { className: 'dsh-bar' },
                React.createElement('div', { className: 'dsh-bar-fill hp' + (lowHp ? ' low' : ''), style: { width: hpPct + '%' } }),
                React.createElement('div', { className: 'dsh-bar-ticks' }),
              ),
            ),
            React.createElement('div', { className: 'dsh-hud-row' },
              React.createElement('div', { className: 'dsh-bar-label' },
                React.createElement('span', { className: 'dsh-label-mp' }, '✦'),
                React.createElement('span', null, remainingPct != null ? (remainingPct + '%') : '—'),
              ),
              React.createElement('div', { className: 'dsh-bar' },
                React.createElement('div', { className: 'dsh-bar-fill mp' + (lowMp ? ' low' : ''), style: { width: mpPct + '%' } }),
                React.createElement('div', { className: 'dsh-bar-ticks' }),
              ),
            ),
          ) : React.createElement('div', { className: 'dsh-hud-body' },
            React.createElement('div', { className: 'dsh-hud-row' },
              React.createElement('div', { className: 'dsh-bar-label' },
                React.createElement('span', { className: 'dsh-label-hp' }, '❤ 余额'),
                React.createElement('span', null, balanceOk ? ('¥' + balanceTotal.toFixed(2) + ' / ¥' + maxBalance.toFixed(2)) : '¥ --'),
              ),
              React.createElement('div', { className: 'dsh-bar' },
                React.createElement('div', { className: 'dsh-bar-fill hp' + (hpPct < 15 ? ' low' : ''), style: { width: hpPct + '%' } }),
                React.createElement('div', { className: 'dsh-bar-ticks' }),
              ),
              balanceOk ? null : React.createElement('div', { className: 'dsh-hud-note' }, '余额获取失败：' + (b && b.reason ? b.reason : '未知')),
            ),
            React.createElement('div', { className: 'dsh-hud-row' },
              React.createElement('div', { className: 'dsh-bar-label' },
                React.createElement('span', { className: 'dsh-label-mp' }, '✦ 上下文'),
                React.createElement('span', null, remainingPct != null ? ('剩余 ' + remainingPct + '%') : '—'),
              ),
              React.createElement('div', { className: 'dsh-bar' },
                React.createElement('div', { className: 'dsh-bar-fill mp' + (lowMp ? ' low' : ''), style: { width: mpPct + '%' } }),
                React.createElement('div', { className: 'dsh-bar-ticks' }),
              ),
              React.createElement('div', { className: 'dsh-hud-note' },
                c && c.usedTokens != null ? (fmtTokens(c.usedTokens) + ' / ' + fmtTokens(c.contextWindow) + ' tokens') : '等待上下文数据…'),
            ),
            React.createElement('div', { className: 'dsh-hud-row dsh-price-row' },
              React.createElement('div', { className: 'dsh-price-left' },
                React.createElement('span', { className: p && p.isPeak ? 'dsh-badge dsh-badge-peak' : 'dsh-badge dsh-badge-valley' },
                  p ? (p.isPeak ? '▲ 高峰' : '▼ 低谷') : '峰谷 --'),
                p && p.nextSwitchMinutes != null
                  ? countdownNode
                  : null,
              ),
              React.createElement('div', { className: 'dsh-price-right' },
                p && p.price ? ('¥' + p.price.input + ' / ¥' + p.price.output + ' · M tok') : '价格 --'),
            ),
            React.createElement('div', { className: 'dsh-hud-row dsh-comp-row' },
              React.createElement('div', { className: 'dsh-comp-status' },
                '压缩 ×' + roundsN + (comp && comp.compressing ? '（压缩中…）' : '')),
              showNewBtn
                ? React.createElement('div', null,
                    React.createElement('button', { className: 'dsh-new-btn', disabled: busy, onClick: onNewConversation },
                      busy ? '正在迁移记忆…' : '⚡ 开启新对话（携带记忆）'),
                    React.createElement('div', { className: 'dsh-new-hint' }, '不点击则继续自动压缩'),
                  )
                : null,
              error ? React.createElement('div', { className: 'dsh-hud-error' }, error) : null,
            ),
          ),
        )
      }

      slotsSvc.inject('shell.overlay', function () {
        return slotsSvc.register(
          { name: 'shell.overlay', id: 'dsh-game-hud', order: 5 },
          function (slotProps) {
            return React.createElement(Hud, { useSessions: slotProps.useSessions })
          },
        )
      })

    	// Optional settings row for this plugin's `game-hud` namespace, shown
    	// under Settings → General. It follows the shipped `configForms` service and
    	// is registered behind its own inject, so the HUD never depends on it.
    	ctx.inject(['configForms'], function (configCtx) {
    		const forms = configCtx.get('configForms')
    		if (!forms || typeof forms.get !== 'function') return
    		const form = forms.get('game-hud')
    		const rowStyle = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }
    		const labelStyle = { flex: '1 1 auto', minWidth: '160px', fontSize: '13px', color: 'var(--dsw-alias-label-primary)' }
    		const inputStyle = { width: '90px', height: '30px', padding: '0 8px', borderRadius: '8px', font: 'inherit', fontSize: '13px', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-3)', border: '1px solid var(--dsw-alias-border-l2)' }
    		const buttonStyle = { padding: '5px 12px', borderRadius: '8px', font: 'inherit', fontSize: '13px', cursor: 'pointer', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l2)' }
    		const noteStyle = { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }

    		function HudSettingsRow() {
    			const subscribe = React.useMemo(function () { return form.subscribe.bind(form) }, [])
    			const getSnapshot = React.useMemo(function () { return form.getSnapshot.bind(form) }, [])
    			const snap = React.useSyncExternalStore(subscribe, getSnapshot)
    			const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : {}
    			const shown = value.maxBalance != null ? String(value.maxBalance) : '20'
    			const [draft, setDraft] = React.useState(shown)
    			const [saving, setSaving] = React.useState(false)
    			const [note, setNote] = React.useState('')
    			React.useEffect(function () { setDraft(shown) }, [shown])
    			const save = async function () {
    				const n = Number(draft)
    				if (!Number.isFinite(n) || n <= 0) { setNote('请输入大于 0 的数字'); return }
    				setSaving(true)
    				setNote('')
    				try {
    					const ok = await form.set('maxBalance', n)
    					setNote(ok === false ? '保存被拒绝' : '已保存')
    				} catch (e) {
    					setNote(e && e.message ? String(e.message) : '保存失败')
    				} finally {
    					setSaving(false)
    				}
    			}
    			return React.createElement('div', { style: rowStyle },
    				React.createElement('span', { style: labelStyle }, 'Game HUD：血条满格金额（¥）'),
    				React.createElement('input', { type: 'number', min: '0.01', step: '1', style: inputStyle, value: draft, disabled: saving, onChange: function (e) { setDraft(e.target.value) } }),
    				React.createElement('button', { type: 'button', style: buttonStyle, disabled: saving, onClick: save }, saving ? '保存中…' : '保存'),
    				note ? React.createElement('span', { style: noteStyle }, note) : null,
    			)
    		}

    		ctx.effect(function () {
    			return slotsSvc.inject('settings.general.item', function () {
    				return slotsSvc.register({ name: 'settings.general.item', id: 'dsh-game-hud', order: 60 }, HudSettingsRow)
    			})
    		}, 'dsh-game-hud: settings row')
    	})
    }
    exports.apply = apply
    exports.inject = ['slots', 'sessions', 'timer']
    return module.exports
  },
})
