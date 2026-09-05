import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig(async (env) => {
  const baseConfig = typeof viteConfig === 'function' ? await viteConfig(env) : viteConfig;
  
  const merged = mergeConfig(baseConfig, {
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
  });

  if (merged.test) {
    merged.test.exclude = ['node_modules', 'dist', '.git', 'functions'];
    // mergeConfig concatenates arrays, so we must explicitly overwrite setupFiles
    // to prevent vitest.setup.ts (which uses jsdom 'window') from running in 'node'
    merged.test.setupFiles = ['./vitest.int.setup.ts'];
  }
  
  return merged;
});
