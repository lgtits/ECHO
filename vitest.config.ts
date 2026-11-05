import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 單元測試（services、utils）。元件測試需要時再加 Quasar plugin。
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
