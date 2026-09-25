# Development and publishing

Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for code conventions, formatting, commits and required PR checks. Its [verification matrix](../CONTRIBUTING.md#verification) determines which checks and delivery steps apply to a change. Both maintained branches use PRs; the sole maintainer can merge after checks without another person's approval.

## Setup

See [source and history migration](SOURCE-MIGRATION.md) for the directory rename and cleanup of private authoring paths.

Clone `https://github.com/duromumuyazu74-rgb/Spiderlings.git` and select `test` for development or `main` for formal maintenance. The active source directory is `KinkyDungeon-Spiderlings/`; the previous `Spiderlings_0.91/` directory name is retained only in historical records and private-path exclusions.

Use Node.js with its built-in test runner, PowerShell, and Python with `Pillow` and `pyoxipng`. The atlas builder imports `PIL` and `oxipng`. The local regression tests need these separately supplied directories under an external input root:

- `KinkiestDungeon-5.5/`: official KD 5.5 source tree, used read-only.
- `T‘s NEW Webbing LV1/` and `T‘s NEW Webbing LV2/`: original artwork reference folders used by existing provenance checks. Keep the curly apostrophe in these folder names.

These inputs are not downloaded or redistributed by the repository. Configure the absolute path to their parent directory once per clone. Git's local configuration is shared by its linked worktrees:

```powershell
git config --local spiderlings.referenceRoot 'D:/KD-reference-inputs'
```

`SPIDERLINGS_REFERENCE_ROOT` overrides that setting for a process and its children. Inputs must resolve outside the checkout. Public tests do not require the private inputs. The checker and native tests use `tools/reference-inputs.js`; they fail with setup instructions when the setting is missing instead of searching unrelated ancestor directories. Repository checks reject junctions or symlinks at the game, artwork and `node_modules` paths.

Run commands from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\KinkyDungeon-Spiderlings\tools\build-spiderlings-release.ps1
powershell -ExecutionPolicy Bypass -File .\KinkyDungeon-Spiderlings\tools\watch-spiderlings-mod.ps1 -Once
```

The builder validates `modbuild`, then uses the manifest allowlist plus seven locale CSVs. It emits `Spiderlings_<modbuild>.zip` at the repository root. Existing same-version packages are refused before atlas generation; replacing one requires an intentional replacement. `-RunCheck` runs the complete local watcher after writing and verifying the final ZIP. With `-NoPackage`, it checks the available source and any existing package. The watcher uses the same archive verifier as `-VerifyOnly`, including PNG bytes and duplicate entries. Keep derived atlases and direct PNG fallbacks committed with source. ZIPs are delivery artifacts, excluded from Git.

Use `npm run report:delivery -- --base origin/test` to run the existing checks and package verifier while collecting JSON, Markdown and per-check logs. It verifies the existing ZIP by default. See [delivery evidence](DELIVERY-EVIDENCE.md) for public mode, explicit builds and importing game acceptance records bound to the package hash.

`Repository checks` uses the public delivery-evidence mode to build the same allowlisted ZIP on every pull request and maintained-branch push. It verifies every archive entry against that commit, rejects extra or missing files, confirms that atlas generation left no uncommitted difference, and uploads `spiderlings-<commit SHA>` plus a separate `spiderlings-evidence-<commit SHA>` artifact for 14 days. This public-run package does not include the private game and original-art checks, so it is a delivery candidate until the local watcher and required in-game acceptance pass.

The required `Repository checks` job always evaluates both `Windows worktree safety` and `Delivery checks`. Failure, cancellation or a skipped prerequisite fails this gate. The two prerequisite jobs can run independently.

To verify an existing package against the checked-out commit without rebuilding it:

```powershell
powershell -ExecutionPolicy Bypass -File .\KinkyDungeon-Spiderlings\tools\build-spiderlings-release.ps1 -VerifyOnly -PackagePath .\Spiderlings_<modbuild>.zip
```

## Worktrees and cleanup

Create worktrees without game, artwork or dependency junctions. Install locked maintenance dependencies with `npm ci` in each checkout. Lock any checkout that retains packages, evidence or ongoing work using `git worktree lock --reason <reason> <absolute-path>`; this makes ordinary Git removal refuse the directory.

Windows worktree removal previously traversed shared-input junctions and erased their targets twice. A clean Git status and omission of `--force` did not prevent it. The input resolver now removes the need for those links, and the supported cleanup entry point rejects every reparse point before descending into it.

Run the cleanup script from a retained checkout, with an explicit target and a branch or tag that contains its HEAD:

```powershell
powershell -NoProfile -File .\KinkyDungeon-Spiderlings\tools\remove-safe-worktree.ps1 -Worktree 'D:/work/spinner-ticket'
powershell -NoProfile -File .\KinkyDungeon-Spiderlings\tools\remove-safe-worktree.ps1 -Worktree 'D:/work/spinner-ticket' -KeepRef refs/remotes/origin/test -Execute
```

The first invocation is a read-only preflight. The second repeats the checks and removes only a registered, non-primary, clean worktree with no ignored files, no reparse points and a retained HEAD. Preserve packages, logs and dependencies before cleanup. The script never unlocks a checkout, uses force, removes branches, or falls back to recursive filesystem deletion. If it refuses, retain the directory until the reported condition is resolved. Do not change the checkout concurrently with cleanup.

For an existing junction, validate its exact path and target, preserve and verify the target contents, and detach only the link with nonrecursive link semantics. Never test deletion against real reference inputs. The public safety suite uses disposable repositories, real Windows junctions and external sentinel files; a dedicated Windows CI job exercises the deletion path.

## Issues and branches

The [2026-09-22 repository audit](REPOSITORY-AUDIT-2026-09-22.zh-CN.md) records delivery fixes, verification scope and follow-up priorities.

Follow [dependency maintenance](DEPENDENCIES.md) for scheduled update PRs and [third-party notices](../THIRD-PARTY-NOTICES.md) for licensing boundaries. Personal artist handoff pages and their dedicated sources stay local at ignored paths; the public source and installable ZIP exclude them.

[GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues) holds new specs, tickets and triage. See [tracker operations](agents/issue-tracker.md) and [labels](agents/triage-labels.md). Old scratch records remain in the original KD workspace; historical links in imported maintenance records refer to that workspace and are not new acceptance evidence.

Develop against `test`, preserving the formal baseline and increasing `-test.N` for each normal test delivery. Nest prison experiments use a separate `-prison.alpha.N` sequence until accepted into the normal test line. Their ZIPs contain the full Mod, not an add-on, so enable only one Spiderlings ZIP at a time. Fixes intended for formal users go to `main` and are carried into `test` as needed. Promoting gameplay requires the requested acceptance and the next formal version after the current `main` version. Current `main` is `0.92.38`, so the next ordinary formal release is `0.92.39`; do not promote by merely deleting a prerelease suffix.

Keep commits focused and link the applicable Issue. Publishing only these initial snapshots does not migrate the original workspace's Git history, game files, personal configuration or scratch logs.

## Releases

Only formal versions receive a `v<modbuild>` tag and GitHub Release. After the accepted formal change merges, identify the successful `Repository checks` run for that exact `main` commit and download its `spiderlings-<commit SHA>` artifact. Verify the contained ZIP against the same checkout, run the required package and in-game acceptance on that file, and record its SHA-256.

Push `v<modbuild>` to the reviewed commit and read the remote tag back. Create the Release with `gh release create v<modbuild> Spiderlings_<modbuild>.zip --verify-tag --notes-file <file>`, attaching the exact ZIP that passed acceptance. Read the Release and download its attachment again to confirm the filename, size and SHA-256.

Preserve existing release assets and tags. Normal test and Nest prison alpha packages remain temporary workflow artifacts from their respective branches and local builds; neither receives a GitHub Release. The repository's Source code downloads contain maintenance files and a nested Mod directory; direct players to the attached installable ZIP.

For a manual verification after repository maintenance, run the `Repository checks` workflow on the selected maintained branch. Manual runs compare against their own checked-out commit and still run policy/public tests and package verification. An unchanged root-directory move is exempt from retroactive content formatting/linting; modified files and all path, manifest and delivery checks remain enforced.
