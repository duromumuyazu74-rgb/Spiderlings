# Development and publishing

Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for language restrictions, incremental formatting, commits and required PR checks. Its [verification matrix](../CONTRIBUTING.md#verification) determines which checks and delivery steps apply to a change. Both maintained branches use PRs; the sole maintainer can merge after checks without another person's approval.

## Setup

Clone `https://github.com/duromumuyazu74-rgb/Spiderlings.git` and select `test` for development or `main` for formal maintenance. The source path stays `Spiderlings_0.91/` so existing tools retain their paths.

Use Node.js with its built-in test runner, PowerShell, and Python with `Pillow` and `pyoxipng`. The atlas builder imports `PIL` and `oxipng`. The regression tests also need these separately supplied local inputs at the repository root:

- `KinkiestDungeon-5.5/`: official KD 5.5 source tree, used read-only.
- `T‘s NEW Webbing LV1/` and `T‘s NEW Webbing LV2/`: original artwork reference folders used by existing provenance checks. Keep the curly apostrophe in these folder names.

These inputs are not downloaded or redistributed by the repository. An existing KD workspace can supply them through local directory junctions; all generated files remain outside those targets. Run commands from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\build-spiderlings-release.ps1
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\watch-spiderlings-mod.ps1 -Once
```

The builder uses the manifest allowlist plus seven locale CSVs. It emits `Spiderlings_<modbuild>.zip` at the repository root. Existing same-version packages are preserved; replacing one requires an intentional replacement. Keep derived atlases and direct PNG fallbacks committed with source. ZIPs are delivery artifacts, excluded from Git.

Use `npm run report:delivery -- --base origin/test` to run the existing checks and package verifier while collecting JSON, Markdown and per-check logs. It verifies the existing ZIP by default. See [delivery evidence](DELIVERY-EVIDENCE.md) for public mode, explicit builds and importing game acceptance records bound to the package hash.

`Repository checks` uses the public delivery-evidence mode to build the same allowlisted ZIP on every pull request and maintained-branch push. It verifies every archive entry against that commit, rejects extra or missing files, confirms that atlas generation left no uncommitted difference, and uploads `spiderlings-<commit SHA>` plus a separate `spiderlings-evidence-<commit SHA>` artifact for 14 days. This public-run package does not include the private game and original-art checks, so it is a delivery candidate until the local watcher and required in-game acceptance pass.

To verify an existing package against the checked-out commit without rebuilding it:

```powershell
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\build-spiderlings-release.ps1 -VerifyOnly -PackagePath .\Spiderlings_<modbuild>.zip
```

## Issues and branches

[GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues) holds new specs, tickets and triage. See [tracker operations](agents/issue-tracker.md) and [labels](agents/triage-labels.md). Old scratch records remain in the original KD workspace; historical links in imported maintenance records refer to that workspace and are not new acceptance evidence.

Develop against `test`, preserving the formal baseline and increasing `-test.N` for each test delivery. Fixes intended for formal users go to `main` and are carried into `test` as needed. Promoting test gameplay requires the requested acceptance and the next formal version after the current `main` version. Current `main` is `0.92.38`, so the next ordinary formal release is `0.92.39`; do not promote by merely deleting the test suffix from `0.92.36-test.13`.

Keep commits focused and link the applicable Issue. Publishing only these initial snapshots does not migrate the original workspace's Git history, game files, personal configuration or scratch logs.

## Releases

Only formal versions receive a `v<modbuild>` tag and GitHub Release. After the accepted formal change merges, identify the successful `Repository checks` run for that exact `main` commit and download its `spiderlings-<commit SHA>` artifact. Verify the contained ZIP against the same checkout, run the required package and in-game acceptance on that file, and record its SHA-256.

Push `v<modbuild>` to the reviewed commit and read the remote tag back. Create the Release with `gh release create v<modbuild> Spiderlings_<modbuild>.zip --verify-tag --notes-file <file>`, attaching the exact ZIP that passed acceptance. Read the Release and download its attachment again to confirm the filename, size and SHA-256. Test versions remain workflow artifacts from `test`; do not create a test Release.

Preserve existing release assets and tags. The repository's Source code downloads contain maintenance files and a nested Mod directory; direct players to the attached installable ZIP.
