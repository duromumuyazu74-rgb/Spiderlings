# Dependency updates

`.github/dependabot.yml` monitors npm at the repository root, the Python atlas requirements in `Spiderlings_0.91/tools`, and GitHub Actions. It proposes weekly updates on Mondays at 09:00 Asia/Shanghai for the default `main` branch and at 09:30 for `test`. Updates are grouped by ecosystem, with at most two ordinary open PRs per ecosystem and branch.

Dependency alerts and Dependabot security-update PRs use the default branch. The `test` entries schedule version updates; they do not provide security-update coverage for that branch. When a security fix lands on `main`, review the matching dependency versions on `test` and carry the dependency-only fix promptly instead of waiting for the weekly check. Do not merge either branch wholesale to synchronize dependencies.

Dependabot uses `chore(deps):` subjects. The repository checker exempts only PRs authored by GitHub's `dependabot[bot]` identity that change the approved manifests, lockfile or workflow files from the manual Issue-link requirement. Titles, commit subjects, syntax, formatting, tests and package checks still apply. A bot PR that changes runtime code or maintenance scripts needs normal Issue metadata. No automation merges PRs or publishes Releases.

Before merging:

1. Read the upstream release notes and security advisories. Check Node.js 24 and Python 3.12 support, changed action permissions, and any changed native/build requirements.
2. Run the applicable checks from `CONTRIBUTING.md` on the proposed branch. CI must rebuild the atlas without a tracked difference and verify the candidate ZIP. A dependency update that changes shipped bytes needs a deliberate new Mod version and its delivery checks.
3. Review the other maintained branch. Reuse the dependency change only when its toolchain is compatible, and verify its own PR. Record any intentional difference rather than silently leaving a security fix behind.
4. Recover a failed update by reverting its focused commit through a PR. Keep the previous ZIP and evidence; never replace a published package to hide a build regression.

Sources: [Dependabot configuration](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference), [supported ecosystems](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories), and [customizing update PRs](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/customizing-dependabot-prs), checked 2026-09-22.
