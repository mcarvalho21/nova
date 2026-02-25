import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/load/stress/**/*.stress.ts'],
    testTimeout: 900_000, // 15 minutes per test
    hookTimeout: 120_000, // 2 minutes for setup/teardown
    sequence: { concurrent: false }, // Run stress tests sequentially
    pool: 'forks', // Isolate tests in separate processes
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  resolve: {
    alias: {
      '@nova/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@nova/intent': resolve(__dirname, 'packages/intent/src/index.ts'),
    },
  },
});
