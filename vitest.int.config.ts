import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

const merged = mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.int.test.ts', 'tests/security/**/*.test.ts'],
    setupFiles: ['./vitest.int.setup.ts'],
    coverage: {
      enabled: false,
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  }
}));

merged.test.exclude = ['node_modules', 'dist', '.git', 'functions'];

export default merged;
