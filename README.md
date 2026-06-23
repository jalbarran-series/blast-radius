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
npx blast-radius init                    # scaffold into the current repo
cd .github/blast-radius && npm install && npm test   # validate config + owners
```

`init` writes:

| Path | Owner | Clobbered on re-init? |
|---|---|---|
| `.github/blast-radius/*.ts` | framework (engine) | yes — keeps repos in sync |
| `.github/blast-radius/config.yml` | **your repo** | no |
| `.github/blast-radius/owners` | **your repo** | no |
| `.github/blast-radius/config.validate.test.ts` | **your repo** | no |
| `.github/workflows/bot-*.yml` | your repo (adapt) | no |
| `.github/PULL_REQUEST_TEMPLATE.md` | your repo | no |
| `.claude/skills/pr-blast-radius/SKILL.md` | framework | yes |

Then: edit `config.yml` tiers + `owners` for your paths, and adapt the bot
workflows (secrets, reviewer pool) before enabling them.

## CLI

```bash
blast-radius init [dir]          # scaffold engine + config + workflows + skill
blast-radius doctor [dir]        # validate config.yml + owners (no orphan owners)
blast-radius classify <file>...  # print the tier for a set of changed files
```

## The tiers

- **Tier 0 — inert** (docs, assets, add-only). Auto-merges, no review.
- **Tier 1 — flag-dark** (new code behind a default-off flag). AI review only.
- **Tier 2 — shared code** (normal product code). AI review + human only if risky.
- **Tier 3 — high blast** (auth, secrets, migrations, CI, public APIs). Owner approval.

## Layout

```
engine/      deterministic classifier (repo-agnostic) + fixture tests
templates/   per-repo starter config.yml, owners, PR template, bot workflows
cli/         the `blast-radius` CLI (init / doctor / classify)
skill/       single-source agent skill (SKILL.src.md → built per provider)
scripts/     build-skills.mjs (sync skill into .claude/.cursor/.agents/dist)
```

Engine is shipped and versioned; config is scaffolded and repo-owned. See
`skill/reference/architecture.md`.
