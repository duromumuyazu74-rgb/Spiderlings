# Delivery evidence

Both modes require Node.js 24, Git and PowerShell. An explicit build also needs the pinned Python atlas dependencies. Run from the Spiderlings repository root after preparing the intended source and installable ZIP:

```powershell
npm run report:delivery -- --base origin/test
```

The default full mode runs repository checks, policy tests, public regressions, the complete local watcher, and byte-for-byte verification of the existing versioned ZIP. It needs the local game and original artwork inputs described in [development setup](DEVELOPMENT.md#setup). Use `--base origin/main` for a formal-target change.

Each invocation creates a new directory under `.scratch/delivery/` containing `REPORT.md`, `report.json` and per-check logs. The JSON includes the exact commands, timestamps, exit codes, tool versions, source commit, comparison commit, staged/unstaged/untracked paths, package size and SHA-256. A dirty tree is labelled as a worktree candidate. The collector compares source/index fingerprints before and after checks and fails if the source or selected ZIP changes during verification. Earlier reports and packages are preserved.

Exit code zero means the requested automated verification passed. Game acceptance is recorded separately. Failed commands, missing tools, an absent/wrong ZIP, invalid evidence or changing inputs produce a nonzero exit and retain the report and available logs. Inspect the failed check's log, fix the cause, then generate a new report. Argument errors and an unwritable output directory may prevent report creation.

## Public checks and builds

```powershell
# Verify an existing downloaded ZIP without private game inputs.
npm run report:delivery -- --mode public --package .\Spiderlings_0.92.36-test.13.zip

# Explicitly build a new versioned ZIP, then run full local verification.
npm run report:delivery -- --build --base origin/test
```

Public mode marks the private watcher as `not-run`. `--build` calls the established release builder before checking the resulting source. The builder regenerates the atlas and refuses to overwrite an existing same-version ZIP. The collector has no force option. For a build, use the default manifest-derived package path; `--package` selects an existing file to verify. Source changes made by a requested build appear in the recorded worktree state; changes made after checks start invalidate the run.

CI uses `--mode public --build`, also requiring generated atlases to match the committed files. It keeps the required `Repository checks` name, uploads the installable ZIP as `spiderlings-<commit SHA>`, and retains a separate `spiderlings-evidence-<commit SHA>` artifact for 14 days. Evidence is retained on verification failure when checkout/setup allow the collector to run. JSON records identify the CI run and, for a PR, both its checked-out commit and PR head.

## Game acceptance records

Supply a JSON record for the exact tested ZIP. Paths in `evidence` resolve relative to this JSON file:

```json
{
  "schemaVersion": 1,
  "packageSha256": "<64-character SHA-256 of the tested ZIP>",
  "records": [
    {
      "gameVersion": "5.4.92",
      "status": "passed",
      "scope": "Native ZIP loading and Spinner capture",
      "evidence": "native-5.4.92.json",
      "limitations": ["Full visual review and a complete save-file reload were not exercised."]
    },
    {
      "gameVersion": "5.5.3",
      "status": "not-run",
      "scope": "Complete visual review",
      "limitations": ["Pending manual acceptance."]
    }
  ]
}
```

```powershell
npm run report:delivery -- --evidence .\.scratch\playtest\acceptance.json
```

Allowed record statuses are `passed`, `failed` and `not-run`. A passed or failed record requires an existing evidence file. The collector validates the ZIP hash, copies those files into the report directory, records their hashes, and preserves the stated scope and limitations. Their status is labelled as **reported**; the collector does not perform gameplay or visual tests. An explicit failed game record makes the command fail. With no supplied JSON, game acceptance remains `not-run`, even when the watcher passes.

Reports may contain local paths and supplied evidence. Inspect them before sharing. The command does not publish, tag, merge, close Issues or promote a test version. Follow the [verification matrix](../CONTRIBUTING.md#verification) and [publishing procedure](DEVELOPMENT.md#releases) for the applicable delivery.
