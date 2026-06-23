import { minimatch } from 'minimatch';
import type { BlastConfig } from './classify';
import { parseChangedLines } from './contentEscalation';

const WORKFLOW_GLOB = '.github/workflows/**';

/**
 * Workflow files whose ENTIRE diff is provably inert: every changed line
 * (added or removed) matches an `allow` pattern and none matches a `deny`
 * pattern. Such a change cannot alter what a workflow executes (it only
 * forwards a repo/org variable, or touches comments/blank lines), so it is
 * exempted from the Tier-3 self-protect floor and treated as ordinary shared
 * infra (Tier 2) by `classify()`.
 *
 * SAFETY — why exempting a self-protected path here does NOT open a
 * self-downgrade hole:
 *   - `allow`/`deny` come from `cfg`, which the workflow loads from the TRUSTED
 *     base ref, so a PR cannot widen its own exemption.
 *   - `allow` is FULL-LINE anchored and authoritative: a line not matching any
 *     `allow` pattern makes the whole file non-inert. Appending `; curl … | sh`
 *     to an allowed `--set-env-vars` line breaks the anchor → non-inert → floor
 *     holds. `deny` is a backstop in case `allow` is later loosened.
 *   - Fail-closed: a workflow file with NO recognizable changed lines (e.g. a
 *     pure rename or mode change) is NOT inert and keeps the floor.
 *
 * Anything gate-relevant — `on:`, `permissions:`, `uses:`, a new/edited `run:`
 * step, `secrets.*` — fails the `allow` match (and/or hits `deny`), so it stays
 * Tier 3.
 */
export function inertWorkflowFiles(diff: string, cfg: BlastConfig): string[] {
  const rules = cfg.workflow_inert;
  if (!rules) return [];
  const allow = rules.allow.map((p) => new RegExp(p));
  const deny = rules.deny.map((p) => new RegExp(p));

  const linesByFile = new Map<string, string[]>();
  for (const { file, text } of parseChangedLines(diff)) {
    if (!minimatch(file, WORKFLOW_GLOB, { dot: true })) continue;
    const bucket = linesByFile.get(file);
    if (bucket) bucket.push(text);
    else linesByFile.set(file, [text]);
  }

  // Fail-closed: a workflow file with NO changed content lines (pure rename, mode
  // change, binary patch) never enters `linesByFile`, so it is absent from `inert`
  // and keeps the floor. Every bucket here has >=1 line by construction.
  const inert: string[] = [];
  for (const [file, lines] of linesByFile) {
    if (lines.some((l) => deny.some((re) => re.test(l)))) continue;
    if (lines.every((l) => allow.some((re) => re.test(l)))) inert.push(file);
  }
  return inert;
}
