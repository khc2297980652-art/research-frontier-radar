/** 手动跑一次完整抓取：node scripts/refresh-once.mjs */
import { runRefresh } from '../server/lib/refresh.mjs'

try {
  const store = await runRefresh()
  console.log('\n抓取完成:', JSON.stringify(store?.counts, null, 2))
  if (store?.errors?.length) {
    console.log('\n部分来源失败（不影响其它来源）:')
    store.errors.slice(0, 15).forEach((e) => console.log('  -', JSON.stringify(e)))
  }
} catch (e) {
  console.error('抓取失败:', e)
  process.exit(1)
}
