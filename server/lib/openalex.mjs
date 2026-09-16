import { fetchWithRetry, sleep } from './http.mjs'
import { fromInvertedIndex, tidy, isoDate, daysAgo } from './util.mjs'

export const MAILTO = process.env.RADAR_MAILTO || 'research-radar@example.com'

const SELECT = [
  'id',
  'doi',
  'title',
  'display_name',
  'publication_date',
  'authorships',
  'primary_location',
  'best_oa_location',
  'open_access',
  'abstract_inverted_index',
  'cited_by_count',
  'type',
  'primary_topic',
].join(',')

/**
 * 抓取某本期刊在 since 之后发表的文章。
 * OpenAlex 是免费开放 API，sort=publication_date:desc 即“最新优先”。
 */
export async function fetchJournalWorks(issn, sinceDate, { perPage = 100, page = 1 } = {}) {
  const filter = [
    `primary_location.source.issn:${issn}`,
    `from_publication_date:${sinceDate}`,
    'is_retracted:false',
    'is_paratext:false',
    'type:article|review',
  ].join(',')
  const url =
    `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}` +
    `&sort=publication_date:desc&per-page=${perPage}&page=${page}` +
    `&select=${SELECT}&mailto=${encodeURIComponent(MAILTO)}`
  const json = await fetchWithRetry(url)
  return json.results || []
}

/** 分页取全（高产期刊 90 天可能超过一页） */
export async function fetchJournalWorksAll(issn, sinceDate, { perPage = 100, maxPages = 3 } = {}) {
  const all = []
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchJournalWorks(issn, sinceDate, { perPage, page })
    all.push(...batch)
    if (batch.length < perPage) break
    await sleep(250)
  }
  return all
}

/** OpenAlex work -> 内部 paper 结构（不含学科归属，由 refresh 决定） */
export function mapWork(work, journal) {
  const allAuthors = (work.authorships || []).map((a) => a?.author?.display_name).filter(Boolean)
  const authors = allAuthors.slice(0, 12) // 大幅压缩载荷，界面上也只展示前几位
  const oa = work.open_access || {}
  const bestOa = work.best_oa_location || {}
  const primary = work.primary_location || {}
  const doi = (work.doi || '').replace(/^https?:\/\/doi\.org\//i, '')

  return {
    id: 'oa:' + (work.id || '').split('/').pop(),
    kind: 'journal',
    doi,
    title: tidy(work.title || work.display_name || '(无标题)'),
    abstract: fromInvertedIndex(work.abstract_inverted_index),
    date: work.publication_date || '',
    authors,
    authorCount: allAuthors.length,
    venue: primary?.source?.display_name || journal?.name || '',
    venueShort: journal?.short || journal?.name || '',
    issn: journal?.issn || '',
    citedness: journal?.citedness ?? null,
    citedBy: work.cited_by_count ?? 0,
    oaStatus: oa.oa_status || 'closed',
    isOA: !!oa.is_oa,
    pdfUrl: bestOa.pdf_url || '',
    topic: work.primary_topic?.display_name || '',
    url: doi ? `https://doi.org/${doi}` : primary?.landing_page_url || '',
    figures: [],
    arxivId: '',
  }
}

export function defaultSince(windowDays) {
  return isoDate(daysAgo(windowDays))
}
