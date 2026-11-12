import { defineConfig } from 'vitest/config';

// Run from the repository root so that the Vitest cache lands in the root
// node_modules (a symlink to node_modules.nosync, which iCloud does not sync).
export default defineConfig({
  test: {
    include: ['*/tests/**/*.test.ts', '*/tests/**/*.test.tsx', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});
