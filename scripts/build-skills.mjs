#!/usr/bin/env node
// Build the single source skill (skill/SKILL.src.md + skill/reference/) into each
// agent runtime's skill dir, plus a portable dist/ bundle. Mirrors impeccable's
// cross-provider sync, minus the site/zip/extension machinery.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_NAME = 'blast-radius';

// Provider dir → where its skills live. Add a provider by adding a row.
const PROVIDERS = [
  { provider: 'Claude Code', dir: '.claude/skills' },
  { provider: 'Cursor', dir: '.cursor/skills' },
  { provider: 'Codex / Pi', dir: '.agents/skills' },
];

const src = readFileSync(join(ROOT, 'skill', 'SKILL.src.md'), 'utf8');
const refDir = join(ROOT, 'skill', 'reference');

function emit(baseDir) {
  const dest = join(ROOT, baseDir, SKILL_NAME);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'SKILL.md'), src);
  cpSync(refDir, join(dest, 'reference'), { recursive: true });
  return join(baseDir, SKILL_NAME);
}

console.log(`Building skill "${SKILL_NAME}" from skill/SKILL.src.md\n`);
for (const { provider, dir } of PROVIDERS) {
  console.log(`  ✓ ${provider.padEnd(14)} → ${emit(dir)}/`);
}
// Portable bundle for `npm pack` / manual install.
console.log(`  ✓ ${'dist'.padEnd(14)} → ${emit('dist/skills')}/`);
console.log('\nDone.');
