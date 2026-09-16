/**
 * 从 OpenAlex 抓取候选期刊的真实指标，用来生成 journals.js 白名单。
 * OpenAlex 的 summary_stats['2yr_mean_citedness'] 是影响因子的免费替代口径。
 * 用法: node scripts/harvest-journals.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'

const MAILTO = 'research-radar@example.com'

// 候选期刊（学科 -> ISSN 列表），最终门槛由抓到的真实指标决定
const CANDIDATES = {
  ai: [
    ['Nature Machine Intelligence', '2522-5839'],
    ['IEEE TPAMI', '0162-8828'],
    ['Information Fusion', '1566-2535'],
    ['Medical Image Analysis', '1361-8415'],
    ['International Journal of Computer Vision', '0920-5691'],
    ['IEEE Transactions on Image Processing', '1057-7149'],
    ['IEEE Transactions on Neural Networks and Learning Systems', '2162-237X'],
    ['Pattern Recognition', '0031-3203'],
    ['IEEE Transactions on Knowledge and Data Engineering', '1041-4347'],
    ['Knowledge-Based Systems', '0950-7051'],
    ['Expert Systems with Applications', '0957-4174'],
    ['Artificial Intelligence', '0004-3702'],
    ['Neural Networks', '0893-6080'],
    ['IEEE Transactions on Cybernetics', '2168-2267'],
    ['Journal of Machine Learning Research', '1532-4435'],
    ['Nature', '0028-0836'],
    ['Science', '0036-8075'],
    ['Nature Communications', '2041-1723'],
    ['Science Robotics', '2470-9476'],
    ['IEEE Transactions on Emerging Topics in Computational Intelligence', '2471-285X'],
    ['Machine Learning', '0885-6125'],
    ['ACM Transactions on Graphics', '0730-0301'],
  ],
  rs: [
    ['Remote Sensing of Environment', '0034-4257'],
    ['ISPRS Journal of Photogrammetry and Remote Sensing', '0924-2716'],
    ['IEEE Transactions on Geoscience and Remote Sensing', '0196-2892'],
    ['IEEE Geoscience and Remote Sensing Magazine', '2473-2397'],
    ['International Journal of Applied Earth Observation and Geoinformation', '1569-8432'],
    ['Journal of Remote Sensing', '2694-1589'],
    ['ISPRS International Journal of Geo-Information', '2220-9964'],
    ['Remote Sensing', '2072-4292'],
    ['Geo-spatial Information Science', '1009-5020'],
    ['GIScience & Remote Sensing', '1548-1603'],
    ['International Journal of Digital Earth', '1753-8947'],
    ['Big Earth Data', '2096-4471'],
    ['Science of Remote Sensing', '2666-0172'],
    ['IEEE Journal of Selected Topics in Applied Earth Observations and Remote Sensing', '1939-1404'],
    ['IEEE Geoscience and Remote Sensing Letters', '1545-598X'],
    ['Remote Sensing Letters', '2150-704X'],
    ['Photogrammetric Engineering & Remote Sensing', '0099-1112'],
    ['Journal of Geodesy', '0949-7714'],
    ['Earth System Science Data', '1866-3508'],
  ],
}

async function lookup(issn) {
  const url = `https://api.openalex.org/sources?filter=issn:${issn}&mailto=${MAILTO}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const j = await r.json()
      return j.results?.[0] || null
    } catch (e) {
      if (attempt === 2) return { __error: String(e) }
      await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)))
    }
  }
}

const out = {}
for (const [discipline, list] of Object.entries(CANDIDATES)) {
  out[discipline] = []
  const results = await Promise.all(
    list.map(async ([label, issn]) => {
      const s = await lookup(issn)
      if (!s || s.__error) return { label, issn, error: s?.__error || 'not found' }
      const st = s.summary_stats || {}
      return {
        label,
        issn,
        openalex_id: (s.id || '').split('/').pop(),
        name: s.display_name,
        citedness: st['2yr_mean_citedness'] ?? null,
        h_index: st.h_index ?? null,
        works_count: st.works_count ?? s.works_count ?? null,
        is_oa: s.is_oa ?? null,
        homepage: s.homepage_url ?? null,
      }
    })
  )
  out[discipline] = results
  console.log(`\n=== ${discipline} ===`)
  results
    .sort((a, b) => (b.citedness ?? -1) - (a.citedness ?? -1))
    .forEach((r) => {
      const c = r.citedness == null ? '  n/a' : r.citedness.toFixed(1).padStart(5)
      console.log(`${c}  ${r.issn}  ${(r.label || '').slice(0, 60)}${r.error ? '  ERR:' + r.error : ''}`)
    })
}

mkdirSync('data', { recursive: true })
writeFileSync('data/journal-metrics.json', JSON.stringify(out, null, 2), 'utf8')
console.log('\n已写入 data/journal-metrics.json')
