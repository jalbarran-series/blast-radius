# blast-radius

Tiered PR merge policy for AI-authored code. Classify every PR by **blast radius**
(how much damage it can do), not line count — then auto-merge what's safe and route
the risky 5% to an accountable owner. Ships a deterministic classifier, GitHub bot
workflows, and an agent skill, installable into any repo.

> Origin: extracted from a production PR merge-policy system and generalized so
> any repo can adopt it with one command.

## Contents

- [Why](#why)
- [Install into a repo](#install-into-a-repo)
- [CLI](#cli)
- [The tiers](#the-tiers)
- [Workflow secrets & variables](#workflow-secrets--variables)
- [Layout](#layout)

## Why

AI lets non-engineers open multiple 4k-line PRs a day. Gating on line count makes
review either a rubber stamp or a multi-week traffic jam. blast-radius gates on
what actually matters: **correct, safe, reversible, and owned** changes. A
deterministic classifier measures blast radius on every push.

## Install into a repo

```bash
npx @series-inc/blast-radius install     # drop engine + workflows + starter config + skill
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

Then: edit `config.yml` tiers + `owners` for your paths, set the
[secrets + variables](#workflow-secrets--variables), and enable the workflows.

## CLI

```bash
npx @series-inc/blast-radius install [dir]       # scaffold engine + workflows + starter config + skill
npx @series-inc/blast-radius update  [dir]       # pull latest framework files; surface workflow drift
npx @series-inc/blast-radius doctor  [dir]       # validate config.yml + owners (no orphan owners)
npx @series-inc/blast-radius classify <file>...  # print the tier for a set of changed files
```

`update` refreshes the framework-owned files in place (compiled engine + the
`/blast-radius` skill) and, for the vendored workflows + PR template, writes a
non-destructive `<file>.new` next to any file that drifted from the current
template — diff, merge what you want, then delete the `.new`. It never touches
your `config.yml`, `owners`, or `config.validate.test.ts`.

Agent commands (from the installed skill): `/blast-radius init`, `/blast-radius explain`.

## The tiers

- **Tier 0 — inert** (docs, assets, add-only). Auto-merges, no review.
- **Tier 1 — flag-dark** (new code behind a default-off flag). AI review only.
- **Tier 2 — shared code** (normal product code). AI review + human only if risky.
- **Tier 3 — high blast** (auth, secrets, migrations, CI, public APIs). Owner approval.

## Workflow secrets & variables

Configure these on the target repo (**Settings → Secrets and variables →
Actions**). The only thing required to run is **one** AI-provider key matching
your model — everything else has a working default.

### Secrets

| Secret | Required? | Used by | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | one provider key required | `bot-ai-review` | Auth for `anthropic/*` models (the default) |
| `OPENAI_API_KEY` | alternative | `bot-ai-review` | Auth for `openai/*` models |
| `GEMINI_API_KEY` | alternative | `bot-ai-review` | Auth for `google/*` models |
| `GITHUB_TOKEN` | auto | all bots | Provided by GitHub Actions — **no setup** |
| `MERGE_APP_PRIVATE_KEY` | optional | `bot-merge-policy` | GitHub App private key so a gate-merge push triggers `on: push` CD. Unset → falls back to `GITHUB_TOKEN` (CD won't fire). Scoped to the `development` environment, not repo-level. |

Set only the provider key that matches `AI_REVIEW_MODEL`. All three are wired
into the review step, but only the matching one is read.

### Repo variables

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `AI_REVIEW_MODEL` | `anthropic/claude-opus-4-8` | `bot-ai-review` | Reviewer model as `provider/id`; any model the pinned `pi-coding-agent` registry exposes (Anthropic / OpenAI / Gemini). |
| `AI_REVIEW_THINKING` | _(empty)_ | `bot-ai-review` | Reasoning effort: `off \| minimal \| low \| medium \| high \| xhigh`. Empty = provider default. Don't bake a `:level` into `AI_REVIEW_MODEL` yourself. |
| `AUTOASSIGN_ENABLED` | `false` (off) | `bot-auto-assign-pr` | Set to `true` to turn on reviewer auto-assignment. |
| `AUTOASSIGN_POOL` | `[]` | `bot-auto-assign-pr` | JSON array of `{ login, pausedUntil?, reason? }` — the reviewer pool with OOO awareness. |
| `AUTOMERGE_BASES` | `develop` | `bot-merge-policy` | Comma-separated base branches eligible for auto-merge. |
| `MERGE_APP_ID` | _(empty)_ | `bot-merge-policy` | GitHub App id paired with `MERGE_APP_PRIVATE_KEY`. Empty → app-merge disabled (uses `GITHUB_TOKEN`). |

Fastest path to a working AI-review gate:

```bash
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."
```

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
