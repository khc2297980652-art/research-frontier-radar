import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const CONFIG_PATH = resolve(process.cwd(), 'journals.json')

let cached = null
let cachedMtime = 0

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('缺少 journals.json，请先运行: npm run harvest && npm run config')
  }
  const { mtimeMs } = statSafe(CONFIG_PATH)
  if (!cached || mtimeMs !== cachedMtime) {
    cached = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    cachedMtime = mtimeMs
    // 兜底：确保每个学科都有必需字段
    for (const d of cached.disciplines || []) {
      d.journals ||= []
      d.arxivCategories ||= []
      d.keywords ||= []
      if (d.defaultThreshold == null) d.defaultThreshold = 0
    }
  }
  return cached
}

function statSafe(p) {
  try {
    return statSync(p)
  } catch {
    return { mtimeMs: 0 }
  }
}

/** issn -> { journal, discipline } 索引 */
export function journalIndex(cfg = loadConfig()) {
  const map = new Map()
  for (const d of cfg.disciplines) {
    for (const j of d.journals) {
      map.set(j.issn, { journal: j, discipline: d })
    }
  }
  return map
}

/** 供前端使用的精简配置 */
export function clientConfig(cfg = loadConfig()) {
  return {
    refreshIntervalHours: cfg.refreshIntervalHours ?? 6,
    windowDays: cfg.windowDays ?? 90,
    disciplines: cfg.disciplines.map((d) => ({
      id: d.id,
      name: d.name,
      nameEn: d.nameEn,
      blurb: d.blurb,
      defaultThreshold: d.defaultThreshold,
      arxivCategories: d.arxivCategories,
      journalCount: d.journals.length,
      journals: d.journals.map((j) => ({
        name: j.name,
        short: j.short,
        issn: j.issn,
        citedness: j.citedness,
        homepage: j.homepage,
        core: j.core,
      })),
    })),
  }
}

export { CONFIG_PATH }
