import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'packages/utils/src/**',
        'apps/web/src/lib/**',
        'apps/api/src/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@crm/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@crm/types': path.resolve(__dirname, '../../packages/types/src'),
    },
  },
});
