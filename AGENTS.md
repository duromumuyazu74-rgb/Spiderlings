# Spiderlings repository

Read `KinkyDungeon-Spiderlings/AGENTS.md` before changing the Mod and its documentation. Its `tools/AGENTS.md` governs private maintenance scripts.

For implementation, formatting, commits, PRs or publication, read `CONTRIBUTING.md`. It defines the JavaScript runtime and JavaScript/Python/PowerShell tool language policy, incremental code conventions, single-maintainer PR gates and verification scope. Changes to `main` and `test` go through PRs; no second-person approval is required. Keep formatting cleanup in separate commits.

For runtime delivery, follow its mandatory dual-version acceptance: KD 5.4.92 plus a freshly fetched official GitHub `5.5` commit. Setup and the repeatable command are in `docs/DEVELOPMENT.md#dual-version-runtime-acceptance`.

Markdown-only changes may use descriptive commit/PR titles without Conventional Commit prefixes or Issue boilerplate. Apply this exception to each documentation commit even when it is carried into a mixed PR; code/configuration changes retain the full metadata checks.

`KinkiestDungeon-5.5/` is a read-only local game reference. Never edit, generate files or install dependencies there. Logs and temporary output belong in `.scratch/`. Original artwork reference directories are local inputs, excluded from Git.

Before creating or removing a worktree, read the worktree section of `docs/DEVELOPMENT.md`. Keep game/art inputs outside checkouts through `spiderlings.referenceRoot` or `SPIDERLINGS_REFERENCE_ROOT`, and install each checkout's dependencies locally. Shared-input junctions are forbidden. Lock retained worktrees; remove disposable worktrees only through `KinkyDungeon-Spiderlings/tools/remove-safe-worktree.ps1`. A refusal is a stop condition, not permission to use force or another recursive deletion command.

For issues, specs, implementation tickets, triage and wayfinding, read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`. GitHub Issues is authoritative. Existing local records remain historical evidence. For domain changes, read `docs/agents/domain.md` and `CONTEXT-MAP.md`.

`main` holds formal releases; `test` holds test development. Read `docs/DEVELOPMENT.md#releases` for publication channels, explicitly authorized test Pre-releases and integration boundaries. Use project-local skills in `.agents/skills/` before same-name global skills.

GitHub operations for this repository use **`duromumuyazu74-rgb` only**. Before remote writes to Issues, PRs, branches, workflow settings or Releases, verify the authenticated identity with `gh api user --jq .login`; it must equal `duromumuyazu74-rgb`. If another already logged-in account is active, switch to the named account and verify again before continuing. Commit author configuration does not establish the authenticated GitHub identity. Do not use `Korlne` for this repository's remote operations.

Preserve unrelated working and staged changes. Complete authorized local work and relevant checks without repeated approval. Commit only the task changes after required checks. Communicate with the user in their preferred language.

Maintain `README.md` in English and `README.zh-CN.md` in Simplified Chinese as equivalent versions, with reciprocal links at the top and matching installation, version and download information.

For field coordination, shared native actions or compatibility-harness changes, use `.agents/skills/spiderlings-modularity/SKILL.md` and the ownership contracts in `docs/MODULES.md`.

For library, SDK, API or CLI usage questions, fetch current documentation through Context7 first; if unavailable use the official source. Ordinary business-logic work does not require a documentation lookup.
