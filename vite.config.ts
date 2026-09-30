/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    // The processed-data tests read the full county dataset; on a busy or slow disk they need more than the 5 s default.
    testTimeout: 60000,
  },
});
