# `/blast-radius explain [pr|files]`

Explain why a PR (or a set of files) lands in its tier and exactly what's needed
to merge. Always ground the answer in `.github/blast-radius/config.yml` — never
guess the tier from memory.

## Steps

1. **Get the file list.**
   - For a PR: `gh pr diff <n> --name-only`.
   - For an explicit set: use the paths given.

2. **Classify.** Run the engine against this repo's config:
   ```bash
   node .github/blast-radius/runClassify.mjs --files <(printf '%s\n' <files>) \
     --diff /dev/null --base HEAD
   ```
   The JSON reports `tier` + `reasons` (which file/glob drove it).

3. **State the tier and the driver.** "Tier 3 — `src/auth/session.ts` matches the
   Tier-3 `src/auth/**` glob. PR tier = max of all files." Name the single file
   that set the ceiling.

4. **State what's required to merge** (by tier):
   - **0** — nothing, auto-merges on green.
   - **1** — AI review only; auto-merges unless AI risk is high.
   - **2** — AI review; low → auto, medium → `/po-verified` or 1 approval, high →
     1 approval.
   - **3** — full CI + the **assigned owner's** approval; never auto-merges.

5. **If it's higher than the user wants,** point at the lever: split the Tier-3
   file into its own PR (the rest drops), or gate a new feature behind a
   default-off flag (`Flag: NAME`) for the Tier-1 fast lane. Never suggest gaming
   the classifier.

## Rules

- Report the live gate state honestly; don't claim mergeable when the merge
  policy says otherwise.
- You (the agent) must never post `/po-verified` — it's a human attestation.
