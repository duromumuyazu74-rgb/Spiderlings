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

## Module changes

Read [MODULES.md](MODULES.md) for state owners, native registration and scenario environment contracts. Use `npm run check:modules` and preview `npm run test:affected -- --base <starting-commit> --plan` for development feedback. Omit `--plan` to run selected public tests; add `--include-local` for selected native-source/art contracts. The plan reports native game scenes separately and includes real state consumers/prerequisites. Runtime modules have explicit profiles; proven same-path field edits can use narrower behavior profiles. Unknown inputs stop with `needs-mapping`, while explicitly shared infrastructure retains justified broad coverage. Final package gates remain defined by CONTRIBUTING.

## Dual-version runtime acceptance

Runtime deliveries require the same final ZIP to pass KD 5.4.92 and the latest official GitHub `5.5` commit, as specified in [CONTRIBUTING.md](../CONTRIBUTING.md#verification). Install the locked maintenance dependencies with `npm ci` and have Google Chrome available. Configure two absolute paths outside the Mod checkout:

```powershell
git config --local spiderlings.baselineGame 'C:/Game1/kinky-dungeon-win_64 (2)/resources/app'
git config --local spiderlings.compatibilityCache 'D:/KD-reference-inputs/kd-compatibility'
npm run test:compatibility
```

The baseline remains read-only and must report exactly 5.4.92. The cache holds a separate official clone, builds by commit, and timestamped acceptance results. Each invocation fetches `https://github.com/Ada18980/KinkiestDungeon.git` branch `5.5` and checks out its fetched commit, including updates that retain the same `KDVersionStr`. It refuses a different origin or local changes. The historical `KinkiestDungeon-5.5/` reference and artwork inputs remain unchanged. On Windows, the Git calls use OpenSSL and HTTP/1.1 with a stalled-transfer timeout.

Compilation uses the upstream tsconfig file order and TypeScript `noCheck` emission into the cache build directory. This produces a native runtime for compatibility tests; it does not certify upstream type-check cleanliness. The upstream texture packer reads the new checkout's assets and writes all atlases into that same external build directory. No assets are borrowed from 5.4.92 or the historical 5.5.0 snapshot. A completed build is reused only for its exact commit.

The command loads the final package through the native Mod manager in isolated Chrome sessions. Shared scenarios exercise Webbing progression and save/reload, Spinner waiting/capture/wall traversal, original and pink WebCaster visuals and expiry, and Rune impacts/target overlays. Extend these scenarios or supply additional native evidence for a change outside their coverage. Current scenarios do not replace testing the live online deployment, desktop shell, user saves or other Mods.

Results are in `<cache>/runs/<timestamp>-<Mod version>/`, including screenshots, per-version results and `acceptance.json`. Attach the latter to the delivery report:

```powershell
npm run report:delivery -- --evidence '<cache>/runs/<run>/acceptance.json'
```

`--baseline`, `--cache` and `--package` override configured/default paths. `--prepare-only` fetches and prepares the current upstream runtime without claiming gameplay acceptance. A network, build or native-test failure is a failed validation, not permission to label an older cache as current. Native audio play/pause interruptions are retained in the results but excluded from gameplay-error assertions.

For a focused debugging loop, list scenarios and select one or more names:

```powershell
npm run test:compatibility -- --list-scenarios
npm run test:compatibility -- --scenario native-escape
npm run test:compatibility -- --scenario spinner-art,target-overlay
```

Selection includes state continuations automatically, such as `spinner-inside` for `spinner-art` and `rune-hit` for `target-overlay`. Code helpers such as `normal-helpers.js` load into each requiring group without becoming an extra selected check. Each independent state group gets a fresh runtime and verifies the same ZIP; explicit continuation checks share their prerequisite's state. Group results, environment preparation and failure attribution are recorded in per-version evidence. Names may be comma-separated or supplied in repeated `--scenario` arguments. Unknown names fail before fetching or launching a browser. Listing requires no local game. Selected runs still fetch the latest upstream and exercise both versions, but their reports mark `verification.mode` as `partial`, with requested/executed scenarios and the full-suite size. Even an explicit selection of every name stays partial. Final delivery uses the command without `--scenario`; the delivery collector rejects partial acceptance inputs.

Native acceptance also verifies custom escape messages from the restraints actually registered in the loaded ZIP. The checker and public regressions use the same native consumer contract for English, all seven locales and item placeholders. New custom suffixes and escape methods therefore acquire required keys automatically.

Full compatibility runs additionally load CN, DE, ES, JP, KR, PL and RU from the final ZIP through the native Mod translation path, using a fresh runtime for each language. Every CSV entry must resolve through `TextGet` to its packaged value. Language checks use the same game builds, official commit and ZIP hash as the behavior checks; their failures fail the full run. The per-version `result.json` retains the language results. PL tests the native Mod CSV path; the official language menu does not expose it. Use `--scenario native-locales` for a focused two-version language check; this remains partial debugging evidence.

Each scene starts with a named native RNG seed. The shared setup and Hunting Grounds fixture seed before new-game initialization and again before the controlled map, so initial map creation cannot consume an inherited random stream. Diagnostic records retain scene, seed, timestamp, resource URL/status and available error stacks. Request records keep the context at request initiation even if a response arrives in a later scene. Asset requests and subsequent render frames settle before switching scenes. A final runtime-error or Mod-asset failure names its gate rather than the last successful scene; the retained diagnostics identify originating resources. Failure traces include current actors and fixture state. These controls improve reproduction without certifying all native artwork as valid.

## Save and evidence diagnostics

For saved-field stalls, unexpected objective completion or persisted Journal discovery, inventory every supplied save slot and visited map before selecting a replay. Saves may retain the fault in `KDWorldMap` after the character moves to another floor. These maintenance tools are excluded from the Mod ZIP.

```powershell
npm run diagnose:save -- '.scratch/case/copied-storage.json' --codec 'D:/KD-reference-inputs/game/Scripts/lib/LZString.js'
npm run diagnose:replay -- --save '.scratch/case/copied-storage.json' --slot 7 --runtime '<cache>/runs/<run>/baseline/result.json' --package './Spiderlings_<version>.zip' --location '0,6' --center '23,29' --turns 80
npm run diagnose:evidence -- '<cache>/runs/<run>/baseline/result.json' field-command
```

Save inventory accepts a native base64 export, decoded save JSON or an object with `slots[].content`. Encoded content uses the selected game's supplied codec. Inventory prints map/objective/field counts and selected AI types, without player identity or equipment. Replay requires a compatibility runtime result and a package; it uses isolated browser storage and native save/map loading. Omitting `--location` inspects the current saved map. `--room` selects a cached side room. `--center` moves the copied character into the selected project's center. `--isolate-mobile-npcs` removes other mobile NPCs only in the copy; report this intervention when interpreting results. Returning to a cached map uses current saved character state and does not reconstruct the original screenshot's exact time. Output goes to a new directory under this checkout's `.scratch`; `--output` selects a new path there. Input files and the desktop profile are not written.

Use `REPORT.md` for overall delivery gates. The evidence command reads one native scene or a saved-turn record and projects status, seeds, counts, paid turns, phase changes and evidence paths. Oversized row/image lists report their omitted count; detailed state remains in the source JSON. Raw recorded error counts are diagnostic counts, not a replacement for the report's pass/fail status.

File-based maintenance batches can use `npm run run:task -- '.scratch/case/plan.json'`. A plan has a nonempty `steps` array with `id`, executable `command` and string `args`. It reuses `delivery-commands.run`, preserves UTF-8 and stops at the first failure. Use executable binaries such as `node`, `git`, `gh` or PowerShell; shell expressions inside arguments remain literal. JavaScript authors can reuse `readJson`, `writeJson` and `writeText` from `tools/task-runner.js` for exact file bodies.

For an already authorized GitHub write step, add `githubAccount` and `verify: { command, args, expected }`. Expected fields are exact JSON values addressed by dotted paths, for example `object.sha`. Identity-read failure, account mismatch, command failure and readback mismatch are distinct; each stops subsequent steps. This runner executes the supplied plan and does not create authorization to merge, publish or contact others.

The `saved-field-guard` native regression is an anonymous retained enclosure with actual borrowed guard AI, paid repair/closure and native-hit Capture. The `hunting-objective-entry` scene covers cancelled generation and a stale objective type in a saved map. Focused runs remain partial; final delivery still uses full dual-version acceptance and the existing collector.

## Text changes

Run the read-only text audit against an explicit baseline to list changed text, structural differences and test references before the final package build:

```powershell
npm run audit:text -- --base HEAD
npm run audit:text -- --base HEAD --target staged
npm run audit:text -- --base <before-commit> --target <after-commit>
```

The default target is the working tree, including staged edits. Compare placeholder counts and existing per-line separators, and run the referenced test files with the existing Node test runner. Test references are literal matches; computed keys and escaped assertions still require caller review. Ambiguous strings and changes to keys, IDs, resource paths or event names require review; the audit only excludes text arguments at recognized registration points. Other manifest payload changes also require review. `--text-only` exits nonzero when these mechanical checks require review; it does not establish that descriptions match native behavior. Complete independent review of effect-bearing text in every affected language before freezing source for the final ZIP and acceptance. Verification scope remains governed by [CONTRIBUTING.md](../CONTRIBUTING.md#verification).

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

Develop against `test`, preserving the formal baseline and increasing `-test.N` for each test delivery. Fixes intended for formal users go to `main` and are carried into `test` as needed. Promoting test gameplay requires the requested acceptance and the next formal version after the current `main` version. Current `main` is `0.92.38`, so the next ordinary formal release is `0.92.39`; do not promote by merely deleting the test suffix from `0.92.36-test.13`.

Keep commits focused and link the applicable Issue. Publishing only these initial snapshots does not migrate the original workspace's Git history, game files, personal configuration or scratch logs.

## Releases

This section owns the publication policy. Formal releases use `main` after accepted changes merge. Test deliveries normally use a versioned local ZIP or CI artifact. An explicit request for a test Release authorizes a `v<modbuild>` tag and GitHub Pre-release, with `--prerelease --latest=false`; preserve the current formal Latest and existing assets. Both channels require the exact accepted package and successful CI for the reviewed source commit.

Record the release source and integration endpoint before writing: an integrated `test` commit or an explicitly retained development-branch candidate. Publishing a development candidate does not merge its PR or complete Issues that require integration. A formal release must be integrated into `main`. A request to publish a test version does not promote it to formal.

For a formal release, identify the successful `Repository checks` run for that exact `main` commit and download its `spiderlings-<commit SHA>` artifact. Verify the contained ZIP against the same checkout, run the required package and in-game acceptance on that file, and record its SHA-256. For an unchanged accepted test package, reuse matching verification and native evidence rather than rebuilding it under the same version.

Push `v<modbuild>` to the reviewed commit and read the remote tag back. Create the Release with `gh release create v<modbuild> Spiderlings_<modbuild>.zip --verify-tag --notes-file <file>`, attaching the exact ZIP that passed acceptance. Add `--prerelease --latest=false` for explicitly authorized test publication. Verify the configured GitHub account before each remote write, and confirm each write by readback before continuing.

Prepare the notes file in UTF-8 with complete `## English` then `## 简体中文` sections, following the [bilingual Release requirements](../CONTRIBUTING.md#formal-promotion-and-releases). Compare the two sections against the delivered changes and verified compatibility evidence. Pass that reviewed file to `--notes-file`.

Use the existing collector for source/package verification and the publication verifier after upload. The latter reads the configured `origin`, verifies the remote tag, channel, notes and Latest, and waits for a successful download before comparing size and SHA-256. Each download uses a new `.scratch/publication/` directory and preserves previous files. It does not publish or modify GitHub state.

```powershell
npm run verify:publication -- --tag v0.92.36-test.113 --commit fdeed648ab0f918fc9a0b537eaed1a58451975a4 --notes .scratch/release-test113-notes.md --latest v0.92.38
```

Supply the actual tag, full reviewed commit, notes file and expected formal Latest. Formal verification omits `--latest` and requires the formal tag to be Latest. `--package` selects an existing accepted ZIP; no build or overwrite occurs. Commands use structured argument arrays and the established `-VerifyOnly -PackagePath` package verifier. For official-game checks, use `npm run test:compatibility` and its configured cache; read the cache's `origin` for diagnostics rather than guessing a repository URL.

Finish with the [per-Issue closeout audit](DELIVERY-EVIDENCE.md#issue-closeout), record the publication/download evidence, and resolve each Issue against its own condition. Report any retained draft PR and remaining integration or acceptance work alongside the Release result.

Preserve existing release assets and tags. The repository's Source code downloads contain maintenance files and a nested Mod directory; direct players to the attached installable ZIP.

For a manual verification after repository maintenance, run the `Repository checks` workflow on the selected maintained branch. Manual runs compare against their own checked-out commit and still run policy/public tests and package verification. An unchanged root-directory move is exempt from retroactive content formatting/linting; modified files and all path, manifest and delivery checks remain enforced.

### File preparation and structured closeout

A task plan may include `prepare: [{ id, script, args }]` for JavaScript file scripts. The runner syntax-checks every preparation file before executing any generator, then completes all preparation before its main steps. `verify.expectedFile` reads a generated JSON object before any main command. Existing inline `verify.expected` plans remain supported. Prefer a checked file generator for PR text and expected readbacks; pass the body with `--body-file`. Preparation failures stop the plan.

`npm run audit:closeout -- closeout.json --output result.json` writes the same structured result returned on stdout. Exit 0 means acceptance passed; exit 1 means the collected evidence fails acceptance; exit 2 means invalid input or an unavailable read/output. Inspect `status`, `phase` and `errors` from the file instead of parsing truncated console output. The output cannot overwrite the input.

Native scenarios share `normalAcceptance.registerPackagedScript(filename)` for re-registration from the actual loaded ZIP and `withPopulationBudget(kind, cap, action)` for budget exhaustion at the production boundary. The latter restores the original function even when its asynchronous callback fails. These helpers change fixture setup, not the assertions.
