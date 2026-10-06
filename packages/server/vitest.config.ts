import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Process entry points (listen / CLI wiring) are exercised by running the app, not by unit tests.
      exclude: ['src/index.ts', 'src/cli.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
