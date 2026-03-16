// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    // 固定端口，避免随机变
    port: 5173,
    strictPort: true,

    // 显式开启 HMR，并强制用 ws 协议
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      // clientPort 有时在嵌入式 WebView 里必须显式设
      clientPort: 5173
    },

    // 防止文件系统 watch 出问题（尤其 Windows / WSL）
    watch: {
      // usePolling: true,   // 如果你是 Windows + WSL 或虚拟机，先注释掉，后面不行再开
      // interval: 1000
    },

    // 开发阶段允许访问本地文件
    fs: {
      strict: false
    }
  },

  // 推荐加这几行，防止 css 顽固缓存
  css: {
    devSourcemap: true
  },

  // Tauri 相关（防止 base 路径问题）
  base: './',
  clearScreen: false
})