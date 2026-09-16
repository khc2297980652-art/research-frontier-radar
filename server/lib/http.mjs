export const UA =
  'ResearchRadar/1.0 (academic literature aggregator; contact: research-radar@example.com)'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 带重试与超时的 fetch。429/5xx 会退避重试；404 等客户端错误直接抛出。
 */
export async function fetchWithRetry(
  url,
  { timeout = 30000, retries = 3, headers = {}, as = 'json', retryDelay = 1500 } = {}
) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow',
      })
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status)
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status)
        err.status = res.status
        err.permanent = true
        throw err
      }
      return as === 'text' ? await res.text() : await res.json()
    } catch (e) {
      lastErr = e
      if (e.permanent) throw e
      if (i < retries) await sleep(retryDelay * (i + 1))
    }
  }
  throw lastErr
}

/** 限制并发数的 map，避免把公开 API 打爆 */
export async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      try {
        out[i] = await fn(items[i], i)
      } catch (e) {
        out[i] = { __error: String(e?.message || e) }
      }
    }
  })
  await Promise.all(workers)
  return out
}
