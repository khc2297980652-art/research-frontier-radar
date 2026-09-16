import { fetchWithRetry, sleep } from './http.mjs'
import { stripMarkup, tidy, normalizeDoi } from './util.mjs'

const SELECT =
  'DOI,title,abstract,author,container-title,published,published-online,published-print,created,indexed,URL'

const MAILTO = () => encodeURIComponent(process.env.RADAR_MAILTO || 'research-radar@example.com')

function dateParts(d) {
  const p = d?.['date-parts']?.[0]
  if (!p || !p[0]) return ''
  const [y, m, day] = p
  return `${y}-${String(m || 1).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}`
}

/**
 * Crossref 作为第二条发现通道。
 *
 * 为什么需要它：OpenAlex 对部分出版商（尤其 IEEE）的收录会阶段性停滞
 * （实测 TPAMI 停更在 2026-07、TGRS 停更在 2026-01），而 Crossref 的 DOI
 * 注册数据仍然及时。两条通道按 DOI 合并后，覆盖率明显提升。
 *
 * 按 from-index-date 过滤 = “最近刚被收录”，sort=indexed 即最新优先。
 */
export async function fetchCrossrefJournal(issn, sinceDate, { rows = 100, maxPages = 1 } = {}) {
  const items = []
  for (let page = 1; page <= maxPages; page++) {
    const filter = `issn:${issn},from-index-date:${sinceDate},type:journal-article`
    const url =
      `https://api.crossref.org/works?filter=${encodeURIComponent(filter)}` +
      `&rows=${rows}&offset=${(page - 1) * rows}&sort=indexed&order=desc` +
      `&select=${SELECT}&mailto=${MAILTO()}`
    const json = await fetchWithRetry(url)
    const batch = json?.message?.items || []
    items.push(...batch)
    if (batch.length < rows) break
    await sleep(250)
  }
  return items.map(mapItem).filter((p) => p.title && p.doi)
}

function mapItem(it) {
  const doi = normalizeDoi(it.DOI)
  const authors = (it.author || [])
    .map((a) => tidy([a.given, a.family].filter(Boolean).join(' ')))
    .filter(Boolean)
  // 优先上线日期；published-print 常是未来的期号日期（如 2026-10），会造成“未来论文”
  const date =
    dateParts(it['published-online']) ||
    dateParts(it.created) ||
    dateParts(it['published-print']) ||
    dateParts(it.published)

  return {
    id: 'cr:' + doi,
    kind: 'journal',
    doi,
    title: tidy((it.title || [''])[0]),
    abstract: stripMarkup(it.abstract),
    date,
    authors,
    authorCount: authors.length,
    venue: (it['container-title'] || [''])[0] || '',
    citedBy: 0,
    isOA: false,
    oaStatus: '',
    url: doi ? `https://doi.org/${doi}` : it.URL || '',
    figures: [],
    arxivId: '',
    viaCrossref: true,
    indexedAt: dateParts(it.indexed),
  }
}
