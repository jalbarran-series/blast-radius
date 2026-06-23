/**
 * Dry-run the auto-assign decision LOCALLY — without waiting for the
 * workflow_run trigger (which only fires once the workflow is on the default
 * branch). Mirrors bot-auto-assign-pr.yml: same tier→pick logic, same OOO skip,
 * same author overrides. The Tier-3 owners are resolved from
 * `.github/blast-radius/owners` via the shared `tier3Assignee` resolver. When a
 * single owner is eligible this is the exact pick; when several are, the live
 * workflow load-balances across them (least 24h assigned-PR load, GitHub
 * suggested reviewer breaks a tie) — which needs live data, so this dry-run
 * lists the eligible set instead of guessing the winner.
 *
 * Usage (from .github/blast-radius/):
 *   npm run assign -- --pr 2062
 *   npm run assign -- --files client/contexts/AuthContext.tsx,client/foo.ts --author cantimary
 *   npm run assign -- --files server/cloud-run/src/x.payments.ts --author jruis --tier 3
 *
 * --pr mode reads files/author/assignees via `gh` and the tier from the live
 * `blast-radius` status. --files mode is fully offline (tier from the path-based
 * classifier — no add-only/flag/escalation context, so pass --tier to override).
 * OOO is read from the AUTOASSIGN_POOL env var (same JSON the workflow uses).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { classify } from './classify';
import { tier3Assignee } from './codeowners';

// Mirror of bot-auto-assign-pr.yml constants — keep in parity.
const AUTHOR_OVERRIDES: Record<string, string> = {
  'run-factory-bot[bot]': 'jruis',
  'series-percy[bot]': 'series-phil',
};
const FALLBACK_POOL = ['jruis', 'cantimary', 'paullpp', 'AntonioSeries', 'jhusting-series', 'jalbarran-series'];

interface PoolEntry { login: string; pausedUntil?: string; reason?: string }

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function parsePool(): { pool: string[]; isPaused: (login: string) => boolean } {
  const today = new Date().toISOString().slice(0, 10);
  let cfg: PoolEntry[] = [];
  try {
    cfg = JSON.parse(process.env.AUTOASSIGN_POOL || '[]');
  } catch (err) {
    process.stderr.write(`AUTOASSIGN_POOL parse failed (${String(err)}); using fallback pool.\n`);
  }
  const isPaused = (login: string): boolean =>
    Array.isArray(cfg) && cfg.some((e) =>
      e.login && e.login.toLowerCase() === login.toLowerCase() && !!e.pausedUntil && e.pausedUntil >= today);
  const pool = Array.isArray(cfg) && cfg.length
    ? cfg.filter((e) => !e.pausedUntil || e.pausedUntil < today).map((e) => e.login).filter(Boolean)
    : FALLBACK_POOL;
  return { pool: pool.length ? pool : FALLBACK_POOL, isPaused };
}

interface PrInfo { files: string[]; author: string; assignees: string[]; tier: number | null }

function fromPr(prNum: string): PrInfo {
  const pr = JSON.parse(gh(['pr', 'view', prNum, '--json', 'files,author,assignees,headRefOid']));
  const files: string[] = (pr.files || []).map((f: { path: string }) => f.path);
  const author: string = pr.author?.login || '';
  const assignees: string[] = (pr.assignees || []).map((a: { login: string }) => a.login);

  // Tier from the SHA-pinned `blast-radius` commit status — same source the gate
  // uses. statusCheckRollup omits the description, so read the statuses API
  // (newest-first); {owner}/{repo} resolve from the current repo.
  let tier: number | null = null;
  try {
    const statuses = JSON.parse(gh(['api', `repos/{owner}/{repo}/commits/${pr.headRefOid}/statuses`, '--paginate']));
    const blast = (Array.isArray(statuses) ? statuses : []).find(
      (s: { context?: string }) => s.context === 'blast-radius',
    );
    const tierMatch = blast?.description ? /tier ([0-3])/.exec(blast.description) : null;
    if (tierMatch) tier = Number(tierMatch[1]);
  } catch (err) {
    process.stderr.write(`blast-radius status lookup failed (${String(err)}); will use the classifier.\n`);
  }
  return { files, author, assignees, tier };
}

function main(): void {
  const ownersPath = arg('owners', `${import.meta.dirname}/owners`);
  const cfgPath = arg('cfg', `${import.meta.dirname}/config.yml`);
  const ownersText = readFileSync(ownersPath, 'utf8');
  const { pool, isPaused } = parsePool();

  let info: PrInfo;
  const prNum = arg('pr');
  if (prNum) {
    info = fromPr(prNum);
  } else {
    const files = arg('files').split(',').map((s) => s.trim()).filter(Boolean);
    if (!files.length) {
      process.stderr.write('Provide --pr N or --files a,b,c (with --author).\n');
      process.exit(2);
    }
    info = { files, author: arg('author'), assignees: [], tier: null };
  }

  // Tier: live blast-radius status (pr mode) → else path-based classifier.
  let tier = info.tier;
  let tierSource = 'blast-radius status';
  const tierArg = arg('tier');
  if (tierArg) {
    tier = Number(tierArg);
    tierSource = '--tier override';
  } else if (tier === null) {
    tier = classify(info.files, { cfgPath }).tier;
    tierSource = 'path-based classifier (no add-only/flag/escalation context)';
  }

  const author = info.author;
  const out: string[] = [];
  out.push(`PR files (${info.files.length}): ${info.files.join(', ') || '(none)'}`);
  out.push(`Author: ${author || '(unknown)'}`);
  out.push(`Tier: ${tier}  [${tierSource}]`);
  if (info.assignees.length) {
    out.push(`Current assignees: ${info.assignees.join(', ')} → bot LEAVES AS-IS (never overrides). Below = what it WOULD pick if unassigned.`);
  }

  // ---- decide (mirrors the workflow) ----
  let pick: string | null = null;
  let why = '';
  const override = AUTHOR_OVERRIDES[author];
  if (override) {
    pick = override;
    why = `author override (${author} → ${override})`;
  } else if (tier !== null && tier < 2) {
    why = `tier ${tier}: no assignment (auto-merge / flag-dark path)`;
  } else if (tier === 3) {
    const res = tier3Assignee(info.files, ownersText, { author, isPaused });
    out.push(`Tier-3 owners (in order): [${res.ordered.join(', ') || 'none'}]`);
    out.push(`Tier-3 eligible (non-author, non-OOO): [${res.eligible.join(', ') || 'none'}]`);
    if (res.eligible.length === 1) {
      pick = res.eligible[0];
      why = 'Tier-3 owner (only one eligible on the matched owners line)';
    } else if (res.eligible.length > 1) {
      // The live workflow picks the least-loaded of these (GitHub suggested
      // reviewer breaks a tie); offline we can't read load, so just list them.
      why = `Tier-3 owners → load-balanced among [${res.eligible.join(', ')}] (suggested-reviewer tie-break; exact pick needs live load data)`;
    } else {
      const eligible = pool.filter((p) => p.toLowerCase() !== (author || '').toLowerCase() && !isPaused(p));
      why = `all owners author/OOO → load-balanced fallback among [${eligible.join(', ')}] (exact pick needs live load data)`;
    }
  } else {
    const eligible = pool.filter((p) => p.toLowerCase() !== (author || '').toLowerCase() && !isPaused(p));
    why = `tier 2: load-balanced pool member among [${eligible.join(', ')}] (exact pick needs live load data)`;
  }

  out.push('');
  out.push(pick ? `→ Would assign: ${pick}  (${why})` : `→ No single assignee: ${why}`);
  process.stdout.write(out.join('\n') + '\n');
}

main();
