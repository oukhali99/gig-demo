/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Pin the API base to empty so request URLs are deterministic paths,
    // independent of any .env present in the workspace.
    env: { VITE_API_URL: '' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Only the code under test today; widen as more modules get covered.
      include: ['src/api.ts'],
    },
  },
});
