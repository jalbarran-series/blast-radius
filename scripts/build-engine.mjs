#!/usr/bin/env node
// Compile the TypeScript engine into standalone ESM bundles (deps bundled in),
// so a consumer repo runs `node runClassify.mjs` with ZERO install. Output →
// dist/engine/. The library bundles (classify, ownersConfig) carry no shebang;
// the CLI entrypoints do, so they're directly executable.
import { build } from 'esbuild';
import { chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENG = join(ROOT, 'engine');
const OUT = join(ROOT, 'dist', 'engine');

const LIB = ['classify', 'ownersConfig'];
const BIN = ['runClassify', 'runAssign', 'checkOwnersConfig', 'cli-classify'];

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outdir: OUT,
  outExtension: { '.js': '.mjs' },
  logLevel: 'info',
};

await build({ ...common, entryPoints: LIB.map((n) => join(ENG, `${n}.ts`)) });
await build({
  ...common,
  entryPoints: BIN.map((n) => join(ENG, `${n}.ts`)),
  banner: { js: '#!/usr/bin/env node' },
});

for (const n of BIN) chmodSync(join(OUT, `${n}.mjs`), 0o755);
console.log(`\n✓ Built ${LIB.length + BIN.length} bundles → dist/engine/*.mjs (deps bundled in)`);
