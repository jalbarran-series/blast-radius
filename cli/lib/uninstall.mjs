import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_SKILL_DIRS, FRAMEWORK_ROOT } from './scaffold.mjs';

const log = (s) => console.log(s);

// Remove what blast-radius scaffolded into a repo. Destructive (it deletes the
// repo-owned config.yml + owners along with the engine), so it is DRY-RUN by
// default: it lists targets and only deletes when `apply` is true (`--yes`).
//
// What it removes:
//   - .github/blast-radius/            (engine .mjs + config.yml + owners + test)
//   - the named bot workflows we ship  (NOT every bot-*.yml — only ours)
//   - <agent>/skills/blast-radius/      (.claude / .cursor / .agents)
// What it leaves (shared/ambiguous — reported, not deleted):
//   - .github/PULL_REQUEST_TEMPLATE.md  (may predate or outlive blast-radius)
export function uninstall(targetDir, { apply = false } = {}) {
  const removals = [];

  const br = join(targetDir, '.github', 'blast-radius');
  if (existsSync(br)) removals.push(br);

  // Only the workflow filenames this framework ships — never a blanket bot-*.
  const wfNames = readdirSync(join(FRAMEWORK_ROOT, 'templates', 'workflows'));
  for (const f of wfNames) {
    const p = join(targetDir, '.github', 'workflows', f);
    if (existsSync(p)) removals.push(p);
  }

  for (const dir of AGENT_SKILL_DIRS) {
    const p = join(targetDir, dir, 'blast-radius');
    if (existsSync(p)) removals.push(p);
  }

  if (removals.length === 0) {
    log(`Nothing to remove — no blast-radius install found at ${targetDir}`);
    return;
  }

  log(`${apply ? 'Removing' : 'Would remove'} ${removals.length} path(s) from ${targetDir}:`);
  for (const p of removals) {
    log(`  ${apply ? 'removed     ' : '- '}${p}`);
    if (apply) rmSync(p, { recursive: true, force: true });
  }

  const pr = join(targetDir, '.github', 'PULL_REQUEST_TEMPLATE.md');
  if (existsSync(pr)) {
    log('');
    log(`Left ${pr} (shared/ambiguous — delete manually if blast-radius created it).`);
  }

  log('');
  if (apply) {
    log('Uninstalled. Your config.yml + owners were inside .github/blast-radius and are now gone.');
  } else {
    log('Dry run — nothing deleted. Re-run with `--yes` to remove.');
  }
}
