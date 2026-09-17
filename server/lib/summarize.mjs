import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { z } from 'zod'
import { mapPool, fetchWithRetry } from './http.mjs'
import { normalizeDoi, normTitle } from './util.mjs'

const CACHE_PATH = 'data/summaries.json'

// 与 refresh.mjs 的 keyOf 保持一致：优先 DOI，否则归一化标题。
// 这里本地定义而非从 refresh.mjs 导入，避免两个模块相互 import 形成循环依赖。
const keyOf = (p) => (p.doi ? 'doi:' + normalizeDoi(p.doi) : 'tk:' + normTitle(p.title))

/**
 * 一篇论文的结构化中文速读。约束模型只依据摘要作答，缺失的字段如实说明，
 * 不臆造摘要中没有的信息——这是让速读可信、可放进求职作品的关键。
 */
const SummarySchema = z.object({
  tldr: z.string().describe('一句话中文速览，点明这篇论文做了什么、解决了什么问题'),
  contributions: z.array(z.string()).describe('2-4 条核心贡献，每条一个短句；摘要信息不足时可少于 2 条'),
  method: z.string().describe('方法/技术路线一句话概括；摘要未提及则写“摘要未提及”'),
  limitations: z.string().describe('局限或适用范围一句话；摘要未提及则写“摘要未提及”'),
})

const SYSTEM = [
  '你是严谨的科研文献速读助手。给定论文标题与摘要，用简体中文输出结构化速读。',
  '严格只依据所给摘要内容，不得引入摘要之外的背景知识或臆测；凡摘要未涵盖的字段，如实写“摘要未提及”，不要编造。',
  '语言精炼、面向研究者，避免营销式夸张词汇。',
].join('')

// DeepSeek 等 OpenAI 兼容端点走 JSON 模式，prompt 里必须出现 “json” 并给出字段结构。
const JSON_HINT =
  '只输出一个 json 对象，不要任何额外文字或 Markdown 代码块。字段：' +
  '{"tldr": 字符串, "contributions": 字符串数组(2-4条), "method": 字符串, "limitations": 字符串}。'

const buildInput = (p) =>
  [`标题：${p.title || ''}`, `来源：${p.venue || p.venueShort || ''}`, `摘要：${p.abstract}`].join('\n')

// 去掉模型偶尔会包裹的 ```json ... ``` 代码块围栏
function stripFences(s) {
  const t = String(s).trim()
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return m ? m[1] : t
}

// ---------- Provider 抽象：DeepSeek（OpenAI 兼容）/ Anthropic 二选一 ----------

function deepseekProvider() {
  const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
  const model = process.env.SUMMARY_MODEL || 'deepseek-chat'
  const key = process.env.DEEPSEEK_API_KEY
  return {
    name: 'deepseek',
    model,
    async summarize(p) {
      const data = await fetchWithRetry(`${base}/chat/completions`, {
        timeout: 60000,
        headers: { Authorization: `Bearer ${key}` },
        body: {
          model,
          max_tokens: 1024,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM + JSON_HINT },
            { role: 'user', content: buildInput(p) },
          ],
        },
      })
      const content = data?.choices?.[0]?.message?.content
      if (!content) return null
      // JSON 模式仍可能返回不合法结构，交给 zod 校验；不合法即抛出，计入失败、下轮重试。
      const parsed = SummarySchema.parse(JSON.parse(stripFences(content)))
      return { ...parsed, model }
    },
  }
}

async function anthropicProvider() {
  // 惰性加载 SDK：只有真正走 Anthropic 时才引入，DeepSeek 用户与单测无需加载。
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
  const model = process.env.SUMMARY_MODEL || 'claude-haiku-4-5'
  const client = new Anthropic()
  return {
    name: 'anthropic',
    model,
    async summarize(p) {
      const res = await client.messages.parse({
        model,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildInput(p) }],
        output_config: { format: zodOutputFormat(SummarySchema) },
      })
      const out = res.parsed_output
      return out ? { ...out, model } : null
    },
  }
}

/**
 * 解析当前该用哪个 LLM。优先看显式的 LLM_PROVIDER，否则按已配置的密钥自动选择
 * （DeepSeek 优先，因为更省）。都没有则返回 null，调用方据此整体跳过。
 */
async function resolveProvider() {
  const explicit = (process.env.LLM_PROVIDER || '').toLowerCase()
  const hasDeepseek = !!process.env.DEEPSEEK_API_KEY
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const pick = explicit || (hasDeepseek ? 'deepseek' : hasAnthropic ? 'anthropic' : '')
  if (pick === 'deepseek' && hasDeepseek) return deepseekProvider()
  if (pick === 'anthropic' && hasAnthropic) return anthropicProvider()
  return null
}

let cache = null

export function loadSummaryCache() {
  if (cache) return cache
  try {
    cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {}
  } catch {
    cache = {}
  }
  return cache
}

export function saveSummaryCache() {
  if (!cache) return
  mkdirSync('data', { recursive: true })
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 0), 'utf8')
}

/**
 * 为一批论文补齐结构化速读，结果落盘缓存，同一篇只算一次（跨次累积，控制成本）。
 * 未配置任何 LLM 密钥（DEEPSEEK_API_KEY / ANTHROPIC_API_KEY）时整体跳过，
 * 保持无密钥也能正常出站的优雅降级。limit 控制单轮新增调用量，避免首轮全量计费。
 */
export async function attachSummaries(papers, { limit = 200, concurrency = 4, onProgress } = {}) {
  const provider = await resolveProvider()
  if (!provider) {
    return { skipped: true, reason: 'no-llm-provider', generated: 0, failed: 0, cached: 0, attached: 0 }
  }

  const store = loadSummaryCache()

  // 只处理有摘要、且尚未生成过速读的论文
  const need = papers.filter((p) => p.abstract && !(keyOf(p) in store)).slice(0, limit)

  let done = 0
  let generated = 0
  let failed = 0
  if (need.length) {
    await mapPool(need, concurrency, async (p) => {
      try {
        const s = await provider.summarize(p)
        if (s) {
          store[keyOf(p)] = s
          generated++
        } else {
          failed++
        }
      } catch {
        // 单篇失败不影响整体，留待下一轮重试
        failed++
      }
      done++
      onProgress?.(done, need.length)
    })
    saveSummaryCache()
  }

  let attached = 0
  for (const p of papers) {
    const s = store[keyOf(p)]
    if (s) {
      p.summary = s
      attached++
    }
  }
  return {
    provider: provider.name,
    model: provider.model,
    generated,
    failed,
    cached: Object.keys(store).length,
    attached,
  }
}
