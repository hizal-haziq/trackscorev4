import {defineConfig, build} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const target = (process.env.TRACKSCORE_BUILD_TARGET || 'manager') as 'manager' | 'assessor' | 'vendor';
const isInitial = target === 'manager';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'react'),
  base: '/react/',
  publicDir: false,
  envDir: false,
  plugins: [
    react(),
    isInitial && {
      name: 'build-additional-targets',
      apply: 'build' as const,
      async closeBundle() {
        for (const nextTarget of ['assessor', 'vendor'] as const) {
          process.env.TRACKSCORE_BUILD_TARGET = nextTarget;
          try {
            await build({
              configFile: path.resolve(import.meta.dirname, 'vite.react.config.ts'),
              build: {
                emptyOutDir: false,
              },
            });
          } finally {
            delete process.env.TRACKSCORE_BUILD_TARGET;
          }
        }
      },
    },
  ].filter(Boolean),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/react'),
    emptyOutDir: isInitial,
    sourcemap: false,
    rollupOptions: {
      input: {
        [target]: path.resolve(
          import.meta.dirname,
          `react/${target}.html`
        ),
      },
    },
  },
});
