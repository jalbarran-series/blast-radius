import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FRAMEWORK_ROOT = join(HERE, '..', '..');

// Engine source files consumers need at runtime (no tests, no fixtures, no the
// framework-only cli-classify shim).
const ENGINE_RUNTIME = [
  'classify.ts',
  'codeowners.ts',
  'contentEscalation.ts',
  'flagContainment.ts',
  'workflowInert.ts',
  'ownersConfig.ts',
  'checkOwnersConfig.ts',
  'runClassify.ts',
  'runAssign.ts',
];

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

export function scaffold(targetDir) {
  const br = join(targetDir, '.github', 'blast-radius');
  const tpl = join(FRAMEWORK_ROOT, 'templates');
  const eng = join(FRAMEWORK_ROOT, 'engine');

  log(`Scaffolding blast-radius into ${targetDir}`);

  // 1. Engine runtime — framework-owned, always overwrite (keeps repos in sync).
  for (const f of ENGINE_RUNTIME) copyFile(join(eng, f), join(br, f), { overwrite: true });

  // 2. Per-repo surface — never clobber once a repo owns it.
  copyFile(join(tpl, 'config.yml'), join(br, 'config.yml'), { overwrite: false });
  copyFile(join(tpl, 'owners'), join(br, 'owners'), { overwrite: false });
  copyFile(join(tpl, 'config.validate.test.ts'), join(br, 'config.validate.test.ts'), { overwrite: false });

  // 3. Engine package.json — framework-owned, overwrite.
  copyFile(join(tpl, 'blast-radius.package.json'), join(br, 'package.json'), { overwrite: true });

  // 4. PR template — per-repo, don't clobber.
  copyFile(join(tpl, 'PULL_REQUEST_TEMPLATE.md'), join(targetDir, '.github', 'PULL_REQUEST_TEMPLATE.md'), {
    overwrite: false,
  });

  // 5. Bot workflows — per-repo (need secret/owner adaptation), don't clobber.
  const wfDir = join(tpl, 'workflows');
  for (const f of readdirSync(wfDir)) {
    copyFile(join(wfDir, f), join(targetDir, '.github', 'workflows', f), { overwrite: false });
  }

  // 6. Agent skill — framework-owned, overwrite. Strip the build-only `.src` note.
  const skillSrc = readFileSync(join(FRAMEWORK_ROOT, 'skill', 'SKILL.src.md'), 'utf8');
  const skillDest = join(targetDir, '.claude', 'skills', 'pr-blast-radius', 'SKILL.md');
  mkdirSync(dirname(skillDest), { recursive: true });
  writeFileSync(skillDest, skillSrc);
  log(`  wrote          ${skillDest}`);

  log('');
  log('Done. Next:');
  log(`  1. cd ${br} && npm install && npm test   # validate config + owners`);
  log('  2. Edit config.yml tiers + owners for THIS repo.');
  log('  3. Adapt .github/workflows/bot-*.yml (secrets, reviewer pool) before enabling.');
}
