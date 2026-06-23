# AGENTS.md — blast-radius

## What this is

A framework that installs a tiered PR merge policy into any repo: a deterministic
blast-radius classifier (`engine/`), GitHub bot workflows + starter config
(`templates/`), a CLI (`cli/`), and a single-source agent skill (`skill/`). The
`blast-radius` CLI scaffolds these into a target repo. Published to npm (name +
version in `package.json`).

## Commands

| Task | Command |
|---|---|
| Engine tests | `npm test` (vitest against `engine/`) |
| Build engine bundles | `npm run build` (TS → `dist/engine/*.mjs`) |
| Build skill into agent dirs | `npm run build:skills` |
| Scaffold into a repo | `node cli/bin/cli.js install <dir>` |
| Update an installed repo | `node cli/bin/cli.js update <dir>` |
| Validate a repo's config | `node cli/bin/cli.js doctor <dir>` |
| Classify files | `node cli/bin/cli.js classify <file>...` |

## The load-bearing split (do not blur it)

- **`engine/` is repo-agnostic and shipped.** Never reference a specific repo's
  paths or real handles in `engine/**`. Tests run against `engine/__fixtures__/`,
  not any real config.
- **`templates/` is the per-repo surface.** `config.yml` + `owners` +
  `config.validate.test.ts` are scaffolded then owned by the consumer. `install`
  never clobbers them; it does overwrite the compiled engine `.mjs`.
- **Two-layer UX:** CLI `blast-radius install` = deterministic scaffold + skill
  install into agent dirs; the agent command `/blast-radius init` (router in
  `skill/SKILL.src.md`) = per-repo config tailoring.
- **`install` vs `update`:** `install` preserves per-repo files (workflows,
  config); `update` refreshes framework-owned files and writes `<file>.new` on
  workflow drift. The overwrite-vs-preserve rules own themselves in
  `cli/lib/scaffold.mjs` + `cli/lib/update.mjs`.

## Rules

- **Engine purity:** no product/repo paths or real handles in `engine/**`. New
  behavior gets a fixture-based test in `engine/*.test.ts`; per-repo path
  assertions belong in the scaffolded `templates/config.validate.test.ts`.
- **Skill has one source:** edit `skill/SKILL.src.md` only; the per-provider
  copies under `.claude/`, `.cursor/`, `.agents/` are build output of
  `scripts/build-skills.mjs`. Never hand-edit them.
- **Workflow templates stay generic:** they carry a `SCAFFOLDED BY` banner + TODOs
  (secrets, reviewer pool) and scaffold verbatim into consumer repos. No org
  handles or product paths.
- **Workflow `name:` is an API:** sibling workflows trigger off each other by name
  in `workflow_run` (e.g. `"Bot: AI Review"`). Rename in lockstep across every
  referencing `templates/workflows/*.yml` or the bot chain silently stops firing.
- **Versioning:** `package.json`, `.claude-plugin/plugin.json`, and
  `.claude-plugin/marketplace.json` carry the version — keep all three in sync.

## Key paths

```
engine/__fixtures__/   generic config + owners for engine tests (product-agnostic)
engine/classify.ts     core tiering + hardcoded self-protect floor
engine/runAssign.ts    auto-assign dry-run; AUTHOR_OVERRIDES/FALLBACK_POOL empty (per-repo via env)
templates/             scaffolded into consumers' .github/ and agent dirs
cli/lib/scaffold.mjs   install copy logic + framework-owned writers
cli/lib/update.mjs     update: refresh framework files, write <file>.new on drift
skill/SKILL.src.md     the one true skill source
```

## Gotchas

- **`.npmignore` is inert when `package.json` `files` exists.** The `files`
  allowlist overrides it, so test/fixture exclusion lives as `!engine/**/*.test.ts`
  negation in `files` — the `.npmignore` is only a fallback. Keep the two in sync.
- **Scoped publish needs `npm publish --access public`** — scoped packages default
  to restricted and the publish fails without it.
