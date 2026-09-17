import { describe, it, expect } from 'vitest'
import {
  fromInvertedIndex,
  stripMarkup,
  cleanText,
  tidy,
  normalizeDoi,
  normTitle,
  daysBetween,
  arxivIdFromUrl,
  stripVersion,
} from './util.mjs'

describe('fromInvertedIndex', () => {
  it('按位置还原倒排索引为正常语序', () => {
    const idx = { Hello: [0], big: [1], world: [2] }
    expect(fromInvertedIndex(idx)).toBe('Hello big world')
  })

  it('同一词出现在多个位置也能正确铺开', () => {
    const idx = { the: [0, 2], cat: [1], sat: [3] }
    expect(fromInvertedIndex(idx)).toBe('the cat the sat')
  })

  it('非法输入返回空串而不抛错', () => {
    expect(fromInvertedIndex(null)).toBe('')
    expect(fromInvertedIndex('not an object')).toBe('')
    expect(fromInvertedIndex({ a: 'not-array' })).toBe('')
  })
})

describe('stripMarkup', () => {
  it('去掉 JATS 标签并解码实体', () => {
    expect(stripMarkup('<jats:p>A &amp; B are &lt;linked&gt;</jats:p>')).toBe('A & B are <linked>')
  })

  it('空输入返回空串', () => {
    expect(stripMarkup('')).toBe('')
    expect(stripMarkup(null)).toBe('')
  })
})

describe('cleanText', () => {
  it('保留强调命令的内容', () => {
    expect(cleanText('\\emph{important} and \\textbf{bold}')).toBe('important and bold')
  })

  it('把希腊字母命令换成 Unicode', () => {
    expect(cleanText('\\alpha + \\beta = \\gamma')).toBe('α + β = γ')
  })

  it('整体删除引用类命令', () => {
    // \cite{foo} 被替换为空格，前后各留一个空格 → tidy 后为 "See ."
    expect(tidy(cleanText('See \\cite{smith2020} .'))).toBe('See .')
  })

  it('较长命令名不被短命令名截断（citep 不被 cite 吃掉前缀）', () => {
    expect(tidy(cleanText('result \\citep{a} end'))).toBe('result end')
  })

  it('去掉数学定界符但保留内容', () => {
    expect(cleanText('the value $x^2$ here').replace(/\s+/g, ' ')).toBe('the value x^2 here')
  })

  it('转义的美元符号被还原为字面量而非当作数学定界符', () => {
    expect(cleanText('costs \\$5 and \\$10')).toBe('costs $5 and $10')
  })

  it('LaTeX 引号转成中文引号', () => {
    expect(cleanText("``quoted''")).toBe('“quoted”')
  })

  it('不残留孤立花括号', () => {
    expect(cleanText('a {b} c')).not.toMatch(/[{}]/)
  })
})

describe('tidy', () => {
  it('折叠空白并去首尾空格', () => {
    expect(tidy('  a\n\t b   c  ')).toBe('a b c')
  })
})

describe('normalizeDoi', () => {
  it('去掉 doi.org 前缀并小写', () => {
    expect(normalizeDoi('https://doi.org/10.1234/AbC.DEF')).toBe('10.1234/abc.def')
    expect(normalizeDoi('http://dx.doi.org/10.1/x')).toBe('10.1/x')
  })

  it('已是裸 DOI 时只做小写归一', () => {
    expect(normalizeDoi('10.1/XyZ')).toBe('10.1/xyz')
  })

  it('空值返回空串', () => {
    expect(normalizeDoi(null)).toBe('')
    expect(normalizeDoi('')).toBe('')
  })
})

describe('normTitle', () => {
  it('去掉标点空格并小写，标点差异不影响匹配', () => {
    expect(normTitle('Deep Learning: A Review!')).toBe(normTitle('deep-learning a  review'))
  })

  it('保留中文字符', () => {
    expect(normTitle('深度学习 综述')).toBe('深度学习综述')
  })

  it('大小写与空格变体归一到同一 key', () => {
    expect(normTitle('Attention Is All You Need')).toBe('attentionisallyouneed')
  })
})

describe('daysBetween', () => {
  it('计算两个日期相差天数', () => {
    expect(daysBetween('2026-01-01', '2026-01-11')).toBe(10)
  })

  it('无关顺序（取绝对值）', () => {
    expect(daysBetween('2026-01-11', '2026-01-01')).toBe(10)
  })

  it('非法日期返回 Infinity', () => {
    expect(daysBetween('not-a-date', '2026-01-01')).toBe(Infinity)
  })
})

describe('arxivIdFromUrl', () => {
  it('从 abs/pdf/html 各种链接取出版本化 id', () => {
    expect(arxivIdFromUrl('https://arxiv.org/abs/2609.17527v1')).toBe('2609.17527v1')
    expect(arxivIdFromUrl('https://arxiv.org/pdf/2609.17527.pdf')).toBe('2609.17527')
    expect(arxivIdFromUrl('http://arxiv.org/html/2609.17527v2#sec1')).toBe('2609.17527v2')
  })

  it('非 arXiv 链接返回空串', () => {
    expect(arxivIdFromUrl('https://example.com/abs/123')).toBe('')
    expect(arxivIdFromUrl('')).toBe('')
  })
})

describe('stripVersion', () => {
  it('去掉尾部版本号', () => {
    expect(stripVersion('2609.17527v3')).toBe('2609.17527')
  })

  it('无版本号时原样返回', () => {
    expect(stripVersion('2609.17527')).toBe('2609.17527')
  })
})
