/**
 * CI guard: fail if any entry in `.github/blast-radius/owners` does NOT classify
 * Tier 3 via config.yml (an inert "orphan owner" — see ownersConfig.ts). Run by
 * bot-blast-radius against the PR-head copies of both files.
 *
 * Usage:
 *   tsx checkOwnersConfig.ts [--owners path] [--cfg path]
 */
import { readFileSync } from 'node:fs';
import { orphanOwners } from './ownersConfig';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main(): void {
  const ownersPath = arg('owners', `${import.meta.dirname}/owners`);
  const cfgPath = arg('cfg', `${import.meta.dirname}/config.yml`);
  const orphans = orphanOwners(readFileSync(ownersPath, 'utf8'), cfgPath);
  if (orphans.length) {
    process.stderr.write('Orphan owners — listed in owners but NOT classified Tier 3 by config.yml:\n');
    for (const o of orphans) {
      process.stderr.write(`  ${o.pattern}  (sample "${o.sample}" → tier ${o.tier})\n`);
    }
    process.stderr.write('An owner is only consulted at Tier 3, so these entries are inert.\n');
    process.stderr.write('Fix: add a matching glob to config.yml tiers."3", or remove the owners entry.\n');
    process.exit(1);
  }
  process.stdout.write('OK: every owners path classifies Tier 3.\n');
}

main();
