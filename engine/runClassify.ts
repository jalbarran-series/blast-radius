/**
 * CLI wrapper around the pure classifier modules. Invoked by bot-blast-radius
 * and bot-ai-review workflows. Computes flag-containment, add-only, and
 * content/sentinel escalation from the working tree, then prints the classify
 * result as JSON.
 *
 * Usage:
 *   tsx runClassify.ts --files files.txt --diff diff.txt \
 *     --flag NEW_GAME --featureFlags client/constants/featureFlags.ts \
 *     [--cfg .github/blast-radius/config.yml] [--base origin/develop]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { classify, fileTier, loadConfig, matchAny } from './classify';
import { contentEscalations } from './contentEscalation';
import { isFlagContained } from './flagContainment';
import { inertWorkflowFiles } from './workflowInert';

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readLines(path: string): string[] {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Map of changed file -> git status letter (A/M/D/R...) for base...HEAD. */
function nameStatus(base: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = execFileSync('git', ['diff', '--name-status', `${base}...HEAD`], { encoding: 'utf8' });
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const status = parts[0][0]; // R100 -> R, etc.
      const path = parts[parts.length - 1]; // rename: last column is the new path
      out[path] = status;
    }
  } catch (err) {
    process.stderr.write(`name-status lookup failed (${String(err)}); treating as not add-only\n`);
  }
  return out;
}

function main(): void {
  const cfgPath = arg('cfg', `${import.meta.dirname}/config.yml`);
  const files = readLines(arg('files'));
  const diffText = arg('diff') && existsSync(arg('diff')) ? readFileSync(arg('diff'), 'utf8') : '';
  const flagName = arg('flag');
  const featureFlagsPath = arg('featureFlags', '');
  const base = arg('base', process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/develop');

  const cfg = loadConfig(cfgPath);
  const effective = files.filter((f) => !matchAny(f, cfg.generated));
  const status = nameStatus(base);
  const isAdded = (f: string): boolean => status[f] === 'A';

  // add-only: every effective (non-generated) file was newly added.
  const addedOnly = effective.length > 0 && effective.every(isAdded);

  // flag-containment (MUST 2 / MUST 10): declared flag wrapped + fallback not
  // hardcoded-on, every Tier-2 file newly added, AND every newly-added LIVE
  // (auto-reachable) Tier-2 file must itself reference the flag. The last clause
  // closes the gap where an unrelated live entry point (e.g. a new Expo Router
  // route) bundled into a flag-dark PR could ride the cap unguarded. Inert
  // (non-reachable) added files need not each reference the flag — they're dead
  // until wired, same as the add-only Tier-0 rule.
  const featureFlagsSource = existsSync(featureFlagsPath) ? readFileSync(featureFlagsPath, 'utf8') : '';
  const tier2Files = effective.filter((f) => fileTier(f, cfg) === 2);
  const fileReferencesFlag = (f: string): boolean =>
    existsSync(f) && isFlagContained({ flagName, diffText: readFileSync(f, 'utf8'), featureFlagsSource });
  const liveAddedTier2 = tier2Files.filter((f) => matchAny(f, cfg.auto_reachable));
  const flagContained =
    isFlagContained({ flagName, diffText, featureFlagsSource }) &&
    tier2Files.every(isAdded) &&
    liveAddedTier2.every(fileReferencesFlag);

  // head-image content of touched files (for region sentinels).
  const headFiles: Record<string, string> = {};
  for (const f of effective) {
    if (existsSync(f)) {
      try {
        headFiles[f] = readFileSync(f, 'utf8');
      } catch {
        /* unreadable; skip */
      }
    }
  }
  const escalation = contentEscalations({ diff: diffText, headFiles, cfg });

  // Workflow files whose diff is provably inert (var-forward / comment-only) —
  // exempted from the Tier-3 self-protect floor. Computed from base-ref config.
  const inertWorkflows = inertWorkflowFiles(diffText, cfg);

  const result = classify(files, { cfgPath, flagContained, addedOnly, escalation, inertWorkflows });
  process.stdout.write(
    JSON.stringify({ ...result, flagContained, addedOnly, escalationTier: escalation.tier, inertWorkflows }) + '\n',
  );
}

main();
