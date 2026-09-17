import { describe, it, expect, afterEach } from 'vitest'
import { attachSummaries } from './summarize.mjs'

// 这些用例只覆盖“无密钥优雅降级”这条无需网络、无需落盘的路径。
// 真正的模型调用属于集成测试，需要本地 DEEPSEEK_API_KEY / ANTHROPIC_API_KEY，不在单测范围内。
const ENV_KEYS = ['LLM_PROVIDER', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY']

describe('attachSummaries（无密钥降级）', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('未配置任何 LLM 密钥时整体跳过，不改动论文', async () => {
    for (const k of ENV_KEYS) delete process.env[k]
    const papers = [
      { title: 'A', abstract: 'some abstract', doi: '10.1/x' },
      { title: 'B', abstract: 'another abstract' },
    ]
    const stat = await attachSummaries(papers)
    expect(stat.skipped).toBe(true)
    expect(stat.generated).toBe(0)
    // 没有密钥时不得给论文挂上 summary 字段
    expect(papers.every((p) => p.summary === undefined)).toBe(true)
  })
})
