import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fetchWithRetry, sleep, mapPool } from './http.mjs'
import { stripVersion } from './util.mjs'

const CACHE_PATH = 'data/figures.json'
const MAX_FIGURES = 6

let cache = null

export function loadFigureCache() {
  if (cache) return cache
  try {
    cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {}
  } catch {
    cache = {}
  }
  return cache
}

export function saveFigureCache() {
  if (!cache) return
  mkdirSync('data', { recursive: true })
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 0), 'utf8')
}

/**
 * 从 arXiv 的 HTML 版（LaTeXML 渲染）里提取正文配图。
 * 只有开放获取的预印本才有合法可展示的图片，这也是本应用图片的主要来源。
 */
export async function extractFigures(arxivId) {
  const url = `https://arxiv.org/html/${arxivId}`
  let html
  try {
    html = await fetchWithRetry(url, {
      as: 'text',
      retries: 1,
      timeout: 25000,
      headers: { Accept: 'text/html,application/xhtml+xml' },
    })
  } catch {
    return [] // 老论文没有 HTML 版，正常
  }

  const found = []
  const seen = new Set()
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const raw =
      attr(tag, 'src') || attr(tag, 'data-src') || firstSrcset(attr(tag, 'srcset') || attr(tag, 'data-srcset'))
    if (!raw || raw.startsWith('data:')) continue
    let abs
    try {
      abs = new URL(raw.replace(/&amp;/g, '&'), url).href
    } catch {
      continue
    }
    if (!/^https:\/\/arxiv\.org\//i.test(abs)) continue
    if (!/\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(abs)) continue
    if (/\/static\/|logo|icon|favicon|badge|arxiv-logo/i.test(abs)) continue
    if (seen.has(abs)) continue
    seen.add(abs)
    found.push(abs)
    if (found.length >= MAX_FIGURES) break
  }
  return found
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return m ? m[1].trim() : ''
}

function firstSrcset(v) {
  const first = String(v).split(',')[0]?.trim()
  return first ? first.split(/\s+/)[0] : ''
}

/**
 * 为一批预印本补齐配图，结果落盘缓存，同一篇论文只抓一次。
 * limit 控制单轮新增抓取量，避免对 arXiv 造成压力。
 */
export async function attachFigures(papers, { limit = 40, onProgress } = {}) {
  const store = loadFigureCache()
  const need = papers.filter((p) => p.arxivId && !(p.arxivId in store)).slice(0, limit)

  let done = 0
  if (need.length) {
    await mapPool(need, 3, async (p) => {
      const figs = await extractFigures(stripVersion(p.arxivId))
      store[p.arxivId] = figs
      done++
      onProgress?.(done, need.length)
      await sleep(250)
    })
    saveFigureCache()
  }

  for (const p of papers) {
    if (p.arxivId && p.arxivId in store) p.figures = store[p.arxivId]
  }
  return { fetched: need.length, cached: Object.keys(store).length }
}
