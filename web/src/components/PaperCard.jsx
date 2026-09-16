import React, { useEffect, useState } from 'react'
import { IconCopy, IconCheck, IconExternal, IconImage } from '../icons.jsx'
import { figureSrc } from '../api.js'

function authorLine(authors, count) {
  if (!authors?.length) return ''
  if (authors.length <= 3) return authors.join(', ')
  return `${authors.slice(0, 3).join(', ')} 等 ${count || authors.length} 位作者`
}

export default function PaperCard({ paper, index, expandedDefault, onOpenFigure, disciplineNames, gallery }) {
  const [expanded, setExpanded] = useState(expandedDefault)
  const [copied, setCopied] = useState(false)

  useEffect(() => setExpanded(expandedDefault), [expandedDefault])
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  const isJournal = paper.kind === 'journal'
  const figures = paper.figures || []
  const abstract = paper.abstract || ''

  async function copyAbstract() {
    try {
      await navigator.clipboard.writeText(
        `${paper.title}\n${paper.url || ''}\n\n${abstract}`
      )
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className="card" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      {gallery && figures.length > 0 && (
        <button
          type="button"
          className="figure-hero"
          onClick={() => onOpenFigure(paper, 0)}
          aria-label={`查看《${paper.title}》的配图`}
        >
          <img src={figureSrc(figures[0])} alt={`${paper.title} 的配图`} loading="lazy" />
        </button>
      )}

      <div className="card-top">
        <span className={`pill ${isJournal ? 'brand' : ''}`}>{paper.venueShort || paper.venue || '未知来源'}</span>
        {isJournal && paper.citedness != null && (
          <span className="pill metric" title="OpenAlex 近两年篇均被引次数（影响因子的免费替代口径）">
            篇均被引 {paper.citedness.toFixed(1)}
          </span>
        )}
        {!isJournal && <span className="pill">预印本</span>}
        {(paper.disciplines || []).map((d) => (
          <span key={d} className="pill">
            {disciplineNames[d] || d}
          </span>
        ))}
        <time className="pill date" dateTime={paper.date}>
          {paper.date}
        </time>
      </div>

      <h2>
        <a href={paper.url || '#'} target="_blank" rel="noopener noreferrer">
          {paper.title}
        </a>
      </h2>

      <p className="authors">
        {authorLine(paper.authors, paper.authorCount)}
        {paper.topic ? ` · ${paper.topic}` : ''}
        {paper.journalRef ? ` · 已发表于 ${paper.journalRef}` : ''}
      </p>

      <div className={`abstract${expanded ? '' : ' clamped'}`}>
        <div className="abstract-head">
          <span className="eyebrow">摘要</span>
          {abstract && (
            <button type="button" className="abstract-toggle" onClick={copyAbstract}>
              {copied ? '已复制' : '复制'}
            </button>
          )}
        </div>
        {abstract ? (
          <p>{abstract}</p>
        ) : (
          <p className="abstract-missing">
            该来源未提供摘要，可点击下方链接前往{isJournal ? '出版商页面' : '原文'}查看。
          </p>
        )}
        {abstract && (
          <button type="button" className="abstract-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '收起摘要' : '展开全文'}
          </button>
        )}
      </div>

      {!gallery && figures.length > 0 && (
        <div className="figures">
          {figures.map((f, i) => (
            <button
              key={f}
              type="button"
              className="thumb"
              onClick={() => onOpenFigure(paper, i)}
              aria-label={`查看《${paper.title}》的第 ${i + 1} 张配图`}
            >
              <img src={figureSrc(f)} alt={`${paper.title} 配图 ${i + 1}`} loading="lazy" />
              <span className="fig-index">{i + 1}</span>
            </button>
          ))}
        </div>
      )}

      {!gallery && figures.length === 0 && (
        <p className="fig-note">
          <IconImage style={{ verticalAlign: '-3px', marginRight: 6 }} />
          {isJournal
            ? '付费期刊不提供可公开分发的正文配图，点击 DOI 用你自己的机构权限查看原文图表。'
            : '这篇预印本暂无可提取的配图。'}
        </p>
      )}

      <div className="card-foot">
        {paper.doi && (
          <a className="link-btn" href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer">
            DOI <IconExternal />
          </a>
        )}
        {paper.arxivId && (
          <a
            className="link-btn"
            href={`https://arxiv.org/abs/${paper.arxivId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            预印本 <IconExternal />
          </a>
        )}
        {paper.pdfUrl && (
          <a className="link-btn" href={paper.pdfUrl} target="_blank" rel="noopener noreferrer">
            PDF <IconExternal />
          </a>
        )}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            navigator.clipboard?.writeText(paper.url || paper.title)
          }}
        >
          复制链接 <IconCopy />
        </button>
        <span className="spacer" />
        {paper.citedBy > 0 && <span className="muted">被引 {paper.citedBy}</span>}
        {paper.oaStatus && isJournal && <span className="muted">{paper.oaStatus === 'closed' ? '订阅制' : paper.oaStatus}</span>}
      </div>
    </article>
  )
}
