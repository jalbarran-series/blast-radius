// Repo-owned validation of THIS repo's blast-radius config + owners.
// Scaffolded by `blast-radius init`. Unlike the engine's own tests (which use
// fixtures), this one runs against the real config.yml / owners in this folder,
// so it fails CI if you add an owner on a non-Tier-3 path or break the config.
//
// Add your own assertions below — e.g. "our auth path must classify Tier 3".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify } from './classify.mjs';
import { orphanOwners } from './ownersConfig.mjs';

const cfgPath = `${__dirname}/config.yml`;

describe('blast-radius config (this repo)', () => {
  it('config.yml loads and classifies a known path', () => {
    // A docs file must be Tier 0; if this throws, the YAML is broken.
    expect(classify(['README.md'], { cfgPath }).tier).toBe(0);
  });

  it('every owner entry classifies Tier 3 (no orphan owners)', () => {
    const ownersText = readFileSync(`${__dirname}/owners`, 'utf8');
    const orphans = orphanOwners(ownersText, cfgPath);
    expect(orphans, `orphan owners (owned but not Tier 3): ${JSON.stringify(orphans)}`).toEqual([]);
  });

  // EXAMPLE — uncomment and adapt to lock your sensitive paths to Tier 3:
  // it('our auth funnel is Tier 3', () => {
  //   expect(classify(['src/auth/session.ts'], { cfgPath }).tier).toBe(3);
  // });
});
