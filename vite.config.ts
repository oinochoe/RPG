import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // supabase/tests/** are Deno tests (run with `npx deno test`, see HANDOFF.md), not vitest ones.
    exclude: ['node_modules/**', 'dist/**', 'supabase/tests/**'],
  },
});
