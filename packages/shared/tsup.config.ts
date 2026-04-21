import { defineConfig } from 'tsup';

// Monorepo 跨端 (NestJS CJS runtime + Vite 前端 ESM) 同時消費 shared，
// 因此 dual package：cjs → dist/index.js，esm → dist/index.mjs，types → dist/index.d.ts
// package.json 的 `exports` 會依呼叫端的 module system 挑對應檔案。
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
