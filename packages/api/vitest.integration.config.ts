import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['../../tests/integration/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@nova/core': resolve(__dirname, '../core/src/index.ts'),
      '@nova/intent': resolve(__dirname, '../intent/src/index.ts'),
    },
  },
});
