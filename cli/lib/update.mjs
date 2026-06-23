import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  FRAMEWORK_ROOT,
  ensureEngineBuilt,
  writeEnginePackageJson,
  writeEngineRuntime,
  writeSkill,
} from './scaffold.mjs';

const log = (s) => console.log(s);

// Vendored-but-evolving files: shipped by the framework AND adapted per repo
// (secrets, reviewer pool). We can't safely overwrite them, but consumers still
// need upstream changes. Rule per file:
//   missing            → write it (consumer never had it)
//   byte-identical     → skip (already current)
//   differs            → write `<file>.new` and report (consumer diffs+merges)
// We keep no stored original, so "differs" covers both an upstream change and a
// local edit — surfacing a `.new` either way is the safe, non-destructive call.
function reconcile(srcPath, destPath, drift) {
  if (!existsSync(destPath)) {
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, readFileSync(srcPath));
    log(`  wrote          ${destPath}`);
    return;
  }
  const src = readFileSync(srcPath);
  const dest = readFileSync(destPath);
  if (src.equals(dest)) {
    log(`  up to date     ${destPath}`);
    return;
  }
  const newPath = `${destPath}.new`;
  writeFileSync(newPath, src);
  drift.push(destPath);
  log(`  drift          ${destPath} → wrote ${newPath}`);
}

export function update(targetDir) {
  const br = join(targetDir, '.github', 'blast-radius');
  if (!existsSync(br)) {
    console.error(`✗ no blast-radius install at ${br} — run \`blast-radius install\` first.`);
    process.exit(1);
  }

  const tpl = join(FRAMEWORK_ROOT, 'templates');
  ensureEngineBuilt();

  log(`Updating blast-radius in ${targetDir}`);
  log('');
  log('Framework-owned (refreshed):');
  // Compiled engine + engine package.json + skill — same overwrite set as install.
  writeEngineRuntime(targetDir);
  writeEnginePackageJson(targetDir);
  writeSkill(targetDir);

  log('');
  log('Vendored (workflows + PR template):');
  const drift = [];
  const wfDir = join(tpl, 'workflows');
  for (const f of readdirSync(wfDir)) {
    reconcile(join(wfDir, f), join(targetDir, '.github', 'workflows', f), drift);
  }
  reconcile(
    join(tpl, 'PULL_REQUEST_TEMPLATE.md'),
    join(targetDir, '.github', 'PULL_REQUEST_TEMPLATE.md'),
    drift,
  );

  log('');
  if (drift.length === 0) {
    log('Up to date — workflows + PR template match the templates, nothing to merge.');
  } else {
    log(`${drift.length} file(s) changed upstream — review the .new copies:`);
    for (const d of drift) log(`  ${d}.new`);
    log('');
    log('Diff each against its current file, merge what you want, then delete the .new:');
    log(`  git diff --no-index ${drift[0]} ${drift[0]}.new`);
  }
  log('');
  log('Note: config.yml, owners, and config.validate.test.ts are yours — never touched by update.');
}
