import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FRAMEWORK_ROOT = join(HERE, '..', '..');

// Compiled standalone bundles consumers run with zero install (deps inlined).
// The framework-only cli-classify.mjs is not shipped to consumers.
export const ENGINE_RUNTIME = [
  'classify.mjs',
  'ownersConfig.mjs',
  'checkOwnersConfig.mjs',
  'runClassify.mjs',
  'runAssign.mjs',
];

// Agent runtimes that get the `/blast-radius` skill. Framework-owned everywhere.
export const AGENT_SKILL_DIRS = ['.claude/skills', '.cursor/skills', '.agents/skills'];

const log = (s) => console.log(s);

function copyFile(src, dest, { overwrite }) {
  if (existsSync(dest) && !overwrite) {
    log(`  skip (exists)  ${dest}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  log(`  ${existsSync(dest) ? 'wrote' : 'wrote'}          ${dest}`);
}

// The compiled bundles must exist — build on demand if missing. Shared by
// install + update so neither ever scaffolds a stale/absent dist/engine.
export function ensureEngineBuilt() {
  const eng = join(FRAMEWORK_ROOT, 'dist', 'engine');
  if (!existsSync(join(eng, 'classify.mjs'))) {
    log('Building engine bundles (dist/engine missing)…');
    execFileSync('node', [join(FRAMEWORK_ROOT, 'scripts', 'build-engine.mjs')], { stdio: 'inherit' });
  }
  return eng;
}

// ── Framework-owned writers (always overwrite) ───────────────────────────────
// Single source of truth for "what the framework owns": install and update both
// call these so the two paths can never drift on which files get refreshed.

export function writeEngineRuntime(targetDir) {
  const br = join(targetDir, '.github', 'blast-radius');
  const eng = ensureEngineBuilt();
  for (const f of ENGINE_RUNTIME) copyFile(join(eng, f), join(br, f), { overwrite: true });
}

export function writeEnginePackageJson(targetDir) {
  const br = join(targetDir, '.github', 'blast-radius');
  const tpl = join(FRAMEWORK_ROOT, 'templates');
  copyFile(join(tpl, 'blast-radius.package.json'), join(br, 'package.json'), { overwrite: true });
}

export function writeSkill(targetDir) {
  const skillSrc = readFileSync(join(FRAMEWORK_ROOT, 'skill', 'SKILL.src.md'), 'utf8');
  const refDir = join(FRAMEWORK_ROOT, 'skill', 'reference');
  for (const dir of AGENT_SKILL_DIRS) {
    const skillDir = join(targetDir, dir, 'blast-radius');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), skillSrc);
    cpSync(refDir, join(skillDir, 'reference'), { recursive: true });
    log(`  wrote          ${join(targetDir, dir, 'blast-radius')}/`);
  }
}

export function scaffold(targetDir) {
  const br = join(targetDir, '.github', 'blast-radius');
  const tpl = join(FRAMEWORK_ROOT, 'templates');

  log(`Scaffolding blast-radius into ${targetDir}`);

  // 1. Engine runtime (compiled .mjs) — framework-owned, always overwrite.
  writeEngineRuntime(targetDir);

  // 2. Per-repo surface — never clobber once a repo owns it.
  copyFile(join(tpl, 'config.yml'), join(br, 'config.yml'), { overwrite: false });
  copyFile(join(tpl, 'owners'), join(br, 'owners'), { overwrite: false });
  copyFile(join(tpl, 'config.validate.test.ts'), join(br, 'config.validate.test.ts'), { overwrite: false });

  // 3. Engine package.json — framework-owned, overwrite.
  writeEnginePackageJson(targetDir);

  // 4. PR template — per-repo, don't clobber.
  copyFile(join(tpl, 'PULL_REQUEST_TEMPLATE.md'), join(targetDir, '.github', 'PULL_REQUEST_TEMPLATE.md'), {
    overwrite: false,
  });

  // 5. Bot workflows — per-repo (need secret/owner adaptation), don't clobber.
  const wfDir = join(tpl, 'workflows');
  for (const f of readdirSync(wfDir)) {
    copyFile(join(wfDir, f), join(targetDir, '.github', 'workflows', f), { overwrite: false });
  }

  // 6. Agent skill — framework-owned, installed into every agent dir (so the
  //    repo's Claude / Cursor / Codex+Pi agents all gain `/blast-radius`).
  writeSkill(targetDir);

  log('');
  log('Installed. Next:');
  log('  1. Run `/blast-radius init` in your agent to tailor config.yml + owners to THIS repo.');
  log(`  2. cd ${br} && npm install && npm test   # validate config + owners`);
  log('  3. Adapt .github/workflows/bot-*.yml (secrets, reviewer pool) before enabling.');
}
