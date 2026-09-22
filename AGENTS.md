# Spiderlings repository

Read `KinkyDungeon-Spiderlings/AGENTS.md` before changing the Mod and its documentation. Its `tools/AGENTS.md` governs private maintenance scripts.

For implementation, formatting, commits, PRs or publication, read `CONTRIBUTING.md`. It defines the JavaScript runtime and JavaScript/Python/PowerShell tool language policy, incremental code conventions, single-maintainer PR gates and verification scope. Changes to `main` and `test` go through PRs; no second-person approval is required. Keep formatting cleanup in separate commits.

Markdown-only changes may use descriptive commit/PR titles without Conventional Commit prefixes or Issue boilerplate. Apply this exception to each documentation commit even when it is carried into a mixed PR; code/configuration changes retain the full metadata checks.

`KinkiestDungeon-5.5/` is a read-only local game reference. Never edit, generate files or install dependencies there. Logs and temporary output belong in `.scratch/`. Original artwork reference directories are local inputs, excluded from Git.

For issues, specs, implementation tickets, triage and wayfinding, read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`. GitHub Issues is authoritative. Existing local records remain historical evidence. For domain changes, read `docs/agents/domain.md` and `CONTEXT-MAP.md`.

`main` holds formal releases; `test` holds test development. Only formal versions receive GitHub Releases. Read `docs/DEVELOPMENT.md` for setup, validation, version promotion and publishing. Use project-local skills in `.agents/skills/` before same-name global skills.

Preserve unrelated working and staged changes. Complete authorized local work and relevant checks without repeated approval. Commit only the task changes after required checks. Communicate with the user in their preferred language.

Maintain `README.md` in English and `README.zh-CN.md` in Simplified Chinese as equivalent versions, with reciprocal links at the top and matching installation, version and download information.

For library, SDK, API or CLI usage questions, fetch current documentation through Context7 first; if unavailable use the official source. Ordinary business-logic work does not require a documentation lookup.
