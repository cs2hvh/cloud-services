import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
        '.next/',
        'coverage/',
      ],
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,ts}',
      ],
    },
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    // tests/e2e holds Playwright specs; vitest cannot run them (they import
    // @playwright/test and need a live server), so they only ever show up as
    // phantom failures. `npm run test:e2e` is their runner.
    exclude: ['node_modules', '.next', 'coverage', 'tests/e2e'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
