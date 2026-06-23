# Blast-radius architecture

A deterministic classifier + a thin bot layer. The split that matters: the
**engine is repo-agnostic and shipped**; the **config is per-repo and scaffolded**.

## Flow

```
push → bot-blast-radius   → classify.ts (base-ref) → tier 0–3 + sticky comment + SHA-pinned status
     → bot-ai-review      → AI review (Tier ≥ 1)    → ai-review-gate (red while blockers remain)
     → bot-auto-assign-pr → routes assignee         → Tier 3: path owner; Tier 1/2 high-risk: pool
     → bot-merge-policy   → tier + risk + approvals + po-verified + assignee → merge-policy-gate
```

## Engine (shipped, repo-agnostic)

| File | Role |
|---|---|
| `classify.ts` | `max(file tiers)` then add-only / flag / content / sentinel escalators. Hardcoded self-protect floor forces `.github/blast-radius/**`, `.github/workflows/**`, `.github/prompts/**` to Tier 3 even under a weakened config. |
| `contentEscalation.ts` | Raises tier when a changed line matches a `config.yml` `escalations` regex. |
| `flagContainment.ts` | Lowers a flag-dark feature to Tier 1. |
| `workflowInert.ts` | Carves the narrow safe workflow edit down from Tier 3 to Tier 2. |
| `codeowners.ts` / `ownersConfig.ts` | Parse + validate the owners table. |
| `runClassify.ts` / `runAssign.ts` | Entry points the bot workflows call. |

Engine tests run against `engine/__fixtures__/` — never a real repo's config.

## Config (scaffolded, per-repo)

| File | Owner |
|---|---|
| `config.yml` | The repo. Path→tier globs, escalators, generated/inert lists. |
| `owners` | The repo. Tier-3 routing (CODEOWNERS syntax). |
| `config.validate.test.ts` | The repo. Asserts owners ⊆ Tier 3 + locks the repo's sensitive paths. |

## Why the split

The engine is identical across repos; only paths differ. Shipping the engine and
scaffolding the config means consumers pin a version instead of maintaining
diverging copies — and a config change can't silently weaken the classifier,
because the engine self-protects and the repo's own validation test runs in CI.
