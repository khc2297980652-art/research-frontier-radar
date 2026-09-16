import { XMLParser } from 'fast-xml-parser'
import { fetchWithRetry } from './http.mjs'
import { tidy, arxivIdFromUrl } from './util.mjs'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['entry', 'author', 'category', 'link'].includes(name),
  trimValues: true,
})

/**
 * 拉取指定 arXiv 分类下最新的预印本。
 * arXiv 官方要求：单次请求、不要高频轮询。
 */
export async function fetchArxiv(categories, { maxResults = 200 } = {}) {
  return fetchArxivQuery(categories.map((c) => `cat:${c}`).join(' OR '), { maxResults })
}

/** 用原始 arXiv 查询串检索（支持 all:"..." 之类的字段检索） */
export async function fetchArxivQuery(q, { maxResults = 200 } = {}) {
  const url =
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}` +
    `&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${maxResults}`
  // arXiv 限流很严（实测 3 秒间隔仍可能返回 429），用长退避重试
  const xml = await fetchWithRetry(url, { as: 'text', timeout: 40000, retries: 4, retryDelay: 9000 })
  const feed = parser.parse(xml)?.feed
  const entries = feed?.entry || []
  return entries.map(mapEntry).filter((p) => p.title)
}

function mapEntry(e) {
  const absUrl = typeof e.id === 'string' ? e.id : ''
  const arxivId = arxivIdFromUrl(absUrl)
  const authors = (e.author || []).map((a) => tidy(a?.name)).filter(Boolean)
  const categories = (e.category || []).map((c) => c?.['@_term']).filter(Boolean)
  const links = e.link || []
  const pdf = links.find((l) => l?.['@_title'] === 'pdf')?.['@_href'] || ''
  const journalRef = tidy(e['arxiv:journal_ref'] || '')
  const doi = tidy(e['arxiv:doi'] || '')

  return {
    id: 'ax:' + arxivId,
    kind: 'preprint',
    arxivId,
    doi,
    title: tidy(e.title),
    abstract: tidy(e.summary),
    date: (e.published || '').slice(0, 10),
    updated: (e.updated || '').slice(0, 10),
    authors,
    authorCount: authors.length,
    venue: 'arXiv',
    venueShort: 'arXiv',
    arxivCategories: categories,
    journalRef,
    citedBy: null,
    citedness: null,
    isOA: true,
    oaStatus: 'preprint',
    url: absUrl || (arxivId ? `https://arxiv.org/abs/${arxivId}` : ''),
    pdfUrl: pdf,
    figures: [],
  }
}
