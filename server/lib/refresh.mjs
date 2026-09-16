import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { loadConfig } from './config.mjs'
import { fetchJournalWorksAll, mapWork, defaultSince } from './openalex.mjs'
import { fetchArxivQuery } from './arxiv.mjs'
import { fetchCrossrefJournal } from './crossref.mjs'
import { fetchAbstractsByDoi } from './semanticscholar.mjs'
import { attachFigures } from './figures.mjs'
import { mapPool, sleep } from './http.mjs'
import { normTitle, normalizeDoi, tidy } from './util.mjs'

const STORE = 'data/papers.json'
const MAX_PAPERS = 5000

export const runtime = {
  refreshing: false,
  startedAt: null,
  finishedAt: null,
  progress: '',
  lastError: null,
}

export function readStore() {
  if (!existsSync(STORE)) return null
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return null
  }
}

export function isStale(store, cfg) {
  if (!store?.generatedAt) return true
  const ageHours = (Date.now() - new Date(store.generatedAt).getTime()) / 3600000
  return ageHours >= (cfg.refreshIntervalHours ?? 6)
}

const keyOf = (p) => (p.doi ? 'doi:' + normalizeDoi(p.doi) : 'tk:' + normTitle(p.title))

/** 合并同一篇论文的多来源记录：已有的字段不被覆盖，缺失的字段被补齐 */
function mergeInto(base, extra) {
  base.disciplines = [...new Set([...(base.disciplines || []), ...(extra.disciplines || [])])]
  if (!base.abstract && extra.abstract) {
    base.abstract = extra.abstract
    base.abstractSource = extra.abstractSource || 'merged'
  }
  if (!base.arxivId && extra.arxivId) {
    base.arxivId = extra.arxivId
    base.arxivUrl = extra.arxivUrl
    base.figures = extra.figures || []
  }
  if (extra.figures?.length && !base.figures?.length) base.figures = extra.figures
  if (extra.journalRef && !base.journalRef) base.journalRef = extra.journalRef
  if (!base.citedBy && extra.citedBy) base.citedBy = extra.citedBy
  if (!base.topic && extra.topic) base.topic = extra.topic
  if (!base.pdfUrl && extra.pdfUrl) base.pdfUrl = extra.pdfUrl
  if ((!base.oaStatus || base.oaStatus === 'closed') && extra.oaStatus && extra.oaStatus !== 'closed') {
    base.oaStatus = extra.oaStatus
    base.isOA = extra.isOA
  }
  return base
}

/**
 * 按期刊合并两条发现通道的结果。
 * OpenAlex 提供摘要、被引与开放获取信息；Crossref 提供 OpenAlex 还没收录的最新 DOI。
 */
function mergeJournalChannels(openalexList, crossrefList) {
  const byDoi = new Map()
  for (const p of openalexList) byDoi.set(normalizeDoi(p.doi), p)
  let added = 0
  let filled = 0
  for (const c of crossrefList) {
    const doi = normalizeDoi(c.doi)
    const existing = byDoi.get(doi)
    if (existing) {
      if (!existing.abstract && c.abstract) {
        existing.abstract = c.abstract
        existing.abstractSource = 'crossref'
        filled++
      }
    } else {
      byDoi.set(doi, c)
      added++
    }
  }
  return { list: [...byDoi.values()], added, filled }
}

/** 把期刊论文与同名的 arXiv 预印本对上，用来补摘要与配图 */
function linkPreprints(journalPapers, arxivPapers) {
  const byTitle = new Map()
  for (const a of arxivPapers) {
    const k = normTitle(a.title)
    if (k.length > 20 && !byTitle.has(k)) byTitle.set(k, a)
  }
  let linked = 0
  for (const p of journalPapers) {
    const a = byTitle.get(normTitle(p.title))
    if (!a) continue
    if (!p.abstract && a.abstract) {
      p.abstract = a.abstract
      p.abstractSource = 'arxiv'
    }
    if (!p.arxivId) {
      p.arxivId = a.arxivId
      p.arxivUrl = a.arxivUrl || a.url
    }
    linked++
  }
  return linked
}

