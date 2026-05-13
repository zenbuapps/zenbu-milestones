import { defineConfig } from 'tsup';

// MCP server 是 Node 端 ESM CLI；單一 entry → `dist/index.js`，加 shebang 讓
// `bin` 欄位指過去後可直接執行 (`zenbu-roadmaps-mcp` 啟動命令)。
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  // 不 bundle node_modules，依賴讓 npm/pnpm 解析；SDK 是 ESM only
  external: ['@modelcontextprotocol/sdk', 'zod'],
});
