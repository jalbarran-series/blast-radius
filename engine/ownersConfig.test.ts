import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { orphanOwners, sampleFileFor } from './ownersConfig';

const cfgPath = `${__dirname}/__fixtures__/config.fixture.yml`;

describe('sampleFileFor', () => {
  it('expands CODEOWNERS-syntax globs to a concrete path', () => {
    expect(sampleFileFor('/.github/workflows/')).toBe('.github/workflows/x');
    expect(sampleFileFor('/CODEOWNERS')).toBe('CODEOWNERS');
    expect(sampleFileFor('/packages/sdk/src/**/index.ts')).toBe('packages/sdk/src/x/index.ts');
    expect(sampleFileFor('/server/cloud-run/src/**/*auth*')).toBe('server/cloud-run/src/x/xauthx');
  });
});

describe('owners ⊆ config tiers."3" (no orphan owners)', () => {
  // Ownership is only consulted at Tier 3 — an owner on a path that classifies
  // lower is inert. This locks the real files together so they can't drift.
  it('every entry in the owners fixture classifies Tier 3', () => {
    const ownersText = readFileSync(`${__dirname}/__fixtures__/owners.fixture`, 'utf8');
    const orphans = orphanOwners(ownersText, cfgPath);
    expect(orphans, `orphan owners (have an owner but don't classify Tier 3): ${JSON.stringify(orphans)}`).toEqual([]);
  });

  it('catches an orphan: an owned path that config does not make Tier 3', () => {
    const orphans = orphanOwners('/client/components/Button.tsx   @someone\n', cfgPath);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].pattern).toBe('/client/components/Button.tsx');
    expect(orphans[0].tier).toBe(2);
  });
});
