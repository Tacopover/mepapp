import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve @mepapp/platform to its source so the contract suite and the store share one StoreConflictError class.
export default defineConfig({
  resolve: {
    alias: {
      '@mepapp/platform': fileURLToPath(new URL('../platform/src/index.ts', import.meta.url)),
    },
  },
});
