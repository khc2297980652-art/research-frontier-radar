import React, { useEffect, useRef } from 'react'
import { IconClose } from '../icons.jsx'
import { figureSrc } from '../api.js'

export default function Lightbox({ paper, index, onClose, onNavigate }) {
  const closeRef = useRef(null)
  const figures = paper?.figures || []
  const total = figures.length
  const current = figures[index]

  useEffect(() => {
    const prev = document.activeElement
    closeRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && total > 1) onNavigate((index + 1) % total)
      else if (e.key === 'ArrowLeft' && total > 1) onNavigate((index - 1 + total) % total)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [index, total, onClose, onNavigate])

  if (!current) return null

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="配图预览" onClick={onClose}>
      <button
        type="button"
        className="lightbox-close"
        ref={closeRef}
        onClick={onClose}
        aria-label="关闭预览（Esc）"
      >
        <IconClose width={18} height={18} />
      </button>
      <img
        src={figureSrc(current)}
        alt={`${paper.title} 配图 ${index + 1}`}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="cap">
          {paper.title} · 配图 {index + 1}/{total}
        </span>
        {total > 1 && (
          <>
            <button type="button" onClick={() => onNavigate((index - 1 + total) % total)} aria-label="上一张（←）">
              上一张
            </button>
            <button type="button" onClick={() => onNavigate((index + 1) % total)} aria-label="下一张（→）">
              下一张
            </button>
          </>
        )}
        <a href={current} target="_blank" rel="noopener noreferrer" style={{ color: '#c7d2fe' }}>
          查看原图
        </a>
      </div>
    </div>
  )
}
