# AGENTS.md — blast-radius

## What this is

A framework that installs a tiered PR merge policy into any repo: a deterministic
blast-radius classifier (`engine/`), GitHub bot workflows + starter config
(`templates/`), a CLI (`cli/`), and a single-source agent skill (`skill/`). The
`blast-radius` CLI scaffolds these into a target repo. Extracted from
series-ai/venus and generalized.

## The load-bearing split (do not blur it)

- **`engine/` is repo-agnostic and shipped.** It must never reference a specific
  repo's paths. Its tests run against `engine/__fixtures__/`, not any real config.
- **`templates/` is the per-repo surface.** `config.yml` + `owners` +
  `config.validate.test.ts` are scaffolded and then owned by the consumer repo.
  `install` never clobbers them; it does overwrite the compiled engine `.mjs`.
- **Two-layer UX (like impeccable):** CLI `blast-radius install` = deterministic
  scaffold + skill install into agent dirs; the agent command `/blast-radius init`
  (defined in `skill/SKILL.src.md`'s command router) = per-repo config tailoring.

## Commands

| Task | Command |
|---|---|
| Engine tests | `npm test` (vitest against `engine/`) |
| Build skill into agent dirs | `npm run build:skills` |
| Scaffold into a repo | `node cli/bin/cli.js install <dir>` |
| Update an installed repo | `node cli/bin/cli.js update <dir>` |
| Validate a repo's config | `node cli/bin/cli.js doctor <dir>` |
| Classify files | `node cli/bin/cli.js classify <file>...` |

## Rules

- **Engine purity:** no product/repo paths in `engine/**`. New behavior gets a
  fixture-based test in `engine/*.test.ts`; per-repo path assertions belong in the
  scaffolded `templates/config.validate.test.ts`, not the engine suite.
- **Skill has one source:** edit `skill/SKILL.src.md` only; the per-provider
  copies under `.claude/`, `.cursor/`, `.agents/` are build output of
  `scripts/build-skills.mjs`. Never hand-edit them.
- **Workflow templates are venus-derived:** they carry a `SCAFFOLDED BY` banner
  and TODOs (secrets, reviewer pool). Keep them generic — no org handles or
  product paths.
- **Versioning:** `package.json`, `.claude-plugin/plugin.json`, and
  `.claude-plugin/marketplace.json` carry the version — keep them in sync.

## Key paths

```
engine/__fixtures__/   generic config + owners for engine tests (product-agnostic)
engine/classify.ts     core tiering + hardcoded self-protect floor
templates/             scaffolded into consumers' .github/ and .claude/
cli/lib/scaffold.mjs   install copy logic + framework-owned writers (overwrite vs preserved)
cli/lib/update.mjs     update: refresh framework files, write <file>.new on workflow drift
skill/SKILL.src.md     the one true skill source
```
