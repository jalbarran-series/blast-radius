/**
 * Minimal, dependency-free resolver for the Tier-3 owner routing table at
 * `.github/blast-radius/owners` (CODEOWNERS *syntax*, but not the magic
 * filename — see that file's header). Used to (a) enforce owner IDENTITY in the
 * merge gate (not just "any approval") and (b) pick the auto-assignee.
 * Dependency-free so the logic can be inlined into the high-frequency
 * merge-policy / auto-assign github-scripts without an npm install. Keep this
 * module and the two inlined copies in parity.
 *
 * v1 limitation: owner matching is by login. Team handles (@org/team) would
 * need org membership resolution; today every Tier-3 path routes to an
 * individual, so login matching is exact.
 */

export interface OwnerRule {
  pattern: string;
  owners: string[];
}

export function parseCodeowners(text: string): OwnerRule[] {
  const rules: OwnerRule[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern || owners.length === 0) continue;
    rules.push({ pattern, owners });
  }
  return rules;
}

// `**` spans separators; `*` does not; trailing `/` = subtree; leading `/` = root-anchored.
export function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.startsWith('/');
  let p = anchored ? pattern.slice(1) : pattern;
  if (p.endsWith('/')) p += '**';
  let body = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        body += '.*';
        i++;
        if (p[i + 1] === '/') i++;
      } else {
        body += '[^/]*';
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      body += `\\${c}`;
    } else {
      body += c;
    }
  }
  return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${body}$`);
}

export function ownersFor(file: string, rules: OwnerRule[]): string[] {
  let owners: string[] = []; // CODEOWNERS is LAST-match-wins
  for (const rule of rules) {
    if (patternToRegExp(rule.pattern).test(file)) owners = rule.owners;
  }
  return owners;
}

const normalizeOwner = (o: string): string => o.replace(/^@/, '').toLowerCase();

export function codeownerApprovalMet(
  changedFiles: string[],
  codeownersText: string,
  approverLogins: string[],
): { met: boolean; missing: string[] } {
  const rules = parseCodeowners(codeownersText);
  const approvers = new Set(approverLogins.map(normalizeOwner));
  const missing: string[] = [];
  for (const file of changedFiles) {
    const owners = ownersFor(file, rules).map(normalizeOwner);
    if (owners.length === 0) continue; // unowned → not gated
    if (!owners.some((o) => approvers.has(o))) missing.push(file);
  }
  return { met: missing.length === 0, missing };
}

/**
 * Resolve the Tier-3 owners for a PR. Returns three views of the owners of the
 * changed files (in owners-file order across files, primary-before-backup
 * within a line; team tokens @org/team skipped — login-only resolution):
 *   - `ordered`:  every distinct owner, used to test whether an existing
 *                 assignee owns a changed path.
 *   - `eligible`: `ordered` minus the PR author and paused (OOO) owners — the
 *                 set the auto-assigner LOAD-BALANCES across (any one of them
 *                 satisfies the merge gate, so the pick is free to balance).
 *   - `pick`:     `eligible[0]` (first eligible owner) as a deterministic hint;
 *                 `null` when every owner is out/author, which is the
 *                 auto-assigner's signal to fall back to the load-balanced pool.
 *                 The live workflow picks the LEAST-LOADED of `eligible` rather
 *                 than `pick` — this field is the offline/dry-run approximation.
 *
 * PARITY: the `ordered`/`eligible` computation in the inlined copy in
 * bot-auto-assign-pr.yml MUST match this; `pick` is the resolver's deterministic
 * hint and intentionally differs from the workflow's load-balanced pick. Tested
 * in codeowners.test.ts and dry-run via runAssign.ts.
 */
export function tier3Assignee(
  changedFiles: string[],
  ownersText: string,
  opts: { author: string; isPaused?: (login: string) => boolean },
): { pick: string | null; ordered: string[]; eligible: string[] } {
  const rules = parseCodeowners(ownersText);
  const author = normalizeOwner(opts.author);
  const isPaused = opts.isPaused ?? (() => false);
  const ordered: string[] = [];
  for (const file of changedFiles) {
    for (const owner of ownersFor(file, rules)) {
      const normalized = normalizeOwner(owner);
      if (normalized.includes('/')) continue; // team token — login-only resolution
      if (!ordered.includes(normalized)) ordered.push(normalized);
    }
  }
  const eligible = ordered.filter((o) => o !== author && !isPaused(o));
  const pick = eligible[0] ?? null;
  return { pick, ordered, eligible };
}
