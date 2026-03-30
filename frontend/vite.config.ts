import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
