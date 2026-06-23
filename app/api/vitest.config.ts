import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Modules under test today; widen as coverage grows.
      include: [
        'src/lib/**/*.ts',
        'src/assistant/purposes.ts',
        'src/shared/text-moderation.ts',
      ],
      // Test files and the pure re-export barrel — no product logic to cover.
      exclude: ['**/*.test.ts', '**/*.spec.ts', 'src/lib/index.ts'],
    },
  },
});
