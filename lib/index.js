/**
 * dsh-cost-badge host half — aggregates account balance and token usage, and
 * serves the same-origin '/api/cost/state' JSON endpoint the browser badge
 * polls.
 *
 * Balance: resolves the DeepSeek API key through the credentials service and
 * calls the official /user/balance endpoint, cached for `pollMinutes`. Today's
 * spend is derived from the balance delta since local midnight (truthful real
 * money spent, independent of provider pricing tables; a top-up resets the
 * baseline so it never reports negative).
 *
 * Usage: sums the official `tokenUsage` session projection (registered by
 * dsh-token-meter) across every live session for exact input/output/cache
 * totals. When token-meter is absent the totals stay zero rather than fail.
 *
 * The plugin is fail-soft: every external call is guarded so a balance API
 * outage or a missing projection never breaks boot — the badge simply shows
 * the last known values or '--'.
 * @module dsh-cost
 */

import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Resolve the Harness home directory (DSH_HOME or ~/.dsh). */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** Persisted projection cache: per-session tokenUsage totals (lifetime). */
const PROJCACHE_FILE = () => join(dshHome(), 'storages', 'session_projcache.json')

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'cost-badge'

/** Services required before the badge can mount its route and read data. */
export const inject = ['webServer', 'credentials', 'sessionProjections', 'sessions']

/** Settings namespace the badge edits (apiKeyRef, pollMinutes, enabled). */
const NS = settingsNamespace('cost-badge')

/** Persisted state file under the Harness home. */
const STATE_FILE = join(homedir(), '.dsh', 'cost-badge.json')

/** DeepSeek official balance endpoint. */
const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Runtime schema for the settings section. */
const Config = z.object({
  enabled: z.boolean().default(true),
  apiKeyRef: z.string().default('DEEPSEEK_API_KEY'),
  pollMinutes: z.number().step(1).min(1).default(5),
})

/** Local date key (YYYY-MM-DD) in the machine timezone. */
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fresh empty state. */
function emptyState() {
  return {
    balance: null,
    balanceCurrency: 'CNY',
    balanceAt: null,
    balanceError: null,
    dayDate: todayKey(),
    dayStartBalance: null,
  }
}

/** Load persisted state, merged over an empty baseline. */
async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8')
    return { ...emptyState(), ...JSON.parse(raw) }
  } catch {
    return emptyState()
  }
}

/** Persist state (best-effort; never throws). */
async function saveState(state) {
  try {
    await mkdir(join(homedir(), '.dsh'), { recursive: true })
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
  } catch {
    /* ignore — persistence is best-effort */
  }
}

/**
 * Fetch the DeepSeek account balance. Returns { balance, currency }.
 * @param {string} apiKey - the DeepSeek API key.
 */
async function fetchDeepSeekBalance(apiKey) {
  const res = await fetch(DEEPSEEK_BALANCE_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`balance HTTP ${res.status}`)
  const body = await res.json()
  if (!body || body.is_available === false) throw new Error('balance unavailable (is_available=false)')
  const info = Array.isArray(body.balance_infos) ? body.balance_infos[0] : undefined
  if (!info) throw new Error('balance_infos empty')
  return { balance: Number(info.total_balance), currency: info.currency || 'CNY' }
}

