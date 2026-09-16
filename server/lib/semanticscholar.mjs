import { normalizeDoi } from './util.mjs'

const BATCH = 'https://api.semanticscholar.org/graph/v1/paper/batch?fields=abstract,externalIds'

/**
 * 用 Semantic Scholar 的批量端点给仍然缺摘要的论文兜底。
 * 一次请求最多 500 篇，代价极低；实测能补上约 10% 的 Elsevier 论文。
 * 未认证时有严格限流，因此完全容错：失败就跳过，不影响整轮抓取。
 */
export async function fetchAbstractsByDoi(dois, { chunk = 500, delayMs = 2000 } = {}) {
  const map = new Map()
  for (let i = 0; i < dois.length; i += chunk) {
    const slice = dois.slice(i, i + chunk)
    try {
      const res = await fetch(BATCH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ResearchRadar/1.0',
        },
        body: JSON.stringify({ ids: slice.map((d) => 'DOI:' + d) }),
        signal: AbortSignal.timeout(45000),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const arr = await res.json()
      if (!Array.isArray(arr)) throw new Error('unexpected payload')
      arr.forEach((rec, idx) => {
        if (rec?.abstract) map.set(normalizeDoi(slice[idx]), rec.abstract)
      })
    } catch (e) {
      // 静默跳过：这是尽力而为的补全，不应影响主流程
    }
    if (i + chunk < dois.length) await new Promise((r) => setTimeout(r, delayMs))
  }
  return map
}
