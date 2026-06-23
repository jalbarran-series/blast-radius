import { describe, expect, it } from 'vitest';
import { codeownerApprovalMet, ownersFor, parseCodeowners, patternToRegExp, tier3Assignee } from './codeowners';

const CODEOWNERS = [
  '# comment',
  '/.github/workflows/                                   @paullpp',
  '/.github/blast-radius/                                @paullpp',
  '/packages/sdk/src/**/index.ts                         @series-phil',
  '/server/cloud-run/src/**/*auth*                        @cantimary',
  '/server/cloud-run/src/**/*payments*                    @Zee-Series-AI',
].join('\n');

// Ordered owners (primary + backups), as in `.github/blast-radius/owners`.
const OWNERS = [
  '/client/contexts/AuthContext.tsx                      @paullpp @cantimary @jruis',
  '/server/cloud-run/src/**/*payments*                    @Zee-Series-AI @series-phil @jruis',
].join('\n');

describe('parseCodeowners', () => {
  it('skips comments and blank lines, keeps pattern + owners', () => {
    const rules = parseCodeowners(CODEOWNERS);
    expect(rules).toHaveLength(5);
    expect(rules[0]).toEqual({ pattern: '/.github/workflows/', owners: ['@paullpp'] });
  });
});

describe('patternToRegExp', () => {
  it('trailing-slash subtree matches nested files', () => {
    expect(patternToRegExp('/.github/workflows/').test('.github/workflows/ci.yml')).toBe(true);
  });
  it('`*` does not span separators; `**` does', () => {
    expect(patternToRegExp('/a/*.ts').test('a/b/c.ts')).toBe(false);
    expect(patternToRegExp('/a/**/x.ts').test('a/b/c/x.ts')).toBe(true);
  });
  it('`**/` matches zero directories', () => {
    expect(patternToRegExp('/packages/sdk/src/**/index.ts').test('packages/sdk/src/index.ts')).toBe(true);
  });
  it('non-anchored pattern matches at any depth', () => {
    expect(patternToRegExp('*payments*').test('server/cloud-run/src/services/payments.service.ts')).toBe(true);
  });
});

describe('ownersFor (last match wins)', () => {
  it('payments rule beats the broad auth glob for a payments file', () => {
    const rules = parseCodeowners(CODEOWNERS);
    expect(ownersFor('server/cloud-run/src/services/payments.service.ts', rules)).toEqual(['@Zee-Series-AI']);
  });
  it('auth file routes to cantimary', () => {
    const rules = parseCodeowners(CODEOWNERS);
    expect(ownersFor('server/cloud-run/src/middleware/authToken.ts', rules)).toEqual(['@cantimary']);
  });
  it('unowned file → no owners', () => {
    const rules = parseCodeowners(CODEOWNERS);
    expect(ownersFor('client/components/Button.tsx', rules)).toEqual([]);
  });
});

describe('codeownerApprovalMet', () => {
  it('owner approval satisfies the gate', () => {
    const r = codeownerApprovalMet(
      ['server/cloud-run/src/services/payments.service.ts'],
      CODEOWNERS,
      ['Zee-Series-AI'],
    );
    expect(r.met).toBe(true);
  });

  it('REGRESSION: non-owner approval does NOT satisfy the gate', () => {
    const r = codeownerApprovalMet(
      ['server/cloud-run/src/services/payments.service.ts'],
      CODEOWNERS,
      ['some-other-dev'],
    );
    expect(r.met).toBe(false);
    expect(r.missing).toContain('server/cloud-run/src/services/payments.service.ts');
  });

  it('login match is case-insensitive and @-insensitive', () => {
    const r = codeownerApprovalMet(['.github/workflows/x.yml'], CODEOWNERS, ['PaulLpp']);
    expect(r.met).toBe(true);
  });

  it('multiple owned files need each owner to approve', () => {
    const files = [
      'server/cloud-run/src/middleware/authToken.ts', // @cantimary
      'server/cloud-run/src/services/payments.service.ts', // @Zee-Series-AI
    ];
    expect(codeownerApprovalMet(files, CODEOWNERS, ['cantimary']).met).toBe(false);
    expect(codeownerApprovalMet(files, CODEOWNERS, ['cantimary', 'Zee-Series-AI']).met).toBe(true);
  });

  it('unowned files are not gated', () => {
    const r = codeownerApprovalMet(['client/components/Button.tsx'], CODEOWNERS, []);
    expect(r.met).toBe(true);
  });
});

describe('tier3Assignee', () => {
  it('picks the primary owner when available', () => {
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'someone-else' });
    expect(r.ordered).toEqual(['paullpp', 'cantimary', 'jruis']);
    expect(r.pick).toBe('paullpp');
  });

  it('skips the author to the next owner (backup covers a primary-authored PR)', () => {
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'paullpp' });
    expect(r.pick).toBe('cantimary');
  });

  it('skips paused (OOO) owners to the next backup', () => {
    const isPaused = (l: string): boolean => l === 'paullpp' || l === 'cantimary';
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'someone-else', isPaused });
    expect(r.pick).toBe('jruis');
  });

  it('returns null when every owner is author/OOO (→ load-balanced fallback)', () => {
    const isPaused = (l: string): boolean => l === 'cantimary' || l === 'jruis';
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'paullpp', isPaused });
    expect(r.pick).toBeNull();
  });

  it('last-match-wins picks the payments owners for a payments file', () => {
    const r = tier3Assignee(['server/cloud-run/src/services/payments.service.ts'], OWNERS, { author: 'x' });
    expect(r.pick).toBe('zee-series-ai');
  });

  // The load-balanced PICK + suggested-reviewer tie-break live inlined in
  // bot-auto-assign-pr.yml (unreachable from vitest); these cover only the shared
  // `eligible` set the workflow balances over. Pick is dry-run-checked via runAssign.ts.
  it('exposes the eligible owners (non-author, non-OOO) in order for load-balancing', () => {
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'someone-else' });
    expect(r.eligible).toEqual(['paullpp', 'cantimary', 'jruis']);
  });

  it('eligible drops the author and paused owners but keeps order', () => {
    const isPaused = (l: string): boolean => l === 'cantimary';
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'paullpp', isPaused });
    expect(r.eligible).toEqual(['jruis']);
    expect(r.pick).toBe('jruis');
  });

  it('eligible is empty (→ load-balanced pool fallback) when every owner is author/OOO', () => {
    const isPaused = (l: string): boolean => l === 'cantimary' || l === 'jruis';
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'paullpp', isPaused });
    expect(r.eligible).toEqual([]);
    expect(r.pick).toBeNull();
  });
});
