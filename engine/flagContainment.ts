export interface FlagCheckInput {
  flagName: string;
  /** Concatenated unified diff (added lines) of the PR. */
  diffText: string;
  /** Current contents of client/constants/featureFlags.ts. */
  featureFlagsSource: string;
}

/**
 * A flag-gated change is "dark" (cappable to Tier 1) ONLY when the flag is
 * provably OFF in prod. We FAIL SAFE: a flag is dark only when it is either
 *   (a) entirely absent from featureFlags.ts (missing → off), OR
 *   (b) assigned exactly `false` (`KEY: false` / `featureFlags['KEY'] = false`).
 * Any other appearance — `= true`, an env-derived default
 * (`= process.env.X !== 'true'`, `= __DEV__ || …`), or membership in an
 * `availableFlags`/`techLaunchFlags`-style array that a `forEach` loop turns on
 * — is treated as POSSIBLY ON, so we do NOT cap. This errs toward Tier 2
 * (more review), never toward wrongly capping live code to Tier 1.
 */
export function isFlagContained({ flagName, diffText, featureFlagsSource }: FlagCheckInput): boolean {
  if (!flagName) return false;
  const esc = escape(flagName);

  const referenced = new RegExp(`(getFlag|checkGate)\\s*\\([^)]*['"\`]${esc}['"\`]`).test(diffText);
  if (!referenced) return false;

  const src = featureFlagsSource;
  const wb = `\\b${esc}\\b`;

  // Assigned/keyed to a non-`false` value (`: true`, `= true`, `= <expr>`).
  const assignedTruthy = new RegExp(`${wb}['"\`]?\\s*\\]?\\s*[:=]\\s*(?!false\\b)\\S`).test(src);
  // Listed as a quoted array element (a loop sets every listed flag on).
  const inArray =
    new RegExp(`['"\`]${esc}['"\`]\\s*,`).test(src) ||
    new RegExp(`,\\s*['"\`]${esc}['"\`]`).test(src);

  if (assignedTruthy || inArray) return false; // possibly ON → don't cap
  return true; // absent, or only ever assigned `false` → off → dark
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
