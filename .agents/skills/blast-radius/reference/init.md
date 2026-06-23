# `/blast-radius init`

Tailor this repo's blast-radius config. Run **after** `npx blast-radius install`
has dropped the engine, workflows, and a generic starter `config.yml` / `owners`.

Your job: replace the generic `src/**` starter tiers with **this repo's actual
sensitive surfaces**, then prove it with the validation test. This is the judgment
the static template can't do.

## Steps

1. **Map the repo.** List the top-level app/package dirs (`apps/*`, `packages/*`,
   `src/**`, etc.) and how it deploys (CI workflows, migration runner, file-based
   routes). Read `README`/`AGENTS.md` if present.

2. **Classify each surface into a tier.** Edit `.github/blast-radius/config.yml`:
   - **Tier 3 — high blast / irreversible:** auth & session, secrets/credential
     wiring, payments/entitlements, DB migrations & rules, server bootstrap/init
     order, public package entrypoints (`packages/*/src/index.ts`), and the
     request surface (route tables). The `.github/**` + `CODEOWNERS` rows are
     already there — keep them.
   - **Tier 2 — shared product code:** everything else under `apps/**`,
     `packages/*/src/**`, `src/**`. This is the default; unknown paths fall here.
   - **Tier 0 — inert:** docs, `**/*.md`, assets, localization. Already covered.
   - Add a **content escalation** for any secret-y token that a path glob can't
     catch (e.g. the repo's real API-key env names), under `escalations`.
   - Put genuinely auto-running paths (migrations, file-based routes) in
     `auto_reachable` so a new one isn't lowered to Tier 0 by the add-only rule.

3. **Route Tier-3 owners.** Edit `.github/blast-radius/owners`: every Tier-3
   domain gets `path @owner @backup`. Every entry MUST classify Tier 3 (the
   validation test fails on an "orphan" owner). Use real GitHub handles; ask the
   user who owns auth / payments / infra if unknown.

4. **Lock it with assertions.** In `.github/blast-radius/config.validate.test.ts`,
   add one `it(...)` per sensitive path asserting its tier (e.g. "our auth funnel
   is Tier 3"). This is what stops a future PR from silently de-tiering it.

5. **Verify.**
   ```bash
   cd .github/blast-radius && npm install && npm test
   ```
   Expected: all validation tests pass (config loads, no orphan owners, your
   assertions hold). If an owner is an orphan, either the path isn't Tier 3 in
   `config.yml` or the owner line is wrong — fix one.

## Rules

- **Don't invent paths.** Only tier paths that actually exist in this repo.
- **When unsure, leave it Tier 2.** Tier 2 is the safe default; over-tiering to 3
  just adds owner-gate friction, under-tiering to 0/1 is a safety hole.
- **Never weaken the self-protected rows** (`.github/**`, `CODEOWNERS`).
- **Confirm owners with the user** before writing handles you're guessing at.
