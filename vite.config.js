import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isStatic = mode === 'static'
  return {
    root: 'web',
    plugins: [react()],
    // 静态部署常用子路径（如 GitHub Pages 的 /<repo>/），因此用相对路径
    base: isStatic ? './' : '/',
    define: {
      __STATIC__: JSON.stringify(isStatic),
    },
    build: {
      // 两种形态输出到不同目录，避免服务器模式与静态模式互相覆盖。
      // web/dist         → npm start 的本地服务
      // web/dist-static  → 发布到 GitHub Pages 的纯静态站点
      outDir: isStatic ? 'dist-static' : 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:8787' },
    },
  }
})
