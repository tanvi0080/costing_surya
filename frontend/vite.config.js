import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const FRAPPE = process.env.FRAPPE_URL || 'http://localhost:8001'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // production files are served by Frappe from /assets/costing/frontend/
  base: command === 'build' ? '/assets/costing/frontend/' : '/',
  build: {
    outDir: '../costing/public/frontend',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'app.js', chunkFileNames: 'chunk-[name].js', assetFileNames: 'app.[ext]' } },
  },
  server: { port: 5173, proxy: { '/api': { target: FRAPPE, changeOrigin: true } } },
}))
