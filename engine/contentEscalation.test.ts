import { describe, expect, it } from 'vitest';
import { contentEscalations } from './contentEscalation';
import type { BlastConfig } from './classify';

const cfg = {
  escalations: [
    {
      name: 'bootstrap-order',
      reason: 'init order',
      paths: ['server/cloud-run/src/**'],
      pattern: 'INIT_ORDER',
      tier: 3,
    },
  ],
  sentinel: {
    token: 'blast-radius:t3',
    region_start: 'blast-radius:t3:start',
    region_end: 'blast-radius:t3:end',
    tier: 3,
  },
} as unknown as BlastConfig;

const diff = (body: string) => body.trimStart();

describe('contentEscalations', () => {
  it('central content rule matches a changed line → tier 3', () => {
    const d = diff(`
diff --git a/server/cloud-run/src/boot.ts b/server/cloud-run/src/boot.ts
--- a/server/cloud-run/src/boot.ts
+++ b/server/cloud-run/src/boot.ts
@@ -1,2 +1,3 @@
+const INIT_ORDER = ['db', 'cache'];
`);
    const r = contentEscalations({ diff: d, headFiles: {}, cfg });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('init order');
  });

  it('content rule respects path scope (no match outside paths)', () => {
    const d = diff(`
diff --git a/client/x.ts b/client/x.ts
--- a/client/x.ts
+++ b/client/x.ts
@@ -1 +1 @@
+const INIT_ORDER = 1;
`);
    expect(contentEscalations({ diff: d, headFiles: {}, cfg }).tier).toBe(0);
  });

  it('single-line sentinel touched → tier 3', () => {
    const d = diff(`
diff --git a/client/a.ts b/client/a.ts
--- a/client/a.ts
+++ b/client/a.ts
@@ -1 +1,2 @@
+startEngine(); // blast-radius:t3 reason: order-sensitive
`);
    expect(contentEscalations({ diff: d, headFiles: {}, cfg }).tier).toBe(3);
  });

  it('changed line inside a sentinel REGION → tier 3', () => {
    // head file has a guarded region on lines 2..4; the diff adds line 3.
    const head = [
      'init();',
      '// blast-radius:t3:start reason: boot sequence',
      'a(); b(); c();',
      '// blast-radius:t3:end',
    ].join('\n');
    const d = diff(`
diff --git a/client/boot.ts b/client/boot.ts
--- a/client/boot.ts
+++ b/client/boot.ts
@@ -3 +3 @@
+a(); b(); c(); d();
`);
    const r = contentEscalations({ diff: d, headFiles: { 'client/boot.ts': head }, cfg });
    expect(r.tier).toBe(3);
  });

  it('DELETION inside a sentinel region → tier 3 (not just additions)', () => {
    // Post-image still has the guarded region on lines 2..4; the diff only
    // DELETES a line inside it (no added line in range).
    const head = [
      'init();',
      '// blast-radius:t3:start reason: boot sequence',
      'keep();',
      '// blast-radius:t3:end',
    ].join('\n');
    const d = diff(`
diff --git a/client/boot.ts b/client/boot.ts
--- a/client/boot.ts
+++ b/client/boot.ts
@@ -2,4 +2,3 @@
 // blast-radius:t3:start reason: boot sequence
-drop();
 keep();
 // blast-radius:t3:end
`);
    const r = contentEscalations({ diff: d, headFiles: { 'client/boot.ts': head }, cfg });
    expect(r.tier).toBe(3);
  });

  it('DELETED file (+++ /dev/null) still matches a path-scoped rule under its real path', () => {
    const d = diff(`
diff --git a/server/cloud-run/src/boot.ts b/server/cloud-run/src/boot.ts
--- a/server/cloud-run/src/boot.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-const INIT_ORDER = ['db'];
-export {};
`);
    const r = contentEscalations({ diff: d, headFiles: {}, cfg });
    expect(r.tier).toBe(3);
    expect(r.reasons.join(' ')).toContain('init order');
  });

  it('DELETING a file that contains a sentinel region → tier 3 (markers in removed set)', () => {
    const d = diff(`
diff --git a/client/boot.ts b/client/boot.ts
--- a/client/boot.ts
+++ /dev/null
@@ -1,4 +0,0 @@
-init();
-// blast-radius:t3:start reason: boot sequence
-a(); b(); c();
-// blast-radius:t3:end
`);
    const r = contentEscalations({ diff: d, headFiles: {}, cfg });
    expect(r.tier).toBe(3);
  });

  it('no match → tier 0 (no escalation)', () => {
    const d = diff(`
diff --git a/client/a.ts b/client/a.ts
--- a/client/a.ts
+++ b/client/a.ts
@@ -1 +1 @@
+const x = 1;
`);
    expect(contentEscalations({ diff: d, headFiles: {}, cfg }).tier).toBe(0);
  });
});
