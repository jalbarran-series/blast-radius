import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classify } from './classify';

// Engine tests run against a generic fixture config — NOT any real repo's
// config. Consumers scaffold their own from templates/config.yml.
const cfgPath = `${__dirname}/__fixtures__/config.fixture.yml`;

describe('classify', () => {
  it('docs-only → tier 0', () => {
    expect(classify(['docs/foo.md'], { cfgPath }).tier).toBe(0);
  });

  it('asset png + doc → tier 0 (inert by extension)', () => {
    expect(classify(['docs/feature.md', 'src/assets/Home.png'], { cfgPath }).tier).toBe(0);
  });

  it('internal .plans doc → tier 0 (auto-merge)', () => {
    expect(classify(['.plans/some-plan.md'], { cfgPath, addedOnly: true }).tier).toBe(0);
  });

  it('add-only new isolated source dir → tier 0', () => {
    const r = classify(['src/feature/engine.ts', 'src/feature/sprites.ts'], { cfgPath, addedOnly: true });
    expect(r.tier).toBe(0);
  });

  it('add-only new auto-reachable migration → stays tier 3', () => {
    expect(classify(['migrations/009-foo.ts'], { cfgPath, addedOnly: true }).tier).toBe(3);
  });

  it('MODIFIED existing source → not add-only → tier 2', () => {
    expect(classify(['src/lib/foo.ts'], { cfgPath, addedOnly: false }).tier).toBe(2);
  });

  it('shared source, not flag-contained → tier 2', () => {
    expect(classify(['src/hooks/useThing.ts'], { cfgPath, flagContained: false }).tier).toBe(2);
  });

  it('flag-contained shared addition → capped at tier 1', () => {
    expect(classify(['src/hooks/useThing.ts'], { cfgPath, flagContained: true }).tier).toBe(1);
  });

  it('unknown path → default tier 2 (not auto-mergeable tier 1)', () => {
    expect(classify(['vite.config.ts'], { cfgPath, flagContained: false }).tier).toBe(2);
  });

  it('auth path → tier 3', () => {
    const r = classify(['src/auth/session.ts'], { cfgPath });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('session.ts');
  });

  it('payment-matching path + public package entrypoint → tier 3', () => {
    expect(classify(['src/billing/payment.ts'], { cfgPath }).tier).toBe(3);
    expect(classify(['packages/core/src/index.ts'], { cfgPath }).tier).toBe(3);
  });

  it('docs + auth mixed → tier 3 (max), reason names auth file', () => {
    const r = classify(['docs/x.md', 'src/auth/session.ts'], { cfgPath });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('session.ts');
  });

  it('flag-cap does NOT lower a tier-3 file', () => {
    expect(classify(['src/auth/session.ts'], { cfgPath, flagContained: true }).tier).toBe(3);
  });

  it('content/sentinel escalation overrides add-only lowering → tier 3', () => {
    const r = classify(['src/feature/engine.ts'], {
      cfgPath,
      addedOnly: true,
      escalation: { tier: 3, reasons: ['blast-radius:t3 marker touched in engine.ts'] },
    });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('blast-radius:t3');
  });

  it('content escalation overrides flag-cap → tier 3', () => {
    const r = classify(['src/feature/engine.ts'], {
      cfgPath,
      flagContained: true,
      escalation: { tier: 3, reasons: ['secret-handling rule matched'] },
    });
    expect(r.tier).toBe(3);
  });

  it('self-protect floor: classifier/config edits are tier 3 even with a WEAKENED config', () => {
    const weak = join(tmpdir(), `weak-blast-${Date.now()}.yml`);
    writeFileSync(weak, [
      'tiers:',
      '  "0":',
      '    - ".github/**"',
      'default_tier: 0',
      'generated: []',
      'inert_asset_extensions: []',
      'auto_reachable: []',
      'escalations: []',
      'sentinel: { token: "x", region_start: "y", region_end: "z" }',
    ].join('\n'));
    const r = classify(['.github/blast-radius/config.yml'], { cfgPath: weak, addedOnly: true });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('self-protected');
  });

  it('workflow change → tier 3 by default (no exemption)', () => {
    const r = classify(['.github/workflows/deploy.yml'], { cfgPath, addedOnly: false });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('deploy.yml');
  });

  it('inert workflow change → tier 2 (exempt from self-protect floor)', () => {
    const r = classify(['.github/workflows/deploy.yml'], {
      cfgPath,
      inertWorkflows: ['.github/workflows/deploy.yml'],
    });
    expect(r.tier).toBe(2);
    expect(r.reasons.join(' ')).toContain('inert');
    expect(r.reasons.join(' ')).not.toContain('self-protected');
  });

  it('inert workflow + a tier-3 source file → still tier 3 (exemption is per-file)', () => {
    const r = classify(
      ['.github/workflows/deploy.yml', 'src/auth/session.ts'],
      { cfgPath, inertWorkflows: ['.github/workflows/deploy.yml'] },
    );
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('session.ts');
    expect(r.reasons.join(' ')).toContain('inert');
  });

  it('inertWorkflows cannot exempt the classifier/config — floor holds under a WEAKENED config', () => {
    const weak = join(tmpdir(), `weak-inert-${Date.now()}.yml`);
    writeFileSync(weak, [
      'tiers:',
      '  "0":',
      '    - ".github/**"',
      'default_tier: 0',
      'generated: []',
      'inert_asset_extensions: []',
      'auto_reachable: []',
      'escalations: []',
      'sentinel: { token: "x", region_start: "y", region_end: "z" }',
    ].join('\n'));
    const r = classify(['.github/blast-radius/config.yml'], {
      cfgPath: weak,
      inertWorkflows: ['.github/blast-radius/config.yml'],
    });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('self-protected');
  });

  it('self-protect floor covers the AI-review prompt even under a WEAKENED config', () => {
    const weak = join(tmpdir(), `weak-prompt-${Date.now()}.yml`);
    writeFileSync(weak, [
      'tiers:',
      '  "0":',
      '    - "**/*.md"',
      '    - ".github/**"',
      'default_tier: 0',
      'generated: []',
      'inert_asset_extensions: []',
      'auto_reachable: []',
      'escalations: []',
      'sentinel: { token: "x", region_start: "y", region_end: "z" }',
    ].join('\n'));
    const r = classify(['.github/prompts/ai-review.md'], { cfgPath: weak, addedOnly: true });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('self-protected');
  });
});
