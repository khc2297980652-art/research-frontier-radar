/**
 * 把 data/journal-metrics.json（OpenAlex 实测指标）编译成 journals.json 白名单配置。
 * 指标 = OpenAlex summary_stats['2yr_mean_citedness']，影响因子的免费替代口径。
 * 用法: node scripts/build-config.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const METRICS = 'data/journal-metrics.json'
if (!existsSync(METRICS)) {
  console.error(`缺少 ${METRICS}，请先运行: node scripts/harvest-journals.mjs`)
  process.exit(1)
}
const metrics = JSON.parse(readFileSync(METRICS, 'utf8'))

// 按 OpenAlex 抓到的 issn 匹配，附加手工标注的元信息
const NOTE = {
  '0034-4257': { short: 'RSE', core: true },
  '0924-2716': { short: 'ISPRS J P&RS', core: true },
  '0196-2892': { short: 'IEEE TGRS', core: true },
  '2473-2397': { short: 'IEEE GRSM', core: true },
  '2694-1589': { short: 'J. Remote Sens.', core: true },
  '1569-8432': { short: 'IJAEOG', core: true },
  '2072-4292': { short: 'Remote Sensing', core: true },
  '1866-3508': { short: 'ESSD', core: true },
  '1753-8947': { short: 'IJDE', core: true },
  '1548-1603': { short: 'GISci. Remote Sens.', core: true },
  '1939-1404': { short: 'IEEE JSTARS', core: true },
  '1545-598X': { short: 'IEEE GRSL', core: true },
  '2220-9964': { short: 'ISPRS IJGI', core: true },
  '1009-5020': { short: 'Geo-spat. Inf. Sci.', core: true },
  '2666-0172': { short: 'Sci. Remote Sens.', core: true },
  '0949-7714': { short: 'J. Geodesy', core: true },
  '2096-4471': { short: 'Big Earth Data', core: true },
  '0099-1112': { short: 'PE&RS', core: true },

  '2522-5839': { short: 'Nature MI', core: true },
  '0162-8828': { short: 'IEEE TPAMI', core: true },
  '1566-2535': { short: 'Inf. Fusion', core: true },
  '1361-8415': { short: 'Med. Image Anal.', core: true },
  '0920-5691': { short: 'IJCV', core: true },
  '1057-7149': { short: 'IEEE TIP', core: true },
  '2162-237X': { short: 'IEEE TNNLS', core: true },
  '2168-2267': { short: 'IEEE TCyb', core: true },
  '1041-4347': { short: 'IEEE TKDE', core: true },
  '0031-3203': { short: 'Pattern Recognit.', core: false },
  '0950-7051': { short: 'Knowl.-Based Syst.', core: false },
  '0957-4174': { short: 'Expert Syst. Appl.', core: false },
  '0893-6080': { short: 'Neural Netw.', core: false },
  '0730-0301': { short: 'ACM TOG', core: false },
  '2471-285X': { short: 'IEEE TETCI', core: false },
  '0004-3702': { short: 'Artif. Intell.', core: false },
  '0885-6125': { short: 'Mach. Learn.', core: false },
  '1532-4435': { short: 'JMLR', core: false },
}

// 通用大刊不进白名单：它们会淹没学科内容，需要额外的主题过滤
const EXCLUDE = new Set(['0028-0836', '0036-8075', '2041-1723', '2470-9476', '1532-4435'])

const DISCIPLINES = [
  {
    id: 'ai',
    name: '人工智能',
    nameEn: 'Artificial Intelligence',
    blurb: '机器学习、计算机视觉、模式识别与智能系统方向的顶级期刊',
    defaultThreshold: 9.0,
    arxivCategories: ['cs.AI', 'cs.LG', 'cs.CV', 'cs.CL', 'cs.NE', 'cs.RO', 'stat.ML'],
    arxivQuery: 'cat:cs.AI OR cat:cs.LG OR cat:cs.CV OR cat:cs.CL OR cat:cs.NE OR cat:cs.RO OR stat.ML',
    keywords: [],
  },
  {
    id: 'rs',
    name: '遥感',
    nameEn: 'Remote Sensing',
    blurb: '遥感科学、摄影测量、地球观测与地理信息方向的顶级期刊',
    defaultThreshold: 6.0,
    // arXiv 没有遥感专属分类，改用元数据全文检索召回，再用关键词做兜底分类
    arxivCategories: ['eess.IV', 'physics.ao-ph', 'physics.geo-ph'],
    arxivQuery:
      'all:"remote sensing" OR all:"satellite imagery" OR all:"satellite image" OR ' +
      'all:hyperspectral OR all:"synthetic aperture radar" OR all:"land cover" OR ' +
      'all:"earth observation" OR all:"aerial imagery"',
    keywords: [
      'remote sensing', 'satellite imagery', 'satellite image', 'hyperspectral',
      'multispectral', 'sar image', 'synthetic aperture radar', 'land cover',
      'land use', 'earth observation', 'photogrammetry', 'lidar', 'point cloud',
      'geospatial', 'aerial imagery', 'aerial image', 'change detection',
      'vegetation index', 'ndvi', 'crop mapping', 'geographic information',
    ],
  },
]

const out = {
  _readme:
    '学科与期刊白名单配置。citedness = OpenAlex 2 年平均被引（影响因子的免费替代口径），可用 `npm run harvest` + `npm run config` 重新生成。新增学科：复制一段 disciplines 即可，前端会自动出现新的标签页。',
  refreshIntervalHours: 6,
  windowDays: 90,
  disciplines: [],
}

for (const d of DISCIPLINES) {
  const rows = (metrics[d.id] || [])
    .filter((r) => !r.error && !EXCLUDE.has(r.issn))
    .map((r) => ({
      name: r.label,
      short: NOTE[r.issn]?.short || r.label.slice(0, 22),
      issn: r.issn,
      citedness: r.citedness == null ? null : Math.round(r.citedness * 10) / 10,
      openalexId: r.openalex_id,
      homepage: r.homepage,
      core: NOTE[r.issn]?.core ?? false,
    }))
    .sort((a, b) => (b.citedness ?? -1) - (a.citedness ?? -1))

  out.disciplines.push({ ...d, journals: rows })
  const on = rows.filter((r) => (r.citedness ?? 0) >= d.defaultThreshold).length
  console.log(`${d.name}: ${rows.length} 本候选，默认门槛 ${d.defaultThreshold} 下启用 ${on} 本`)
}

writeFileSync('journals.json', JSON.stringify(out, null, 2), 'utf8')
console.log('\n已写入 journals.json')
