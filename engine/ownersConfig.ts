/**
 * Drift guard between the owner routing table (.github/blast-radius/owners) and
 * the classifier config (config.yml).
 *
 * Ownership is only ever consulted for Tier-3 PRs (the gate's codeowner branch
 * and the auto-assign Tier-3 branch). So an owners entry whose files do NOT
 * classify Tier 3 is INERT — its owner is never assigned and never required. We
 * forbid that: every owners pattern must resolve to Tier 3 via config.yml.
 *
 * Checked by ownersConfig.test.ts and enforced in CI by bot-blast-radius
 * (checkOwnersConfig.ts).
 */
import { classify } from './classify';
import { parseCodeowners } from './codeowners';

/**
 * A representative file path that an owners pattern matches, used to ask the
 * classifier "what tier would a file here get?". Expands the CODEOWNERS-syntax
 * globs to a concrete path: leading `/` is the repo-root anchor, a trailing `/`
 * is a subtree, `**`/`*` become a literal segment.
 */
export function sampleFileFor(pattern: string): string {
  let p = pattern.replace(/^\//, '');
  if (p.endsWith('/')) p += '**';
  p = p.replace(/\*\*\//g, 'x/').replace(/\*\*/g, 'x').replace(/\*/g, 'x');
  if (p.endsWith('/')) p += 'x.ts';
  return p;
}

export interface OrphanOwner {
  pattern: string;
  sample: string;
  tier: number;
}

/** Owners patterns whose representative file does NOT classify Tier 3. */
export function orphanOwners(ownersText: string, cfgPath: string): OrphanOwner[] {
  const orphans: OrphanOwner[] = [];
  for (const rule of parseCodeowners(ownersText)) {
    const sample = sampleFileFor(rule.pattern);
    const tier = classify([sample], { cfgPath }).tier;
    if (tier !== 3) orphans.push({ pattern: rule.pattern, sample, tier });
  }
  return orphans;
}
