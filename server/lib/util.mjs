/** OpenAlex 的 abstract_inverted_index 还原成正常段落 */
export function fromInvertedIndex(idx) {
  if (!idx || typeof idx !== 'object') return ''
  const slots = []
  for (const [word, positions] of Object.entries(idx)) {
    if (!Array.isArray(positions)) continue
    for (const p of positions) slots[p] = word
  }
  return tidy(slots.filter(Boolean).join(' '))
}

/** 去掉 JATS/HTML 标签，Crossref 的摘要常带 <jats:p> */
export function stripMarkup(s) {
  if (!s) return ''
  return tidy(
    String(s)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
  )
}

/**
 * 清洗文本里的 LaTeX/标记残留。
 * arXiv 的标题与摘要大量使用 \emph{}、``引号''、$数学$，不清掉会直接显示成乱码。
 */
const SYMBOLS = {
  // 希腊字母
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ',
  Psi: 'Ψ', Omega: 'Ω',
  // 运算符与关系
  times: '×', cdot: '·', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥',
  ll: '≪', gg: '≫', approx: '≈', sim: '∼', simeq: '≃', neq: '≠', ne: '≠', equiv: '≡',
  propto: '∝', infty: '∞', circ: '°', degree: '°', percent: '%', sqrt: '√',
  // 箭头与集合
  rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', leftrightarrow: '↔',
  in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', sum: 'Σ', prod: 'Π', int: '∫',
  partial: '∂', nabla: '∇',
  // 省略号与空白
  dots: '…', ldots: '…', cdots: '…', quad: ' ', qquad: ' ', hspace: '', vspace: '',
}

export function cleanText(s) {
  let t = String(s || '')
  // 强调、字体与重音命令：保留内容
  t = t.replace(
    /\\(?:emph|textit|textbf|texttt|textrm|textsf|textsc|textnormal|mbox|hbox|text|mathrm|mathbf|mathit|mathsf|operatorname|mathcal|mathbb|mathfrak|boldsymbol|bm|vec|hat|bar|tilde|widehat|widetilde|overline|underline|dot|ddot)\s*\{([^{}]*)\}/g,
    '$1'
  )
  // 引用/标签/脚注/链接/排版开关：整体去掉
  t = t.replace(
    // 注意：较长的命令名必须排在前面，否则 \cite 会先吃掉 \citep 的前缀
    /\\(?:citealp|citep|citet|cite|eqref|ref|label|footnote|url|href|thanks|corref|left|right|Bigg|bigg|Big|big|displaystyle|textstyle|limits|nonumber|notag)\s*(?:\[[^\]]*\])?\s*(?:\{[^{}]*\})?/g,
    ' '
  )
  // 常用数学符号换成 Unicode，此时尚未丢失信息
  t = t.replace(/\\([a-zA-Z]+)/g, (m, name) => (name in SYMBOLS ? SYMBOLS[name] : name))
  // 间距类命令
  t = t.replace(/\\[,;:!]/g, ' ').replace(/\\ /g, ' ')
  // 角度：^\circ 已经在上一轮变成 ^°，这里把多余的 ^ 去掉
  t = t.replace(/\^\s*(°|∘)/g, '$1')
  // 转义字面量先换成占位符，否则会被下面的数学定界符规则误删
  t = t
    .replace(/\\\$/g, '\u0001')
    .replace(/\\%/g, '%')
    .replace(/\\&/g, '&')
    .replace(/\\_/g, '_')
    .replace(/\\#/g, '#')
  // 数学定界符：保留内容，去掉 $
  t = t.replace(/\$\$?/g, '')
  t = t.replace(/\u0001/g, '$')
  // LaTeX 引号与波浪号
  t = t.replace(/``/g, '“').replace(/''/g, '”').replace(/`/g, '‘').replace(/~+/g, ' ')
  // 兜底：不要留下孤立的花括号
  t = t.replace(/[{}]/g, '')
  return t
}

export function tidy(s) {
  return cleanText(s)
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeDoi(doi) {
  if (!doi) return ''
  return String(doi)
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .trim()
}

export function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

export function daysAgo(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

export function daysBetween(isoA, isoB) {
  const a = new Date(isoA).getTime()
  const b = new Date(isoB).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity
  return Math.abs(b - a) / 86400000
}

/** 从各种 arXiv URL 里取出版本化 id，如 2609.17527v1 */
export function arxivIdFromUrl(url) {
  const m = String(url || '').match(/arxiv\.org\/(?:abs|pdf|html)\/([^?#]+?)(?:\.pdf)?(?:[?#]|$)/i)
  if (!m) return ''
  return decodeURIComponent(m[1]).replace(/\/$/, '')
}

export function stripVersion(arxivId) {
  return String(arxivId || '').replace(/v\d+$/, '')
}