/** Register the cost-badge service, route, and poll loop. */
export const apply = function apply(ctx, config = {}) {
  let current = () => config
  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => { current = source },
    onChange: syncEnabled,
  })

  /** Live totals aggregated from the tokenUsage projection. */
  let totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, sessions: 0 }

  /**
   * Recompute totals: lifetime baseline from the persisted projection cache,
   * overridden by the freshest live values for currently-open sessions.
   * @returns {Promise<void>}
   */
  async function recomputeTotals() {
    let i = 0, o = 0, cr = 0, cw = 0, count = 0
    /** sid → cached totals (for subtract-and-replace on live sessions). */
    const cacheMap = new Map()

    // 1. Lifetime baseline from the persisted projection cache.
    try {
      if (existsSync(PROJCACHE_FILE())) {
        const text = await readFile(PROJCACHE_FILE(), 'utf8')
        const cache = JSON.parse(text)
        const sessions = cache?.tables?.sessions ?? {}
        for (const sid of Object.keys(sessions)) {
          const tu = sessions[sid]?.rows?.tokenUsage?.val?.totals
          if (!tu) continue
          i += tu.uncachedInputTokens || 0
          o += tu.outputTokens || 0
          cr += tu.cacheReadTokens || 0
          cw += tu.cacheWriteTokens || 0
          count += 1
          cacheMap.set(sid, tu)
        }
      }
    } catch { /* malformed or missing cache — fall back to live-only */ }

    // 2. Override with freshest live values for open sessions (the cache lags
    //    behind in-flight turns): subtract the cached subtotal, re-add live.
    try {
      for (const session of ctx.sessions.list()) {
        const sid = session.id
        const cached = cacheMap.get(sid)
        if (cached) {
          i -= cached.uncachedInputTokens || 0
          o -= cached.outputTokens || 0
          cr -= cached.cacheReadTokens || 0
          cw -= cached.cacheWriteTokens || 0
          count -= 1
        }
        let snap
        try { snap = ctx.sessionProjections.snapshot(session) } catch { continue }
        const u = snap?.values?.tokenUsage?.totals
        if (u) {
          i += u.uncachedInputTokens || 0
          o += u.outputTokens || 0
          cr += u.cacheReadTokens || 0
          cw += u.cacheWriteTokens || 0
          count += 1
        }
      }
    } catch { /* sessions or projections seam absent */ }

    totals = { inputTokens: i, outputTokens: o, cacheReadTokens: cr, cacheWriteTokens: cw, sessions: count }
  }

  // Debounced recompute on projection changes.
  let recomputeTimer = null
  const scheduleRecompute = () => {
    if (recomputeTimer !== null) return
    recomputeTimer = setTimeout(() => { recomputeTimer = null; void recomputeTotals() }, 500)
  }
  try { ctx.sessionProjections.onChanged(scheduleRecompute) } catch { /* projections seam absent */ }
  void recomputeTotals()

  // Persisted balance state.
  let state = emptyState()
  loadState().then((loaded) => {
    state = loaded
    if (state.dayDate !== todayKey()) {
      state.dayDate = todayKey()
      state.dayStartBalance = null
    }
  })

  // Balance refresh loop.
  let balanceTimer = null
  let refreshing = false
  async function refreshBalance() {
    if (refreshing) return
    const cfg = current()
    if ((cfg.enabled ?? true) === false) return
    refreshing = true
    try {
      const ref = cfg.apiKeyRef ?? 'DEEPSEEK_API_KEY'
      const credentials = ctx.get('credentials')
      const hit = credentials ? await credentials.resolve(ref) : undefined
      const apiKey = hit?.value
      if (!apiKey || apiKey.length === 0) {
        state.balanceError = 'no-api-key'
        await saveState(state)
        return
      }
      const { balance, currency } = await fetchDeepSeekBalance(apiKey)
      state.balance = balance
      state.balanceCurrency = currency
      state.balanceAt = Date.now()
      state.balanceError = null
      // Roll the day baseline forward at local midnight.
      if (state.dayStartBalance === null || state.dayDate !== todayKey()) {
        state.dayDate = todayKey()
        state.dayStartBalance = balance
      }
      // A top-up increases the balance above the baseline; reset the baseline
      // so today's spend never goes negative.
      if (balance > (state.dayStartBalance ?? balance)) {
        state.dayStartBalance = balance
      }
      await saveState(state)
    } catch (err) {
      state.balanceError = String(err?.message || err)
      await saveState(state)
    } finally {
      refreshing = false
    }
  }

  function syncEnabled() {
    const enabled = (current().enabled ?? true)
    if (enabled && balanceTimer === null) {
      void refreshBalance()
      const minutes = Math.max(1, current().pollMinutes ?? 5)
      balanceTimer = setInterval(() => { void refreshBalance() }, minutes * 60_000)
    } else if (!enabled && balanceTimer !== null) {
      clearInterval(balanceTimer)
      balanceTimer = null
    }
  }
  syncEnabled()

  // HTTP route: /api/cost/state.
  const handler = async (req, res) => {
    try {
      const url = req.url || ''
      if (!url.startsWith('/api/cost/state')) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'not-found' }))
        return
      }
      await recomputeTotals()
      const todaySpend = (state.dayStartBalance !== null && state.balance !== null)
        ? Math.max(0, state.dayStartBalance - state.balance)
        : null
      const body = {
        ok: true,
        balance: state.balance,
        balanceCurrency: state.balanceCurrency,
        balanceAt: state.balanceAt,
        balanceError: state.balanceError,
        todaySpend,
        dayDate: state.dayDate,
        totals,
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    }
  }

  ctx.effect(
    () => {
      const dispose = ctx.webServer.register({ kind: 'exact', path: '/api/cost/state', handler })
      return () => {
        try { dispose() } catch { /* ignore */ }
        if (balanceTimer !== null) { clearInterval(balanceTimer); balanceTimer = null }
      }
    },
    'cost-badge: route + poll',
  )
}
