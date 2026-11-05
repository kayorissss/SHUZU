/** Сборка main-процесса и preload через esbuild. */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  external: ['electron'],
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
};

rmSync('dist/main', { recursive: true, force: true });

await build({
  ...common,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist/main/main.js',
});

await build({
  ...common,
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist/main/preload.js',
});

console.log('main-процесс собран в dist/main');
