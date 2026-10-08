# Module ownership and focused verification

This document owns implementation responsibilities for field coordination, native actions and native scenario environments. Domain meanings remain in [GLOSSARY.md](../KinkyDungeon-Spiderlings/GLOSSARY.md). [CONTRIBUTING.md](../CONTRIBUTING.md#verification) owns final delivery gates.

## Runtime state

| Module             | Owns                                                                                                                                     | Collaborators receive                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| FieldProjects      | Project lifecycle, permits, plan/structure association, work reservations, maintenance admission, rally positions and paid work outcomes | Work snapshots, project decisions and execution results                             |
| FieldCommand       | Member identities, unique current commander, requests, loans, regional orders and returns                                                | Command/staffing facts and domain transitions for changing demand or ending support |
| SpinnerAI          | Observations, map/path facts, candidate geometry and tactical decisions                                                                  | Planning and movement facts; legacy work entry points delegate to Projects          |
| SpinnerDuties      | One current action decision, its validity and native phase admission                                                                     | The same decision across movement, attack and spell phases                          |
| SpinnerTopology    | Physical structure and work transitions                                                                                                  | Validated structure/work outcomes                                                   |
| SpinnerNativeField | Native projection/payment and atomic project-structure replacement                                                                       | Commit or failure; rollback and residual conversion stay inside this adapter        |

`FieldProjects.beginWork` revalidates maintenance source release and the assignment together. `workFor` returns a detached assignment, so Duties does not mutate project storage. Request closure belongs to Command's demand transitions. NativeField's structure transaction preserves the previous graph and project on failed replacement. These operations replace cross-module field writes; they are not general setters.

The saved schema remains compatible. Physical web ownership is distinct from current command, and a temporary worker shortage is distinct from project retirement. Keep the native paid-action and actual-source rules from ADR-0024 and ADR-0025.

## Shared native actions

`SpiderlingsNativeActions.js` owns installation of common AI movement, after-movement, attack and spell phases, enemy-loop action dispatch and contact observation. Its interface is `registerBehavior(owner, behavior)` and `install()`.

WebCaster registers its hunt movement/direction preference, Webbing registers Cocoon movement, and the enemy catalogue registers rivalry after-movement. Domain modules own behavior; NativeActions owns ordering, native fallback, call context and phase admission. Re-registering an owner replaces that strategy without nesting another hook.

SpinnerRuntime retains field/map and Capture/Recovery lifecycle events and invokes the late installer. Capture, Recovery and NPCWrapping retain their own state and transitions. Combat and NPCAdhesion retain existing enemy-loop observation adapters; WebMobility retains the outer native direction adapter. They do not become alternate action commanders.

Adding a species policy uses the shared registration seam. A shared action-admission change also exercises registered behaviors and native fallback. A species-policy change starts with that species' focused checks.

## Native scenario environments

The scenario registry distinguishes `helpers`, which load code, from `continues`, which requires a preceding scenario's live state. The runner builds a fresh runtime for each state group. Each group loads and verifies the same ZIP; continuation checks stay in their prerequisite's runtime. The existing Spinner capture/art chain and rune/overlay chain remain explicit.

Preparation, diagnostics and teardown belong to the runner and `normalAcceptance`. Scene/helper/native/teardown failures identify the group and initiating check. The runtime is closed in `finally`, including diagnostic failures. Per-group package hashes and evidence are retained in the game report.

Before a native save, the shared helper initializes a missing player model through native dress/render calls. Existing model poses are retained and world time is not advanced. Saving a fresh scene therefore does not depend on another scene's earlier character render.

Construction scenarios use `prepareCrew` to declare actors and required field permits. Its result distinguishes actors, actionable Spinners, population and reserves. Reserves occupy a disconnected test-owned pocket, preserving the original work map's width, coordinates, cells and exits, or explicit isolated cells supplied by the scene. Permit-boundary and normal-population scenarios retain their actual population and do not request top-up. This preparation does not override production rules.

Visual checks await the actual native visual stage through the shared render helper. Waiting advances rendering, not world turns, and does not set opacity or replace the asserted texture. The scene retains its original observable assertions.

## Executable contracts and development loop

`tools/module-contracts.json` records guarded state owners, native hook owners and focused test mappings. `npm run check:modules` checks the manifest's runtime files. Repository `check` runs it too. The AST audit covers named domain records, collection access, lexical aliases, computed literal fields, deletion, collection mutation and `Object.assign`; it is a targeted ownership check, not a proof against arbitrary reflection.

Use `npm run test:affected -- --base <starting-commit>` during implementation. It uses the existing public test registry, runs mapped public files, and reports native follow-up scenes through the existing scenario selector. Shared or unclassified code changes retain full public coverage. Test-file edits include those tests. Documentation-only changes use the repository checks specified by CONTRIBUTING.

Run the reported native scenes with the existing `test:compatibility -- --scenario ...` command when verifying a runtime seam. Those results remain partial. The final frozen ZIP still requires complete native acceptance on both supported targets and the full delivery collector.

When an unrelated final scene fails, isolate that scene and any declared continuation, compare with the previous package where useful, and fix the demonstrated cause. Record an independent test-environment fix separately from gameplay changes. Fixture changes preserve the behavior and strict assertions the scene claims to verify.

## Review criteria

- Follow a changed invariant to its state owner. Callers submit intent or consume detached facts/results instead of writing another owner's records.
- Review new exports for their callers and domain operation. Keep moved implementation private where no caller needs it.
- Check native registration order and fallback through the shared adapter, including zero-time updates, defined false results and one paid action.
- Check scene independence through fresh runtime groups and explicit continuation metadata; a helper dependency does not imply shared live state.
- Keep current behavior evidence distinct from historical acceptance and the next final package.
