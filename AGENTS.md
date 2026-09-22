# Spiderlings repository

Read `Spiderlings_0.91/AGENTS.md` before changing the Mod and its documentation. Its `tools/AGENTS.md` governs private maintenance scripts.

For implementation, formatting, commits, PRs or publication, read `CONTRIBUTING.md`. It defines the JavaScript runtime and JavaScript/Python/PowerShell tool language policy, incremental code conventions, single-maintainer PR gates and verification scope. Changes to `main` and `test` go through PRs; no second-person approval is required. Keep formatting cleanup in separate commits.

Markdown-only changes may use descriptive commit/PR titles without Conventional Commit prefixes or Issue boilerplate. Apply this exception to each documentation commit even when it is carried into a mixed PR; code/configuration changes retain the full metadata checks.

`KinkiestDungeon-5.5/` is a read-only local game reference. Never edit, generate files or install dependencies there. Logs and temporary output belong in `.scratch/`. Original artwork reference directories are local inputs, excluded from Git.

Before creating or removing a worktree, read the worktree section of `docs/DEVELOPMENT.md`. Keep game/art inputs outside checkouts through `spiderlings.referenceRoot` or `SPIDERLINGS_REFERENCE_ROOT`, and install each checkout's dependencies locally. Shared-input junctions are forbidden. Lock retained worktrees; remove disposable worktrees only through `Spiderlings_0.91/tools/remove-safe-worktree.ps1`. A refusal is a stop condition, not permission to use force or another recursive deletion command.

For issues, specs, implementation tickets, triage and wayfinding, read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`. GitHub Issues is authoritative. Existing local records remain historical evidence. For domain changes, read `docs/agents/domain.md` and `CONTEXT-MAP.md`.

`main` holds formal releases; `test` holds test development. Only formal versions receive GitHub Releases. Read `docs/DEVELOPMENT.md` for setup, validation, version promotion and publishing. Use project-local skills in `.agents/skills/` before same-name global skills.

Preserve unrelated working and staged changes. Complete authorized local work and relevant checks without repeated approval. Commit only the task changes after required checks. Repository development records use English primarily; communicate with the user in their preferred language. Player feedback is accepted in any language.

Public repository text is English first, with Simplified Chinese as the secondary language. Keep `README.md` in English and `README.zh-CN.md` in Chinese, with reciprocal language links at the top and matching installation, version and download information. New release notes and public workflow documents lead with English; preserve the language of historical evidence.

For library, SDK, API or CLI usage questions, fetch current documentation through Context7 first; if unavailable use the official source. Ordinary business-logic work does not require a documentation lookup.
