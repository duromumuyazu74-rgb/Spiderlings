# Source directory and history migration

The active source directory is `KinkyDungeon-Spiderlings/`. The former `Spiderlings_0.91/` name remains only in historical evidence, migration tests and private-path exclusions. Mod identifiers, save keys, manifest contents and ZIP entry names are independent of this directory name and are preserved. Existing `0.92.38` and `0.92.36-test.14` packages verify against the relocated sources without rebuilding.

Build scripts, npm commands, CI, Dependabot, ESLint, package rules and current document links use the new directory. Byte-identical directory moves do not trigger retroactive formatting or lint changes to otherwise untouched runtime files. Changed contents and all delivery checks still run.

The eleven private authoring files and the five relocated aliases are excluded from the public tree. The authorized history rewrite removes these paths from writable repository history, with mirrors and ref/commit mappings retained in private local storage. Once the rewrite is verified, `historySanitized` in `.github/repository-policy.json` enables a branch-history check so an old clone cannot silently merge those paths back through its ancestors.

After a history rewrite, refresh a clone from the rewritten remote history. Preserve uncommitted and unpublished work before changing local refs. Do not merge the old branch history into the rewritten branch. Retained worktrees and the local game/art inputs are not deleted by this migration.

GitHub pull-request refs are read-only. Rewriting branches and tags does not erase old PR references, cached commits, or other people's clones. Platform-only cleanup is recorded separately; GitHub Support decides whether a cache-removal request is eligible. This document does not certify that those copies have been removed.

For verified game-code and artwork licensing boundaries and the recommended next steps, see [license review](LICENSE-REVIEW.zh-CN.md). The directory name does not grant or change a license.