export async function runRefresh({ onLog = () => {} } = {}) {
  if (runtime.refreshing) return { skipped: true }
  runtime.refreshing = true
  runtime.startedAt = new Date().toISOString()
  runtime.lastError = null
  const errors = []
  const log = (msg) => {
    runtime.progress = msg
    onLog(msg)
    console.log('[refresh]', msg)
  }

  try {
    const cfg = loadConfig()
    const since = defaultSince(cfg.windowDays)
    log(`开始抓取：窗口自 ${since} 起，${cfg.disciplines.length} 个学科`)

    // ---------- 1. 期刊论文：OpenAlex + Crossref 双通道 ----------
    const tasks = cfg.disciplines.flatMap((d) => d.journals.map((j) => ({ d, j })))
    let done = 0
    const journalResults = await mapPool(tasks, 4, async ({ d, j }) => {
      const out = { papers: [], added: 0, filled: 0, latest: null }
      try {
        const works = await fetchJournalWorksAll(j.issn, since)
        out.papers = works.map((w) => ({ ...mapWork(w, j), disciplines: [d.id] }))
        out.latest = works[0]?.publication_date || null
      } catch (e) {
        errors.push({ stage: 'openalex', journal: j.short, issn: j.issn, error: String(e?.message || e) })
      }
      try {
        const cr = await fetchCrossrefJournal(j.issn, since)
        const merged = mergeJournalChannels(out.papers, cr)
        out.papers = merged.list
        out.added = merged.added
        out.filled = merged.filled
      } catch (e) {
        errors.push({ stage: 'crossref', journal: j.short, issn: j.issn, error: String(e?.message || e) })
      }
      done++
      runtime.progress = `期刊 ${done}/${tasks.length} · ${j.short}（${out.papers.length} 篇，+${out.added}）`
      return out
    })

    const journalPapers = journalResults.filter((r) => Array.isArray(r.papers)).flatMap((r) => r.papers)
    const crossrefAdded = journalResults.reduce((s, r) => s + (r.added || 0), 0)
    const crossrefFilled = journalResults.reduce((s, r) => s + (r.filled || 0), 0)
    log(`期刊完成：${journalPapers.length} 篇（Crossref 新增 ${crossrefAdded}，补摘要 ${crossrefFilled}）`)

    // 每本期刊的“已收录到哪天”，用来向用户说明索引延迟
    const journalStats = {}
    cfg.disciplines.forEach((d, i) => {
      d.journals.forEach((j, k) => {
        const r = journalResults[i * d.journals.length + k]
        journalStats[j.issn] = {
          short: j.short,
          count: r?.papers?.length || 0,
          latest: r?.latest || null,
        }
      })
    })

    // ---------- 2. 预印本（arXiv） ----------
    const arxivLists = []
    for (const d of cfg.disciplines) {
      const q = d.arxivQuery || d.arxivCategories.map((c) => `cat:${c}`).join(' OR ')
      if (!q) continue
      try {
        runtime.progress = `预印本 · ${d.name}`
        const list = await fetchArxivQuery(q, { maxResults: 200 })
        arxivLists.push(list.map((p) => ({ ...p, disciplines: [d.id], arxivUrl: p.url, figures: [] })))
        log(`arXiv ${d.name}：${list.length} 篇`)
      } catch (e) {
        errors.push({ stage: 'arxiv', discipline: d.id, error: String(e?.message || e) })
      }
      await sleep(3500)
    }
    const arxivPapers = arxivLists.flat()

    // ---------- 3. 预印本反向补期刊论文 ----------
    const linked = linkPreprints(journalPapers, arxivPapers)
    if (linked) log(`按标题匹配到 ${linked} 篇期刊论文的预印本版本`)

    // ---------- 4. 合并去重 ----------
    const map = new Map()
    for (const p of [...journalPapers, ...arxivPapers]) {
      const k = keyOf(p)
      const cur = map.get(k)
      if (!cur) {
        map.set(k, p)
      } else if (p.kind === 'journal' && cur.kind !== 'journal') {
        // 期刊记录作为底稿，保留预印本带来的配图与摘要
        mergeInto(p, cur)
        map.set(k, p)
      } else {
        mergeInto(cur, p)
      }
    }
    let papers = [...map.values()]
    log(`合并去重后 ${papers.length} 篇`)

    // ---------- 5. 摘要兜底（Semantic Scholar 批量） ----------
    const missingDois = papers.filter((p) => !p.abstract && p.doi).map((p) => normalizeDoi(p.doi))
    if (missingDois.length) {
      runtime.progress = `摘要兜底 · ${missingDois.length} 篇`
      const s2 = await fetchAbstractsByDoi(missingDois)
      let n = 0
      for (const p of papers) {
        if (p.abstract) continue
        const a = s2.get(normalizeDoi(p.doi))
        if (a) {
          p.abstract = tidy(a)
          p.abstractSource = 'semanticscholar'
          n++
        }
      }
      log(`Semantic Scholar 补摘要：+${n} 篇`)
    }

    // ---------- 6. 配图（仅开放获取预印本） ----------
    const figCandidates = papers.filter((p) => p.arxivId)
    runtime.progress = `提取配图 · 候选 ${figCandidates.length} 篇`
    const figStat = await attachFigures(figCandidates, {
      // 缓存是跨次累积的，但首次运行（CI 上缓存为空）只抓 45 篇会让线上配图
      // 远少于实际可得数量。一次抓够当前窗口的全部候选，首轮即可收敛。
      limit: 250,
      onProgress: (d, t) => {
        runtime.progress = `提取配图 ${d}/${t}`
      },
    })
    log(`配图：新增 ${figStat.fetched} 篇，缓存累计 ${figStat.cached} 篇`)

    // ---------- 7. 收尾 ----------
    papers = papers
      // Crossref 按“最近收录”取数，会带回一批更早发表的论文，这里统一按窗口收敛
      .filter((p) => p.date && p.date >= since)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.citedBy || 0) - (a.citedBy || 0)))
      .slice(0, MAX_PAPERS)

    const countBy = (fn) => papers.filter(fn).length
    const store = {
      generatedAt: new Date().toISOString(),
      windowDays: cfg.windowDays,
      counts: {
        total: papers.length,
        byDiscipline: Object.fromEntries(
          cfg.disciplines.map((d) => [d.id, countBy((p) => p.disciplines?.includes(d.id))])
        ),
        journals: countBy((p) => p.kind === 'journal'),
        preprints: countBy((p) => p.kind === 'preprint'),
        withAbstract: countBy((p) => p.abstract),
        withFigures: countBy((p) => p.figures?.length),
      },
      journalStats,
      errors,
      papers,
    }

    mkdirSync('data', { recursive: true })
    writeFileSync(STORE, JSON.stringify(store), 'utf8')
    runtime.finishedAt = new Date().toISOString()
    runtime.progress = `完成 · ${papers.length} 篇`
    log(
      `完成：${papers.length} 篇（期刊 ${store.counts.journals} / 预印本 ${store.counts.preprints}；` +
        `含摘要 ${store.counts.withAbstract}，含配图 ${store.counts.withFigures}）`
    )
    return store
  } catch (e) {
    runtime.lastError = String(e?.message || e)
    errors.push({ stage: 'refresh', error: runtime.lastError })
    throw e
  } finally {
    runtime.refreshing = false
  }
}
