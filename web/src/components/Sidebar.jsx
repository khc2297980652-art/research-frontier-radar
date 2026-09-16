import React from 'react'

const RANGES = [
  [7, '7 天'],
  [14, '14 天'],
  [30, '30 天'],
  [90, '90 天'],
]

export default function Sidebar({
  config,
  journalStats,
  activeDiscipline,
  rangeDays,
  setRangeDays,
  source,
  setSource,
  sort,
  setSort,
  view,
  setView,
  abstractOpen,
  setAbstractOpen,
  thresholds,
  setThreshold,
  journalOff,
  toggleJournal,
  open,
}) {
  const shown =
    activeDiscipline === 'all' ? config.disciplines : config.disciplines.filter((d) => d.id === activeDiscipline)
  const maxRange = config.windowDays || 90
  const stat = journalStats || {}

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="筛选条件">
      <div className="panel">
        <div className="panel-title">筛选</div>

        <div className="field">
          <span className="field-label">时间范围</span>
          <div className="seg">
            {RANGES.filter(([d]) => d <= maxRange).map(([d, label]) => (
              <button key={d} type="button" aria-pressed={rangeDays === d} onClick={() => setRangeDays(d)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">来源</span>
          <div className="seg">
            {[
              ['all', '全部'],
              ['journal', '期刊'],
              ['preprint', '预印本'],
            ].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={source === v} onClick={() => setSource(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">排序</span>
          <div className="seg">
            {[
              ['date', '最新'],
              ['cited', '被引'],
            ].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={sort === v} onClick={() => setSort(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">视图</span>
          <div className="seg">
            {[
              ['list', '列表'],
              ['gallery', '图片优先'],
            ].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">摘要</span>
          <div className="seg">
            <button type="button" aria-pressed={abstractOpen} onClick={() => setAbstractOpen(true)}>
              默认展开
            </button>
            <button type="button" aria-pressed={!abstractOpen} onClick={() => setAbstractOpen(false)}>
              默认收起
            </button>
          </div>
        </div>
      </div>

      {shown.map((d) => {
        const t = thresholds[d.id] ?? d.defaultThreshold
        const max = Math.max(12, ...d.journals.map((j) => j.citedness || 0))
        const onCount = d.journals.filter((j) => (j.citedness || 0) >= t && !journalOff.has(j.issn)).length
        const stale = d.journals.filter((j) => stat[j.issn] && stat[j.issn].count === 0)

        return (
          <div className="panel" key={d.id}>
            <div className="panel-title">{d.name} · 期刊门槛</div>
            <div className="threshold-row">
              <span>篇均被引 ≥</span>
              <span className="threshold-value">{t.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.ceil(max)}
              step="0.5"
              value={t}
              onChange={(e) => setThreshold(d.id, Number(e.target.value))}
              aria-label={`${d.name}的期刊门槛：近两年篇均被引不低于 ${t}`}
            />
            <div className="threshold-row" style={{ marginTop: 6 }}>
              <span>
                已启用 <span className="threshold-value">{onCount}</span> / {d.journals.length} 本
              </span>
            </div>

            <div className="chips" style={{ marginTop: 10 }}>
              {d.journals.map((j) => {
                const above = (j.citedness || 0) >= t
                const enabled = above && !journalOff.has(j.issn)
                const s = stat[j.issn]
                const noRecent = s && s.count === 0
                return (
                  <button
                    key={j.issn}
                    type="button"
                    className={`chip${noRecent ? ' stale' : ''}`}
                    aria-pressed={enabled}
                    onClick={() => toggleJournal(j.issn)}
                    title={
                      `${j.name}\n近两年篇均被引 ${j.citedness ?? '未知'}` +
                      (s ? `\n窗口内命中 ${s.count} 篇${s.latest ? '，最新 ' + s.latest : ''}` : '') +
                      (above ? '' : '\n（低于当前门槛）')
                    }
                  >
                    {j.short}
                    <span className="num">{j.citedness != null ? j.citedness.toFixed(0) : '—'}</span>
                    {s ? <span className="num">{s.count}</span> : null}
                  </button>
                )
              })}
            </div>
            <p className="panel-note">
              点标签可单独开关某本期刊；两个数字依次是「篇均被引」和「本窗口内命中篇数」。
              {stale.length > 0 && (
                <> 虚线的 {stale.length} 本刊本窗口内没被索引到新论文，多为出版商向开放索引供货延迟所致。</>
              )}
            </p>
          </div>
        )
      })}
    </aside>
  )
}
