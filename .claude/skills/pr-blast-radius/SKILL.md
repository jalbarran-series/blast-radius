---
name: pr-blast-radius
description: Blast-radius tiered PR merge policy — how PRs are auto-classified Tier 0–3 and what's required to merge. Use when opening a PR, predicting its tier, reporting merge state to a human, or authoring changes that touch auth, secrets, migrations, CI workflows, public package APIs, or feature flags.
---

# PR Blast-Radius Policy

Every PR is classified into a **tier (0–3) by blast radius** (how much damage it
can do), not line count. The tier sets what's required to merge. Bots classify on
push and post two sticky comments: **blast radius** (why this tier) and **merge
policy** (what's required). Read both before reporting mergeability to a human.

## The single source of truth — never restate it from memory

- **Path → tier mapping, escalators, generated/inert lists:**
  `.github/blast-radius/config.yml`. **Read it** to answer "what tier is this
  path" — do not trust a copied list, it drifts. The classifier takes
  `max(file tiers)`, then applies escalators (add-only can lower; a declared
  flag lowers to Tier 1; content rules / sentinels raise to Tier 3). Unknown
  paths fail safe to **Tier 2**.
- **Tier-3 owner routing:** `.github/blast-radius/owners` (CODEOWNERS syntax).
- `config.yml`, `owners`, and everything under `.github/` are themselves Tier 3
  (self-protected in `classify.ts`) — changing the rules is reviewed.

## Tiers (what's required to merge)

- **Tier 0 — inert** (docs, `**/*.md`, assets, localization, add-only new
  source). Auto-merges on green, no review. Size irrelevant.
- **Tier 1 — flag-dark** (new surface behind a default-off flag, declared
  `Flag: NAME` in the PR body, touching no existing shared files). AI review
  only; auto-merges unless AI risk is high. The **fast lane**.
- **Tier 2 — shared code** (normal product code, and anything unknown). AI review
  + by risk: low → auto-merge; medium → `/po-verified` OR 1 approval; high →
  1 approval.
- **Tier 3 — high blast** (auth, secrets, migrations, CI workflows, the
  classifier, public package APIs, and any path the repo's `config.yml` marks
  sensitive). Full CI + the **assigned owner's** approval. Never auto-merges;
  a non-owner approval doesn't count.

## Authoring rules (durable invariants)

- **Minimize blast radius.** Never drive-by edit a Tier-3 path while doing
  unrelated work.
- **One intent per PR.** If describing it needs "and", split it. Splitting also
  classifies lower and merges faster. Put renames/formatting/generated code in
  their own Tier-0 PR.
- **Prefer flag-dark for new features:** gate every new entry point behind a
  default-off flag, don't touch existing shared files in the same PR, and write
  `Flag: MY_FEATURE` in the PR body. Earns Tier 1.
- **Never game the tier down.** No logic hidden in `.md` files, no flag declared
  without gating the code, no splitting a sensitive change to dodge tiering.
  The classifier reads the actual diff; gaming is also a trust violation.
- **Respect sentinels.** Code marked `// blast-radius:t3` (or inside a
  `:start`/`:end` region) is order-sensitive or dangerous — flag Tier-3 review
  before touching it.
- **No secrets in any diff, ever.**
- **Write the PR description yourself** in plain language: what & why (1–3 honest
  sentences), risk, and a concrete how-to-verify checklist.

## Agent-specific rules (you are an AI agent)

- **Report gate state accurately.** Never claim a PR is mergeable when the merge
  policy says otherwise.
- **If the AI review gate is red,** fix every listed blocker or explain why it's
  a false positive. Never advise dismissing blockers to get green.
- **Tier 2 medium risk** clears with EITHER 1 human approval OR a `/po-verified`
  comment from a write-access human who verified the change. You **must never**
  post `/po-verified` yourself — it's a human attestation.
- **Tier 3:** only the assigned owner's approval clears the gate. Don't solicit
  non-owner approvals; they don't count. Don't attempt a manual merge.
- **Never** approve a PR, arm auto-merge manually, use an admin bypass, or push
  directly to the base branch.
- **If your human can't explain what the PR does, tell them to stop and pair**
  before merging. The human who opens the PR owns it — "the AI did it" is never
  an explanation for a bug, leak, or outage.

See [reference/architecture.md](reference/architecture.md) for how the engine,
config, owners, and bots fit together.
