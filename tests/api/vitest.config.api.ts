import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    // Sequential — shared DB state, cannot run in parallel
    sequence: { concurrent: false },
    include: ['tests/api/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
