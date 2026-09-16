/**
 * 把抓取好的数据导出成随站点发布的静态 JSON。
 *
 * 静态部署的流程是：
 *   1. npm run refresh      用本机（或 GitHub Actions）跑一次抓取，结果落在 data/papers.json
 *   2. node scripts/export-static.mjs   导出到 web/public/data/
 *   3. vite build --mode static         前端与数据一起打包进 web/dist
 *
 * 这样发布出去的站点不需要任何服务器，也不需要数据库。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { clientConfig } from '../server/lib/config.mjs'

const OUT = 'web/public/data'
const STORE = 'data/papers.json'

if (!existsSync(STORE)) {
  console.error(`缺少 ${STORE}。请先运行 npm run refresh 抓取数据。`)
  process.exit(1)
}

const store = JSON.parse(readFileSync(STORE, 'utf8'))
if (!store.papers?.length) {
  console.error(`${STORE} 里没有论文数据，请先运行 npm run refresh。`)
  process.exit(1)
}

// GitHub Actions 里会带上这两个环境变量，用来在页面上生成「手动更新」链接
const repoUrl = process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}`
  : ''

const state = {
  config: clientConfig(),
  meta: {
    generatedAt: store.generatedAt,
    counts: store.counts,
    windowDays: store.windowDays,
  },
  journalStats: store.journalStats || {},
  repoUrl,
}

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/papers.json`, JSON.stringify(store), 'utf8')
writeFileSync(`${OUT}/state.json`, JSON.stringify(state), 'utf8')

const abs = (p) => `${OUT}/${p}`
console.log(`已导出静态数据 → ${abs('state.json')} / ${abs('papers.json')}`)
console.log(
  `  论文 ${store.counts.total} 篇（期刊 ${store.counts.journals} / 预印本 ${store.counts.preprints}，` +
    `含摘要 ${store.counts.withAbstract}，含配图 ${store.counts.withFigures}）`
)
console.log(`  数据时间 ${store.generatedAt}`)
