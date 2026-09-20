# Contributing

Spiderlings has one independent maintainer. The same checks apply to the maintainer and coding agents. Player reports are welcome in any language.

## Languages

- Runtime Mod code is plain JavaScript, loaded through the manifest in the native KD global environment. Keep shared state in the existing Spiderlings namespace and document compatibility hooks.
- Maintenance code may use JavaScript, Python or PowerShell. JSON, CSV, Markdown, HTML/CSS, workflow configuration and artwork retain their existing data, documentation and preview roles. Adding another programming language requires a deliberate policy change. The existing artist-kit CMD launcher is grandfathered; new launchers use PowerShell.
- Identifiers, new comments, commit subjects, PR descriptions and development records use English as the primary language. Chinese may supplement them. Explain why a compatibility workaround exists rather than restating the code.
- Keep `README.md` and `README.zh-CN.md` synchronized, with language links at the top. Preserve game localization and historical records in their original languages. Player feedback has no language restriction; do not reject a report based on language.

## Code conventions

Prettier owns JavaScript, JSON, YAML, Markdown, HTML and CSS layout. JavaScript uses four spaces, double quotes, semicolons, trailing commas and a 120-column target. JSON/YAML/Markdown use two-space indentation. Keep existing runtime line endings; use LF for new files. Generated atlas JSON and self-contained generated preview pages are excluded from formatting and remain subject to their builders and delivery checks.

ESLint checks changed JavaScript for actionable mistakes, including undefined names, accidental assignments in conditions, unused bindings and debugger statements. Native KD globals are explicitly listed in `.github/kd-globals.json`; verify new names against the supported game version before adding them. Use strict equality except deliberate null checks or documented native coercion. Python and PowerShell use four-space indentation and receive syntax checks when changed.

Use descriptive names and preserve established module boundaries. Keep public interfaces small, handle errors at the boundary that can act on them, and add regression coverage for changed behavior. Avoid unrelated cleanup and arbitrary function-size rewrites. Runtime scripts must preserve native load order, save compatibility and Mod ownership rules.

Checks apply to added or modified files relative to the target branch. Existing untouched files are not reformatted or linted retroactively. When a file needs formatting to adopt the convention, put that cleanup in a separate `style:` commit before the behavior change. Never run a formatter recursively over the game or original artwork inputs. Formatting runtime files still changes package bytes and follows the versioned delivery rules.

## Issues, commits and PRs

1. Track nontrivial work in a GitHub Issue with scope and acceptance criteria. Player reports can use any language; write the implementation brief primarily in English.
2. Branch from `test` for development, or from `main` for a formal-only fix or maintenance change. Use `feat/<issue>-<slug>`, `fix/<issue>-<slug>` or `chore/<slug>`.
3. Commit focused changes using `type(scope): English summary`; scope is optional. Types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`. Example: `fix(webbing): preserve escape progress`.
4. Open a PR to the intended branch. Use the same subject format for its title. CI validates the PR title and all new commit subjects; existing migration commits are explicitly grandfathered in the policy configuration. Link an Issue with `Refs #N`. A small maintenance correction may instead explain `Issue: none - <reason>`.
5. Record relevant tests, results and delivery artifacts in the PR. Inspect the diff, pass `Repository checks` against the current target branch, and resolve review conversations. The sole maintainer can rebase-merge their own PR; required external approvals are zero. Rebase merging preserves separate formatting and behavior commits. Update a stale feature branch by rebasing it onto its target before rerunning checks.

Both `main` and `test` require PRs and the GitHub Actions `Repository checks` status. The target branch must be up to date for merging. Direct pushes, force pushes and deleting these branches are blocked, including for administrators. GitHub settings can still be deliberately changed by the owner; repository rules are not a substitute for account ownership.

The intended remote configuration is recorded in `.github/branch-protection.json` and `.github/repository-settings.json`. Updating these files alone does not update GitHub settings; apply and read back any requested settings change through the repository API.

Public English requirements are review conventions. CI does not try to identify natural language or scan player reports. It validates supported file types, syntax, formatting and PR subject structure.

## Verification

Use Node.js 24 and install the locked maintenance dependencies with `npm ci`. From the repository root:

```powershell
npm run check -- --base origin/test
npm test
npm run test:public
```

For a change targeting `main`, use `--base origin/main`. `check` includes staged, unstaged and untracked files that are not ignored. It also validates the two README language links and manifest file availability. Format only the named changed files with `npx prettier --write <file...>`.

GitHub CI runs the same source checks, the policy-checker tests, and the self-contained webbing cutover, cocoon and enemy regressions. The test branch additionally runs its Spinner artwork regression. This is a public-source subset, not the complete KD compatibility suite.

Gameplay, asset and package changes also require the existing full local watcher and the owning Mod's delivery gates. Those tests require the read-only official game source and original artwork folders, which CI does not distribute. Put the complete watcher result and any required in-game evidence in the PR. Documentation and repository-tooling changes do not require a new Mod version or ZIP when runtime files are unchanged.

## Formal promotion and releases

Keep test delivery versions on their formal baseline with increasing `-test.N`. Promote accepted gameplay through a PR to `main` with the next formal version and complete local delivery evidence. Shared maintenance or hotfix changes can be carried between branches through focused PRs without promoting unrelated test gameplay.

Only formal versions receive a `v<modbuild>` tag and a Release. Publication remains an explicit maintainer action after verification; a PR merge alone does not publish a Release or authorize an agent to publish one. Preserve existing tags and ZIPs. See [development and publishing](docs/DEVELOPMENT.md) for build details and [Issue operations](docs/agents/issue-tracker.md) for the Matt Pocock workflow.
