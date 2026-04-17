import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        /**
         * 把稳定依赖拆成独立 vendor chunk，减轻首页主包体积，
         * 同时让 AI 助手、动效和 Ant Design 缓存更稳定。
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/node_modules/antd/')) return 'vendor-antd'
          if (id.includes('/node_modules/@ant-design/')) return 'vendor-antd-icons'
          if (id.includes('/node_modules/rc-')) return 'vendor-antd-rc'
          if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('html2canvas')) return 'vendor-capture'
          if (id.includes('react-router')) return 'vendor-router'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', //  'https://argentous-phoebe-untrashed.ngrok-free.dev'
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/chat': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // Browser loads recipe images through dev origin; avoids CORS to local MinIO (:9000).
      '/minio': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/minio/, '') || '/',
      },
    },
  },
})
