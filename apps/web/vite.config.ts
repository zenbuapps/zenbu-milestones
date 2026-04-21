import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Monorepo：envDir 指向 repo root，讓前端讀共用的 .env（VITE_ 前綴才會打包進 bundle）。
// 後端的 .env 變數（SESSION_SECRET / OAuth secret / PAT 等）沒有 VITE_ 前綴，不會外洩。
export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
