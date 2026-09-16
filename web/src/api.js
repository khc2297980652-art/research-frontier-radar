/**
 * 数据访问层。同一套前端有两种运行形态：
 *
 *  - 服务器模式（npm start）：走 /api/*，可以点按钮实时抓取、图片经本地代理。
 *  - 静态模式（npm run build:static）：数据是随站点一起发布的静态 JSON，
 *    没有后端，图片直接热链 arXiv（实测 arXiv 允许任意 Referer 热链）。
 *
 * 两者的差异全部收敛在这个文件里，页面组件不需要关心。
 */
export const isStatic = typeof __STATIC__ !== 'undefined' && __STATIC__

// 静态模式用相对路径，这样部署到 GitHub Pages 的 /<repo>/ 子路径下也能正确取数
const dataUrl = (name) => new URL(`data/${name}`, document.baseURI).href

async function getJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

/** 轻量状态：配置、计数、抓取进度 */
export async function loadState() {
  if (isStatic) {
    const s = await getJSON(dataUrl('state.json'))
    return { ...s, runtime: { refreshing: false } }
  }
  return getJSON('/api/state')
}

/** 论文正文，仅在数据版本变化时拉取 */
export async function loadPapers() {
  if (isStatic) return getJSON(dataUrl('papers.json'))
  const json = await getJSON('/api/papers')
  return json.store
}

/** 触发一次抓取；静态部署下没有后端可触发 */
export async function requestRefresh() {
  if (isStatic) return { started: false, reason: 'static' }
  return getJSON('/api/refresh', { method: 'POST' })
}

/** 配图地址：静态模式直链，服务器模式走代理（避免热链与 CORS 问题） */
export function figureSrc(url) {
  if (isStatic) return url
  return `/api/img?u=${encodeURIComponent(url)}`
}
