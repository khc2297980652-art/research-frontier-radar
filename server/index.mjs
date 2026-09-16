import express from 'express'
import compression from 'compression'
import { existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { loadConfig, clientConfig } from './lib/config.mjs'
import { runRefresh, readStore, isStale, runtime } from './lib/refresh.mjs'

const ROOT = process.cwd()
const DIST = resolve(ROOT, 'web', 'dist')
const DEV = process.argv.includes('--dev')
const BASE_PORT = Number(process.env.PORT || 8787)

// ---------- 前端未构建则自动构建，保证 `npm start` 一条命令可用 ----------
if (!DEV && !existsSync(join(DIST, 'index.html'))) {
  console.log('[setup] 首次运行，正在构建前端…')
  const vite = resolve(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const r = spawnSync(process.execPath, [vite, 'build'], { stdio: 'inherit', cwd: ROOT })
  if (r.status !== 0) {
    console.error('[setup] 前端构建失败，请先运行 npm install')
    process.exit(1)
  }
}
mkdirSync(resolve(ROOT, 'data'), { recursive: true })

const app = express()
app.use(compression())
app.use(express.json())

// ---------- API ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, refreshing: runtime.refreshing }))

function runtimeInfo() {
  return {
    refreshing: runtime.refreshing,
    progress: runtime.progress,
    lastError: runtime.lastError,
    startedAt: runtime.startedAt,
    finishedAt: runtime.finishedAt,
  }
}

// 轻量端点：轮询用，不含论文正文，避免反复传输大载荷
app.get('/api/state', (_req, res) => {
  try {
    const store = readStore()
    res.json({
      config: clientConfig(),
      runtime: runtimeInfo(),
      meta: store
        ? { generatedAt: store.generatedAt, counts: store.counts, windowDays: store.windowDays }
        : null,
      journalStats: store?.journalStats || {},
    })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

app.get('/api/papers', (_req, res) => {
  let cfg
  try {
    cfg = clientConfig()
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
  res.json({ config: cfg, runtime: runtimeInfo(), store: readStore() })
})

app.post('/api/refresh', (_req, res) => {
  if (runtime.refreshing) return res.json({ started: false, reason: 'already-running' })
  runRefresh().catch((e) => console.error('[refresh] 失败:', e))
  res.json({ started: true })
})

// ---------- 图片代理：只允许 arXiv，避免热链与 CORS 问题 ----------
const imgCache = new Map()
const IMG_CACHE_MAX = 200

app.get('/api/img', async (req, res) => {
  const raw = String(req.query.u || '')
  let target
  try {
    target = new URL(raw)
  } catch {
    return res.status(400).json({ error: 'bad url' })
  }
  const host = target.hostname.toLowerCase()
  if (!(host === 'arxiv.org' || host.endsWith('.arxiv.org'))) {
    return res.status(403).json({ error: 'host not allowed' })
  }
  if (imgCache.has(raw)) {
    const hit = imgCache.get(raw)
    res.set('Content-Type', hit.type)
    res.set('Cache-Control', 'public, max-age=86400')
    return res.send(hit.body)
  }
  try {
    const upstream = await fetch(raw, {
      headers: { 'User-Agent': 'ResearchRadar/1.0', Referer: 'https://arxiv.org/' },
      signal: AbortSignal.timeout(25000),
    })
    if (!upstream.ok) return res.status(502).end()
    const type = upstream.headers.get('content-type') || 'image/png'
    if (!type.startsWith('image/')) return res.status(415).end()
    const body = Buffer.from(await upstream.arrayBuffer())
    if (imgCache.size >= IMG_CACHE_MAX) imgCache.delete(imgCache.keys().next().value)
    imgCache.set(raw, { type, body })
    res.set('Content-Type', type)
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(body)
  } catch {
    res.status(502).end()
  }
})

// ---------- 静态前端 ----------
if (existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(join(DIST, 'index.html'))
  })
}

// ---------- 启动 + 定时刷新 ----------
function listen(port, attempt = 0) {
  const server = app.listen(port, () => {
    console.log(`\n  科研前沿雷达已启动  →  http://localhost:${port}\n`)
    const store = readStore()
    const cfg = loadConfig()
    if (!store) {
      console.log('[refresh] 尚无数据，开始首次抓取…')
      runRefresh().catch((e) => console.error('[refresh] 失败:', e))
    } else if (isStale(store, cfg)) {
      console.log('[refresh] 缓存已过期，后台更新中…')
      runRefresh().catch((e) => console.error('[refresh] 失败:', e))
    } else {
      console.log(`[refresh] 缓存有效（${store.counts?.total || 0} 篇），下次到期自动更新`)
    }
    const hours = Math.max(1, Number(cfg.refreshIntervalHours) || 6)
    setInterval(
      () => {
        if (!runtime.refreshing) runRefresh().catch((e) => console.error('[refresh] 失败:', e))
      },
      hours * 3600 * 1000
    ).unref?.()
  })
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && attempt < 20) {
      console.warn(`[port] ${port} 被占用，换用 ${port + 1}`)
      listen(port + 1, attempt + 1)
    } else {
      throw e
    }
  })
}

listen(BASE_PORT)
