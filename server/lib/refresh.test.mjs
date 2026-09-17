import { describe, it, expect } from 'vitest'
import { keyOf, mergeInto, mergeJournalChannels, linkPreprints } from './refresh.mjs'

describe('keyOf', () => {
  it('有 DOI 时用归一化 DOI 作主键', () => {
    expect(keyOf({ doi: 'https://doi.org/10.1/AbC', title: 'x' })).toBe('doi:10.1/abc')
  })

  it('无 DOI 时退回归一化标题', () => {
    expect(keyOf({ title: 'Attention Is All You Need' })).toBe('tk:attentionisallyouneed')
  })

  it('同一 DOI 的大小写/前缀差异映射到同一 key（保证去重）', () => {
    expect(keyOf({ doi: '10.1/X' })).toBe(keyOf({ doi: 'https://doi.org/10.1/x' }))
  })
})

describe('mergeInto', () => {
  it('已有的摘要不被覆盖', () => {
    const base = { abstract: '原始摘要', abstractSource: 'openalex' }
    mergeInto(base, { abstract: '新摘要', abstractSource: 'crossref' })
    expect(base.abstract).toBe('原始摘要')
    expect(base.abstractSource).toBe('openalex')
  })

  it('缺失的摘要被补齐并记录来源', () => {
    const base = { abstract: '' }
    mergeInto(base, { abstract: '补来的摘要', abstractSource: 'arxiv' })
    expect(base.abstract).toBe('补来的摘要')
    expect(base.abstractSource).toBe('arxiv')
  })

  it('学科去重合并', () => {
    const base = { disciplines: ['ai'] }
    mergeInto(base, { disciplines: ['ai', 'rs'] })
    expect(base.disciplines.sort()).toEqual(['ai', 'rs'])
  })

  it('从预印本记录补齐 arXiv id 与配图', () => {
    const base = {}
    mergeInto(base, { arxivId: '2609.1v1', arxivUrl: 'u', figures: ['f1.png'] })
    expect(base.arxivId).toBe('2609.1v1')
    expect(base.figures).toEqual(['f1.png'])
  })

  it('已有配图时不被空配图覆盖', () => {
    const base = { figures: ['keep.png'] }
    mergeInto(base, { figures: [] })
    expect(base.figures).toEqual(['keep.png'])
  })

  it('开放获取状态从 closed 升级到 open', () => {
    const base = { oaStatus: 'closed', isOA: false }
    mergeInto(base, { oaStatus: 'gold', isOA: true })
    expect(base.oaStatus).toBe('gold')
    expect(base.isOA).toBe(true)
  })

  it('已是开放获取时不被 closed 覆盖', () => {
    const base = { oaStatus: 'green', isOA: true }
    mergeInto(base, { oaStatus: 'closed', isOA: false })
    expect(base.oaStatus).toBe('green')
    expect(base.isOA).toBe(true)
  })
})

describe('mergeJournalChannels', () => {
  it('Crossref 带来 OpenAlex 没有的新 DOI 时计入 added', () => {
    const openalex = [{ doi: '10.1/a', title: 'A', abstract: 'aa' }]
    const crossref = [{ doi: '10.1/b', title: 'B', abstract: 'bb' }]
    const { list, added, filled } = mergeJournalChannels(openalex, crossref)
    expect(list).toHaveLength(2)
    expect(added).toBe(1)
    expect(filled).toBe(0)
  })

  it('已存在但缺摘要的记录被 Crossref 补齐并计入 filled', () => {
    const openalex = [{ doi: '10.1/a', title: 'A', abstract: '' }]
    const crossref = [{ doi: '10.1/a', title: 'A', abstract: 'from crossref' }]
    const { list, added, filled } = mergeJournalChannels(openalex, crossref)
    expect(list).toHaveLength(1)
    expect(added).toBe(0)
    expect(filled).toBe(1)
    expect(list[0].abstract).toBe('from crossref')
    expect(list[0].abstractSource).toBe('crossref')
  })

  it('已有摘要的记录不会被 Crossref 覆盖', () => {
    const openalex = [{ doi: '10.1/a', title: 'A', abstract: '原摘要' }]
    const crossref = [{ doi: '10.1/a', title: 'A', abstract: 'crossref摘要' }]
    const { filled, list } = mergeJournalChannels(openalex, crossref)
    expect(filled).toBe(0)
    expect(list[0].abstract).toBe('原摘要')
  })
})

describe('linkPreprints', () => {
  it('按归一化标题给期刊论文补摘要与 arXiv 链接', () => {
    const journals = [{ title: 'Deep Learning for Remote Sensing', abstract: '' }]
    const arxiv = [
      {
        title: 'Deep Learning for Remote Sensing',
        abstract: 'preprint abstract',
        arxivId: '2609.1',
        arxivUrl: 'https://arxiv.org/abs/2609.1',
      },
    ]
    const linked = linkPreprints(journals, arxiv)
    expect(linked).toBe(1)
    expect(journals[0].abstract).toBe('preprint abstract')
    expect(journals[0].abstractSource).toBe('arxiv')
    expect(journals[0].arxivId).toBe('2609.1')
  })

  it('已有摘要时不覆盖，但仍补 arXiv 链接', () => {
    const journals = [{ title: 'A Very Long And Distinctive Paper Title', abstract: '已有摘要' }]
    const arxiv = [
      { title: 'A Very Long And Distinctive Paper Title', abstract: 'preprint', arxivId: '2609.2' },
    ]
    linkPreprints(journals, arxiv)
    expect(journals[0].abstract).toBe('已有摘要')
    expect(journals[0].arxivId).toBe('2609.2')
  })

  it('过短标题（归一化后 ≤20 字符）不参与匹配，避免误配', () => {
    const journals = [{ title: 'Short Title', abstract: '' }]
    const arxiv = [{ title: 'Short Title', abstract: 'preprint', arxivId: '2609.3' }]
    const linked = linkPreprints(journals, arxiv)
    expect(linked).toBe(0)
    expect(journals[0].abstract).toBe('')
  })

  it('标题不同则不匹配', () => {
    const journals = [{ title: 'Completely Different Journal Paper Title Here', abstract: '' }]
    const arxiv = [{ title: 'An Entirely Unrelated Preprint Title String', abstract: 'x', arxivId: 'y' }]
    expect(linkPreprints(journals, arxiv)).toBe(0)
  })
})
