import { describe, expect, it } from 'vitest';
import { codeownerApprovalMet, ownersFor, parseCodeowners, patternToRegExp, tier3Assignee } from './codeowners';

const CODEOWNERS = [
  '# comment',
  '/.github/workflows/                                   @alice',
  '/.github/blast-radius/                                @alice',
  '/packages/sdk/src/**/index.ts                         @dave',
  '/server/cloud-run/src/**/*auth*                        @bob',
  '/server/cloud-run/src/**/*payments*                    @Payments-Team',
].join('\n');

// Ordered owners (primary + backups), as in `.github/blast-radius/owners`.
const OWNERS = [
  '/client/contexts/AuthContext.tsx                      @alice @bob @carol',
  '/server/cloud-run/src/**/*payments*                    @Payments-Team @dave @carol',
].join('\n');

describe('parseCodeowners', () => {
  it('skips comments and blank lines, keeps pattern + owners', () => {
    const rules = parseCodeowners(CODEOWNERS);
    expect(rules).toHaveLength(5);
    expect(rules[0]).toEqual({ pattern: '/.github/workflows/', owners: ['@alice'] });
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
    expect(ownersFor('server/cloud-run/src/services/payments.service.ts', rules)).toEqual(['@Payments-Team']);
  });
  it('auth file routes to bob', () => {
    const rules = parseCodeowners(CODEOWNERS);
    expect(ownersFor('server/cloud-run/src/middleware/authToken.ts', rules)).toEqual(['@bob']);
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
      ['Payments-Team'],
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
    const r = codeownerApprovalMet(['.github/workflows/x.yml'], CODEOWNERS, ['Alice']);
    expect(r.met).toBe(true);
  });

  it('multiple owned files need each owner to approve', () => {
    const files = [
      'server/cloud-run/src/middleware/authToken.ts', // @bob
      'server/cloud-run/src/services/payments.service.ts', // @Payments-Team
    ];
    expect(codeownerApprovalMet(files, CODEOWNERS, ['bob']).met).toBe(false);
    expect(codeownerApprovalMet(files, CODEOWNERS, ['bob', 'Payments-Team']).met).toBe(true);
  });

  it('unowned files are not gated', () => {
    const r = codeownerApprovalMet(['client/components/Button.tsx'], CODEOWNERS, []);
    expect(r.met).toBe(true);
  });
});

describe('tier3Assignee', () => {
  it('picks the primary owner when available', () => {
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'someone-else' });
    expect(r.ordered).toEqual(['alice', 'bob', 'carol']);
    expect(r.pick).toBe('alice');
  });

  it('skips the author to the next owner (backup covers a primary-authored PR)', () => {
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'alice' });
    expect(r.pick).toBe('bob');
  });

  it('skips paused (OOO) owners to the next backup', () => {
    const isPaused = (l: string): boolean => l === 'alice' || l === 'bob';
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'someone-else', isPaused });
    expect(r.pick).toBe('carol');
  });

  it('returns null when every owner is author/OOO (→ load-balanced fallback)', () => {
    const isPaused = (l: string): boolean => l === 'bob' || l === 'carol';
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'alice', isPaused });
    expect(r.pick).toBeNull();
  });

  it('last-match-wins picks the payments owners for a payments file', () => {
    const r = tier3Assignee(['server/cloud-run/src/services/payments.service.ts'], OWNERS, { author: 'x' });
    expect(r.pick).toBe('payments-team');
  });

  // The load-balanced PICK + suggested-reviewer tie-break live inlined in
  // bot-auto-assign-pr.yml (unreachable from vitest); these cover only the shared
  // `eligible` set the workflow balances over. Pick is dry-run-checked via runAssign.ts.
  it('exposes the eligible owners (non-author, non-OOO) in order for load-balancing', () => {
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'someone-else' });
    expect(r.eligible).toEqual(['alice', 'bob', 'carol']);
  });

  it('eligible drops the author and paused owners but keeps order', () => {
    const isPaused = (l: string): boolean => l === 'bob';
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'alice', isPaused });
    expect(r.eligible).toEqual(['carol']);
    expect(r.pick).toBe('carol');
  });

  it('eligible is empty (→ load-balanced pool fallback) when every owner is author/OOO', () => {
    const isPaused = (l: string): boolean => l === 'bob' || l === 'carol';
    const r = tier3Assignee(['client/contexts/AuthContext.tsx'], OWNERS, { author: 'alice', isPaused });
    expect(r.eligible).toEqual([]);
    expect(r.pick).toBeNull();
  });
});
