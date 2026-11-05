/** Сборка и запуск тестов логики (TypeScript компилируется на лету через esbuild). */
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const outdir = await mkdtemp(join(tmpdir(), 'shuzu-tests-'));
const outfile = join(outdir, 'tests.cjs');

await build({
  entryPoints: ['scripts/tests/index.ts'],
  bundle: true,
  outfile,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'silent',
});

const require = createRequire(import.meta.url);
require(outfile);
