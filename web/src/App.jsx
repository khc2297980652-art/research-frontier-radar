import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import PaperCard from './components/PaperCard.jsx'
import Lightbox from './components/Lightbox.jsx'
import {
  IconRadar,
  IconRefresh,
  IconMoon,
  IconSun,
  IconSearch,
  IconFilter,
  IconGrid,
  IconList,
} from './icons.jsx'
import { isStatic, loadState as apiLoadState, loadPapers as apiLoadPapers, requestRefresh } from './api.js'

const dayMs = 86400000

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('rr-theme', dark ? 'dark' : 'light')
    } catch {
      /* 隐私模式下忽略 */
    }
  }, [dark])
  return [dark, setDark]
}

export default function App() {
  const [state, setState] = useState(null) // 轻量状态：配置、进度、计数
  const [store, setStore] = useState(null) // 论文正文，仅在数据更新时拉取
  const [loadError, setLoadError] = useState(null)
  const [dark, setDark] = useTheme()

  const [discipline, setDiscipline] = useState('all')
  const [rangeDays, setRangeDays] = useState(30)
  const [source, setSource] = useState('all')
  const [sort, setSort] = useState('date')
  const [view, setView] = useState('list')
  const [abstractOpen, setAbstractOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [thresholds, setThresholds] = useState(null)
  const [journalOff, setJournalOff] = useState(() => new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const loadedGen = useRef(null)

  const loadState = useCallback(async () => {
    try {
      const json = await apiLoadState()
      setState(json)
      setLoadError(null)
      setThresholds((prev) => {
        if (prev) return prev
        const init = {}
        for (const d of json.config.disciplines) init[d.id] = d.defaultThreshold
        return init
      })
    } catch (e) {
      setLoadError(String(e?.message || e))
    }
  }, [])

  const loadPapers = useCallback(async () => {
    try {
      const data = await apiLoadPapers()
      setStore(data)
      loadedGen.current = data?.generatedAt || null
      setLoadError(null)
    } catch (e) {
      setLoadError(String(e?.message || e))
    }
  }, [])

  useEffect(() => {
    loadState()
  }, [loadState])

  // 数据版本变了才重新拉正文，避免轮询反复传输大载荷
  useEffect(() => {
    const gen = state?.meta?.generatedAt
    if (!gen) return
    if (gen !== loadedGen.current) loadPapers()
  }, [state, loadPapers])

  // 抓取中高频轮询，空闲时低频；静态部署没有后端，不需要轮询
  useEffect(() => {
    if (!state || isStatic) return
    const busy = state.runtime?.refreshing || !state.meta
    const t = setInterval(loadState, busy ? 4000 : 300000)
    return () => clearInterval(t)
  }, [state, loadState])

  const config = state?.config
  const runtime = state?.runtime || {}
  const counts = state?.meta?.counts
  const journalStats = state?.journalStats || {}

  const disciplineNames = useMemo(() => {
    const m = {}
    for (const d of config?.disciplines || []) m[d.id] = d.name
    return m
  }, [config])

  const enabledIssns = useMemo(() => {
    const s = new Set()
    if (!config || !thresholds) return s
    for (const d of config.disciplines) {
      for (const j of d.journals) {
        if ((j.citedness ?? 0) >= (thresholds[d.id] ?? 0) && !journalOff.has(j.issn)) s.add(j.issn)
      }
    }
    return s
  }, [config, thresholds, journalOff])

  const papers = useMemo(() => {
    const all = store?.papers || []
    const cutoff = new Date(Date.now() - rangeDays * dayMs).toISOString().slice(0, 10)
    const q = query.trim().toLowerCase()
    const out = all.filter((p) => {
      if (p.date < cutoff) return false
      if (discipline !== 'all' && !(p.disciplines || []).includes(discipline)) return false
      if (source !== 'all' && p.kind !== source) return false
      if (p.kind === 'journal' && !enabledIssns.has(p.issn)) return false
      if (q) {
        const hay = `${p.title} ${p.abstract || ''} ${(p.authors || []).join(' ')} ${p.venueShort || ''} ${p.venue || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    out.sort((a, b) =>
      sort === 'cited' ? (b.citedBy || 0) - (a.citedBy || 0) : a.date < b.date ? 1 : a.date > b.date ? -1 : 0
    )
    return out
  }, [store, rangeDays, discipline, source, enabledIssns, query, sort])

  const galleryMode = view === 'gallery'
  // 图片优先视图只保留确实有配图的论文，否则会混进一堆空白卡片
  const display = galleryMode
    ? papers.filter((p) => p.figures?.length).sort((a, b) => (b.figures?.length || 0) - (a.figures?.length || 0))
    : papers

  const setThreshold = useCallback((id, v) => setThresholds((prev) => ({ ...prev, [id]: v })), [])
  const toggleJournal = useCallback((issn) => {
    setJournalOff((prev) => {
      const next = new Set(prev)
      if (next.has(issn)) next.delete(issn)
      else next.add(issn)
      return next
    })
  }, [])

  const openFigure = useCallback((paper, index) => setLightbox({ paper, index }), [])
  const closeLightbox = useCallback(() => setLightbox(null), [])

  async function triggerRefresh() {
    try {
      const r = await requestRefresh()
      if (r && r.started === false) return
      loadState()
    } catch (e) {
      setLoadError(String(e?.message || e))
    }
  }

  const busy = runtime.refreshing
  const updated = state?.meta?.generatedAt
    ? new Date(state.meta.generatedAt).toLocaleString('zh-CN', { hour12: false })
    : '—'

  return (
    <>
      <header className="nav">
        <div className="brand">
          <span className="brand-mark">
            <IconRadar />
          </span>
          <span className="brand-name">科研前沿雷达</span>
          <span className="brand-sub">顶刊与预印本 · 人工智能 / 遥感</span>
        </div>
        <span className="nav-spacer" />
        <button
          type="button"
          className="icon-btn mobile-only"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-label="筛选条件"
        >
          <IconFilter />
          筛选
        </button>
        {isStatic ? (
          state?.repoUrl ? (
            <a
              className="icon-btn"
              href={`${state.repoUrl}/actions/workflows/deploy.yml`}
              target="_blank"
              rel="noopener noreferrer"
              title="静态部署的数据由定时任务更新，点此在 GitHub 上手动触发一次"
            >
              <IconRefresh />
              <span className="hide-sm">手动更新</span>
            </a>
          ) : null
        ) : (
          <button
            type="button"
            className="icon-btn"
            onClick={triggerRefresh}
            disabled={busy || !state}
            title={busy ? '正在抓取…' : '立即抓取最新文献'}
          >
            <IconRefresh className={busy ? 'spin' : ''} />
            <span className="hide-sm">{busy ? '抓取中' : '刷新'}</span>
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={() => setDark((v) => !v)}
          aria-label={dark ? '切换到浅色主题' : '切换到深色主题'}
          title={dark ? '切换到浅色主题' : '切换到深色主题'}
        >
          {dark ? <IconSun /> : <IconMoon />}
        </button>
      </header>

      <div className="shell">
        {config && thresholds && (
          <Sidebar
            config={config}
            journalStats={journalStats}
            activeDiscipline={discipline}
            rangeDays={rangeDays}
            setRangeDays={setRangeDays}
            source={source}
            setSource={setSource}
            sort={sort}
            setSort={setSort}
            view={view}
            setView={setView}
            abstractOpen={abstractOpen}
            setAbstractOpen={setAbstractOpen}
            thresholds={thresholds}
            setThreshold={setThreshold}
            journalOff={journalOff}
            toggleJournal={toggleJournal}
            open={filtersOpen}
          />
        )}

        <main>
          {loadError && (
            <div className="error-box" role="alert">
              无法加载数据：{loadError}
              <div style={{ marginTop: 8 }}>
                <button type="button" className="link-btn" onClick={loadState}>
                  重试
                </button>
              </div>
            </div>
          )}

          {runtime.lastError && !busy && (
            <div className="error-box" role="alert">
              上一轮抓取出错：{runtime.lastError}
            </div>
          )}

          {config && (
            <div className="tabs" role="tablist" aria-label="学科">
              <button role="tab" aria-selected={discipline === 'all'} onClick={() => setDiscipline('all')}>
                全部
                <span className="tab-count">{counts?.total ?? 0}</span>
              </button>
              {config.disciplines.map((d) => (
                <button
                  key={d.id}
                  role="tab"
                  aria-selected={discipline === d.id}
                  onClick={() => setDiscipline(d.id)}
                  title={d.blurb}
                >
                  {d.name}
                  <span className="tab-count">{counts?.byDiscipline?.[d.id] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          <div className="result-bar">
            <label className="search-wrap">
              <span className="search-icon">
                <IconSearch />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标题、摘要、作者、期刊"
                className="with-icon"
                aria-label="搜索文献"
              />
            </label>
            <span className="grow" />
            <span>
              显示 <span className="strong">{display.length}</span> 篇
              {counts ? ` · 库内 ${counts.total} 篇` : ''}
            </span>
            <span>
              {busy ? (
                <>
                  <span className="dot-live" />
                  {runtime.progress || '正在抓取最新文献…'}
                </>
              ) : (
                <>更新于 {updated}</>
              )}
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={() => setView(galleryMode ? 'list' : 'gallery')}
              aria-label={galleryMode ? '切换到列表视图' : '切换到图片优先视图'}
            >
              {galleryMode ? <IconList /> : <IconGrid />}
              {galleryMode ? '列表' : '图片优先'}
            </button>
          </div>

          {!state?.meta && !loadError && (
            <div className="state">
              <div className="dots">
                <span />
                <span />
                <span />
              </div>
              <h3>正在加载文献数据</h3>
              <p>
                {isStatic
                  ? '正在读取随站点发布的文献数据，通常几秒内完成。'
                  : runtime.progress || '首次运行需要抓取 30 余本期刊与预印本，通常 2–4 分钟，请稍候。'}
              </p>
            </div>
          )}

          {store && display.length === 0 && (
            <div className="state">
              <h3>{galleryMode ? '当前条件下没有带配图的论文' : '当前条件下没有文献'}</h3>
              <p>
                {galleryMode
                  ? '配图只来自开放获取预印本，扩大时间范围或切回「全部来源」通常能找到更多。'
                  : '试试放宽时间范围、调低期刊门槛，或切回「全部」学科。'}
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setRangeDays(90)
                    setQuery('')
                    setSource('all')
                  }}
                >
                  放宽筛选
                </button>
                {galleryMode && (
                  <button type="button" className="link-btn" onClick={() => setView('list')}>
                    返回列表视图
                  </button>
                )}
              </div>
            </div>
          )}

          {store && display.length > 0 && (
            <div className={galleryMode ? 'gallery' : 'list'}>
              {display.map((p, i) => (
                <PaperCard
                  key={p.id}
                  paper={p}
                  index={i}
                  gallery={galleryMode}
                  expandedDefault={abstractOpen}
                  onOpenFigure={openFigure}
                  disciplineNames={disciplineNames}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {config && (
        <footer className="footer">
          <p>
            数据来源：
            <a href="https://openalex.org" target="_blank" rel="noopener noreferrer">
              OpenAlex
            </a>
            （期刊元数据、摘要、开放获取链接与期刊被引指标）、
            <a href="https://www.crossref.org" target="_blank" rel="noopener noreferrer">
              Crossref
            </a>
            （补充发现与摘要）、
            <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer">
              arXiv
            </a>
            （预印本与开放配图）、
            <a href="https://www.semanticscholar.org" target="_blank" rel="noopener noreferrer">
              Semantic Scholar
            </a>
            （摘要兜底）。「篇均被引」为 OpenAlex 近两年篇均被引次数，是影响因子的免费替代口径，与 JCR 官方数值略有出入。
            {isStatic && ' 本站为静态部署，数据由定时任务每 6 小时自动重建一次，页面上显示的是本次发布的抓取时间。'}
          </p>
          <p>
            图片说明：仅展示开放获取预印本的正文配图；订阅制期刊的正文插图受版权保护，本应用不抓取、不转载，请通过 DOI 用你的机构权限查看全文。
            期刊门槛与学科清单可在项目根目录的 <code>journals.json</code> 中调整，新增学科后前端会自动出现对应标签页。
          </p>
        </footer>
      )}

      {lightbox && (
        <Lightbox
          paper={lightbox.paper}
          index={lightbox.index}
          onClose={closeLightbox}
          onNavigate={(i) => setLightbox((s) => ({ ...s, index: i }))}
        />
      )}
    </>
  )
}
