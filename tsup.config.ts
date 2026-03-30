import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  sourcemap: true,
  dts: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
});
