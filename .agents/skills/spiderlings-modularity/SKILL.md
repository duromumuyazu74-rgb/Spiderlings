---
name: spiderlings-modularity
description: Change Spiderlings field ownership, shared native actions or native scenario environments using the project's module contracts and focused verification.
---

# Spiderlings module work

Resolve the active Spiderlings checkout from the session and Git worktrees. Read its AGENTS.md, `docs/MODULES.md` and the relevant existing ADR. Use the implementation being changed, not an older checkout's module map.

1. Name the state owner and observable behavior being changed. Read its callers and the state-owner rules in `tools/module-contracts.json` and verification profiles in `tools/test-impact.json` under the Mod package. Record the starting commit and existing worktree changes, keeping task scope distinct from broader verification of a dirty candidate. Existing authorized scope and agreed interfaces are sufficient to begin.
2. Put the domain transition in its owner. Callers submit intent or consume detached facts/results. Preserve saved-state and paid-action semantics. New exports need an actual caller and domain purpose; moving implementation does not require exposing every helper.
3. For native actions, register domain behavior with NativeActions and verify ordering/fallback through that seam. For native tests, distinguish helper code from state continuation and let the shared environment own preparation and teardown. Keep permit-population tests on real population.
4. Run `check:modules`, then preview `test:affected -- --base <starting-commit> --plan`. Check each selection reason, resolve unmapped inputs with evidence and retain real consumers. Run the selected public tests; use `--include-local` for applicable game/art-source contracts. Native game scenes are recommendations, executed separately when needed. Proven field edits may narrow by behavior; shared or structural edits retain owning-file coverage. Reuse passing checks unless relevant inputs change or new failures justify repetition. Focused results do not replace applicable final delivery gates.
5. If an independent scene fails during final validation, identify the tested package, game and scenario-script versions, then reproduce it and its declared state chain. Inspect existing readiness/waiting logic and prove why it failed before adding another fix or editing assertions. Keep a separately caused test-maintenance correction identifiable in its own commit and evidence.
6. For implementation or delivery tasks, complete the owning CONTRIBUTING verification matrix and applicable versioned delivery rules on the final source/ZIP. Report implemented owner changes, observable regressions and the actual result. For an explanation or review request, report findings and proposed next work within that scope.

Use `docs/MODULES.md` as the maintained responsibility reference. Extend executable contracts when an actual cross-owner write or registration leak can be checked mechanically. Keep broader design judgement in review instead of adding generic prohibitions or a new framework.
