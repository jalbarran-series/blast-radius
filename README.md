# blast-radius

Tiered PR merge policy for AI-authored code. Classify every PR by **blast radius**
(how much damage it can do), not line count — then auto-merge what's safe and route
the risky 5% to an accountable owner. Ships a deterministic classifier, GitHub bot
workflows, and an agent skill, installable into any repo.

> Origin: extracted from the blast-radius system in series-ai/venus, generalized
> so any repo can adopt it with one command.

## Why

AI lets non-engineers open multiple 4k-line PRs a day. Gating on line count makes
review either a rubber stamp or a multi-week traffic jam. blast-radius gates on
what actually matters: **correct, safe, reversible, and owned** changes. A
deterministic classifier measures blast radius on every push.

## Install into a repo

```bash
npx blast-radius install                 # drop engine + workflows + starter config + skill
# then, in your AI agent:
/blast-radius init                       # tailor config.yml + owners to THIS repo
cd .github/blast-radius && npm install && npm test   # validate config + owners
```

Two layers, like a design-skill installer: the **CLI `install`** drops the
deterministic pieces; the **agent command `/blast-radius init`** does the
judgment (which paths are Tier 3 in *this* repo).

`install` writes:

| Path | Owner | Clobbered on re-init? |
|---|---|---|
| `.github/blast-radius/*.mjs` | framework (compiled engine, zero-dep) | yes — keeps repos in sync |
| `.github/blast-radius/config.yml` | **your repo** | no |
| `.github/blast-radius/owners` | **your repo** | no |
| `.github/blast-radius/config.validate.test.ts` | **your repo** | no |
| `.github/workflows/bot-*.yml` | your repo (adapt) | no |
| `.github/PULL_REQUEST_TEMPLATE.md` | your repo | no |
| `.claude/`, `.cursor/`, `.agents/skills/blast-radius/` | framework | yes |

Then: edit `config.yml` tiers + `owners` for your paths, and adapt the bot
workflows (secrets, reviewer pool) before enabling them.

## CLI

```bash
blast-radius install [dir]       # scaffold engine + workflows + starter config + skill
blast-radius doctor  [dir]       # validate config.yml + owners (no orphan owners)
blast-radius classify <file>...  # print the tier for a set of changed files
```

Agent commands (from the installed skill): `/blast-radius init`, `/blast-radius explain`.

## The tiers

- **Tier 0 — inert** (docs, assets, add-only). Auto-merges, no review.
- **Tier 1 — flag-dark** (new code behind a default-off flag). AI review only.
- **Tier 2 — shared code** (normal product code). AI review + human only if risky.
- **Tier 3 — high blast** (auth, secrets, migrations, CI, public APIs). Owner approval.

## Layout

```
engine/      deterministic classifier (repo-agnostic, TS source) + fixture tests
dist/engine/ compiled standalone .mjs bundles (deps inlined; built, gitignored)
templates/   per-repo starter config.yml, owners, PR template, bot workflows
cli/         the `blast-radius` CLI (init / doctor / classify)
skill/       single-source agent skill (SKILL.src.md → built per provider)
scripts/     build-engine.mjs (TS → .mjs) + build-skills.mjs (skill sync)
```

Engine is shipped and versioned; config is scaffolded and repo-owned. `install`
scaffolds the **compiled `.mjs`** engine, so a consumer's CI runs `node
runClassify.mjs` with zero install (only the repo-owned validation test needs
vitest). Run `npm run build` after changing `engine/**`. See
`skill/reference/architecture.md`.
