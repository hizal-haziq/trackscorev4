import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'react'),
  base: '/react/',
  publicDir: false,
  envDir: false,
  plugins: [react()],
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/react'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {input: path.resolve(import.meta.dirname, 'react/manager.html')},
  },
});
