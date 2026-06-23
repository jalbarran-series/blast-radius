import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { minimatch } from 'minimatch';

export interface BlastConfig {
  tiers: Record<string, string[]>;
  default_tier: number;
  generated: string[];
  inert_asset_extensions: string[];
  auto_reachable: string[];
  escalations: EscalationRule[];
  sentinel: SentinelCfg;
  workflow_inert?: WorkflowInertCfg;
}

/** Allow/deny line patterns that decide when a `.github/workflows/**` change is
 *  inert enough to skip the Tier-3 self-protect floor. See `workflowInert.ts`. */
export interface WorkflowInertCfg {
  allow: string[];
  deny: string[];
}

export interface EscalationRule {
  name: string;
  reason: string;
  paths?: string[];
  pattern: string;
  tier?: number;
}

export interface SentinelCfg {
  token: string;
  region_start: string;
  region_end: string;
  tier?: number;
}

/** A content/sentinel escalation result (only ever RAISES the tier). */
export interface Escalation {
  tier: number;
  reasons: string[];
}

export interface ClassifyOptions {
  cfgPath: string;
  /**
   * True only when the caller (runClassify) has verified ALL of: declared flag
   * referenced via getFlag in the diff, fallback not hardcoded-on, and every
   * effective Tier-2 file is newly added. See MUST 2 / MUST 10.
   */
  flagContained?: boolean;
  /**
   * True when every effective file has git status `A` (add-only — no existing
   * file modified or deleted). Computed by runClassify from git name-status.
   * Drives the Tier-0 "doesn't touch existing code" escalator. See MUST 5.
   */
  addedOnly?: boolean;
  /**
   * Content/sentinel escalation computed by `contentEscalations()` (MUST 13).
   * Applied LAST and only ever raises the tier — it overrides add-only and
   * flag-cap lowering.
   */
  escalation?: Escalation | null;
  /**
   * Workflow files (`.github/workflows/**`) whose diff is provably inert,
   * computed by `inertWorkflowFiles()` from the base-ref allow/deny lists.
   * These are exempted from the `.github/workflows/**` Tier-3 glob AND the
   * self-protect floor, dropping to Tier 2 (shared infra). Non-workflow entries
   * are ignored here as defense-in-depth, so a buggy/hostile caller can never
   * exempt the classifier, its config, the prompts, or CODEOWNERS.
   */
  inertWorkflows?: string[];
}

export interface ClassifyResult {
  tier: 0 | 1 | 2 | 3;
  reasons: string[];
  effectiveFiles: string[];
}

export const matchAny = (file: string, globs: string[]): boolean =>
  globs.some((g) => minimatch(file, g, { dot: true }));

/**
 * Paths that gate the system itself. Floored to Tier 3 UNCONDITIONALLY (not via
 * config), so a PR cannot weaken `config.yml`, the classifier code, the
 * workflows, or CODEOWNERS to downgrade its own classification. Defense in depth
 * alongside running the classifier from the base ref. See SECURITY review.
 */
export const SELF_PROTECT_GLOBS = [
  '.github/blast-radius/**',
  '.github/workflows/**',
  '.github/prompts/**',
  'CODEOWNERS',
];

/** Tier assigned to a workflow change deemed inert (var-forward / comment-only).
 *  Shared infra, still reviewed — but off the Tier-3 owner/manual-merge gate. */
export const WORKFLOW_INERT_TIER = 2;

export const loadConfig = (cfgPath: string): BlastConfig =>
  parse(readFileSync(cfgPath, 'utf8')) as BlastConfig;

const isAsset = (file: string, cfg: BlastConfig): boolean =>
  cfg.inert_asset_extensions.some((ext) => file.toLowerCase().endsWith(ext));

export const fileTier = (file: string, cfg: BlastConfig): number => {
  // Non-source assets never execute → inert regardless of path.
  if (isAsset(file, cfg)) return 0;
  for (const tier of [3, 2, 0]) {
    if (matchAny(file, cfg.tiers[String(tier)] ?? [])) return tier;
  }
  return cfg.default_tier;
};

export function classify(changedFiles: string[], opts: ClassifyOptions): ClassifyResult {
  const cfg = loadConfig(opts.cfgPath);
  const reasons: string[] = [];

  const effectiveFiles = changedFiles.filter((f) => !matchAny(f, cfg.generated));

  // Inert workflow exemption. Restricted to `.github/workflows/**` (NOT the
  // classifier/config/prompts/CODEOWNERS) so the exemption can never weaken the
  // rules that govern classification — only a workflow whose diff is provably
  // inert (var-forward/comment-only, verified from the base ref) is eligible.
  const inertWorkflows = new Set(
    (opts.inertWorkflows ?? []).filter((f) => matchAny(f, ['.github/workflows/**'])),
  );

  let max = 0;
  let driver = '';
  for (const f of effectiveFiles) {
    const t = inertWorkflows.has(f) ? WORKFLOW_INERT_TIER : fileTier(f, cfg);
    if (t > max) {
      max = t;
      driver = f;
    }
  }
  if (driver) reasons.push(`tier ${max} from \`${driver}\``);
  if (inertWorkflows.size > 0) {
    const names = [...inertWorkflows].map((f) => `\`${f}\``).join(', ');
    reasons.push(`workflow change treated as inert (tier ${WORKFLOW_INERT_TIER}): ${names} — diff only forwards repo vars / comments`);
  }

  // Self-protect floor: any change to the classifier, its config, the
  // workflows, or CODEOWNERS is Tier 3 regardless of config — prevents a PR
  // from weakening the rules that govern itself. Inert workflow changes are
  // exempt (they cannot alter what a workflow executes; see `workflowInert.ts`).
  const selfProtect = effectiveFiles.find((f) => matchAny(f, SELF_PROTECT_GLOBS) && !inertWorkflows.has(f));
  if (selfProtect && max < 3) {
    max = 3;
    reasons.push(`floored to tier 3 (self-protected path: \`${selfProtect}\`)`);
  }

  // Add-only escalator (MUST 5c): a PR that only ADDS files, touches no
  // existing code, and adds nothing auto-reachable (file-based routes,
  // workflows, migrations) is inert → tier 0. The `max <= 2` guard keeps
  // Tier-3 additions (e.g. a new migration) at their tier.
  const touchesAutoReachable = effectiveFiles.some((f) => matchAny(f, cfg.auto_reachable));
  if (opts.addedOnly && max <= 2 && !touchesAutoReachable) {
    max = 0;
    reasons.push('tier 0 (add-only: no existing code touched, nothing auto-reachable added)');
  }

  // Flag-cap — only applies to max == 2, so a Tier-3 file is never lowered.
  // `flagContained` is pre-verified by the caller (declared flag in diff +
  // fallback not hardcoded-on + every Tier-2 file newly added).
  if (opts.flagContained && max === 2) {
    max = 1;
    reasons.push('capped at tier 1 (isolated flag-dark addition, no shared-code edits)');
  }

  // Content/sentinel escalation (MUST 13) — applied LAST and raise-only, so it
  // overrides add-only / flag-cap lowering.
  if (opts.escalation && opts.escalation.tier > max) {
    max = opts.escalation.tier;
    reasons.push(...opts.escalation.reasons);
  }

  return { tier: max as ClassifyResult['tier'], reasons, effectiveFiles };
}
