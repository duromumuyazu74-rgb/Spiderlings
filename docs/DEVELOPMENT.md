# Development and publishing

## Setup

Clone `https://github.com/duromumuyazu74-rgb/Spiderlings.git` and select `test` for development or `main` for formal maintenance. The source path stays `Spiderlings_0.91/` so existing tools retain their paths.

Use Node.js with its built-in test runner, PowerShell, and Python with `Pillow` and `pyoxipng`. The atlas builder imports `PIL` and `oxipng`. The regression tests also need these separately supplied local inputs at the repository root:

- `KinkiestDungeon-5.5/`: official KD 5.5 source tree, used read-only.
- `T‘s NEW Webbing LV1/` and `T‘s NEW Webbing LV2/`: original artwork reference folders used by existing provenance checks. Keep the curly apostrophe in these folder names.

These inputs are not downloaded or redistributed by the repository. An existing KD workspace can supply them through local directory junctions; all generated files remain outside those targets. Run commands from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\watch-spiderlings-mod.ps1 -Once
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\build-spiderlings-release.ps1 -RunCheck
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\watch-spiderlings-mod.ps1 -Once
```

The builder uses the manifest allowlist plus seven locale CSVs. It emits `Spiderlings_<modbuild>.zip` at the repository root. Existing same-version packages are preserved; replacing one requires an intentional replacement. Keep derived atlases and direct PNG fallbacks committed with source. ZIPs are delivery artifacts, excluded from Git.

## Issues and branches

[GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues) holds new specs, tickets and triage. See [tracker operations](agents/issue-tracker.md) and [labels](agents/triage-labels.md). Old scratch records remain in the original KD workspace; historical links in imported maintenance records refer to that workspace and are not new acceptance evidence.

Develop against `test`, preserving the formal baseline and increasing `-test.N` for each test delivery. Fixes intended for formal users go to `main` and are carried into `test` as needed. Promoting test gameplay requires the requested acceptance and the next formal version after the current `main` version. Current `main` is `0.92.38`, so the next ordinary formal release is `0.92.39`; do not promote by merely deleting `-test.11` from `0.92.36-test.11`.

Keep commits focused and link the applicable Issue. Publishing only these initial snapshots does not migrate the original workspace's Git history, game files, personal configuration or scratch logs.

## Releases

Only formal versions receive a `v<modbuild>` tag and GitHub Release. Verify the final installable ZIP and commit first. Push the tag to its reviewed formal commit, read back the remote tag, then create a Release with `gh release create --verify-tag --notes-file <file>` and attach the versioned ZIP. Read back release state and the uploaded asset. Test versions currently remain on `test`; do not create a test Release.

Preserve existing release assets and tags. The repository's Source code downloads contain maintenance files and a nested Mod directory; direct players to the attached installable ZIP.
