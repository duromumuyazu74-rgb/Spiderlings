# Spinner prototype review and handoff

This package implements the prototype stage of [Spec #20](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/20). The installable Mod payload is unchanged. Download and open the [offline experiment](prototypes/spinner-topology/index.html); the [README](prototypes/spinner-topology/README.md) explains the controls and reproducible commands.

## Delivery state

| Ticket                                                             | Delivered                                                                                        | State                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| [#21](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/21) | Portable source, offline HTML, sanitized native snapshots and artifact-bound browser evidence.   | Implemented in PR #25.                                      |
| [#22](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/22) | Native geometry comparison, corrected placement/lifecycle behavior and bounded counterexamples.  | Investigation implemented; limitations explicitly retained. |
| [#23](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/23) | 37 replayable construction/breach cases, including arrival-inclusive and on-site worker scaling. | Implemented; no final balance claim.                        |
| [#24](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/24) | This review package, remaining gaps and ordered integration handoff.                             | Accepted for runtime integration on 2026-09-21.             |
| [#27](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/27) | Shared physical-segment graph, focused damage replays and final-owner collapse evidence.         | Implemented as the first runtime dependency.                |

## Review four sequences

1. **Room prebuild and closure.** Use the default room, prebuild with the entrance open, place the target in the core with the explicit debug button, then close. Inject single-cell or area damage and inspect both the boundary-escape path and the floor-exit path.
2. **Nested fields.** Use the inner/outer walkthrough. The gates share a core; breaking only the inner layer leaves the outer barrier. Early target entry no longer permits simultaneous inner/outer prebuilding.
3. **Actual-map interception.** Expand native snapshots. The corrected conservative model selects a line in all six maps. In the third 5.5.0 sample, the stationary debug lure can block an anchor. Use the occupancy walkthrough to observe waiting, then explicitly vacate the lure; do not interpret that intervention as working lure AI.
4. **Shared destruction.** Two identical fields reuse HP and physical cells. Attack an anchor and observe both owners.
5. **Partial overlap durability.** Use the guided walkthrough to inspect the one shared span between adjacent closed boundaries. Compare an ordinary cell hit, a 3x3 area hit and a real-anchor hit, then remove owners in sequence and observe the 20-turn collapse boundary.

The [shared durability decision](prototypes/spinner-topology/DURABILITY.md), [placement investigation](prototypes/spinner-topology/PLACEMENT.md) and [pacing investigation](prototypes/spinner-topology/PACING.md) contain the detailed inputs, counterexamples, commands and limitations.

## Evidence and observed changes

The immutable [initial published baseline](https://github.com/duromumuyazu74-rgb/Spiderlings/tree/27dca6dce33310c016a4f36037ee3a47936233fe/docs/prototypes/spinner-topology) preserves ten fixed scenes and six isolated native-map snapshots. Its room and nested prebuild observations were about 50 and 113 prototype world turns. The current engine completes those original three-actor room and four-actor nested fixtures in 22 and 42 turns.

- [Artifact verification](prototypes/spinner-topology/evidence/verification.json): 16 map walks, five additional experiments, offline controls, nested/shared flows, state restoration, 390px layout, and the new occupancy/interior-change walkthroughs.
- [Placement evidence](prototypes/spinner-topology/evidence/placement.json): 17 bounded cases, six-map mask comparisons and eight isolated native-accessibility probes against exactly KD 5.4.92 and KD 5.5.0.
- [Immutable pacing baseline](prototypes/spinner-topology/evidence/pacing-baseline/summary.json): all 34 cases, including three failing historical contract observations.
- [Corrected pacing](prototypes/spinner-topology/evidence/pacing/summary.json): all 37 replays and all twelve contract checks pass. The separate [current-results note](prototypes/spinner-topology/CURRENT-PACING.md) explains the differences.
- [Shared durability](prototypes/spinner-topology/evidence/durability/summary.json): twelve topology-and-damage replays, one partial-boundary breach and staggered owner loss. All seven contract checks pass.

On the same pinned room candidate, two/four/eight actors now take 27/20/18 turns including travel, down from 98/42/42. Separate fixtures starting at legal worksites take 12/6/4 turns. All unaware members build; workers coordinate assignments, construct within five clear tiles and reuse anchor endpoints. Construction costs one budget point while movement and repair retain 1.5. A short link still needs a paid connection. The two-worker result meets the requested 30-turn deadline. The offline page displays both timing conditions.

Travel limits the total-time improvement. The narrow-corridor fixture takes 16/16/18 turns with two/four/eight actors, so crowding can still make a larger group slower. Four/eight actors complete the two-layer candidate in 42/37 turns. These are deterministic model results, not measured native encounter balance.

Three historical defects are corrected: premature outer construction after early target entry, repairs to retired-only structures, and shared collapse timed from an earlier lost owner instead of the final owner. In the current early-entry fixture, the inner layer is ready at turn 19 and outer work starts at turn 20. Closure takes 52 further turns after entry at turn five. Damage and HP parameters remain unchanged.

Independent review previously found and corrected two further defects. Reachable-area shading now shows the full connected region instead of stopping its search at the exit. A retired owner no longer vetoes another live owner's intact shared field. Both cases have bounded model checks and offline browser assertions.

Issue #27 resolves the retained partial-collinear mismatch. The engine now merges owner paths into one unit-edge graph and coalesces maximal collinear spans only while the owner set stays unchanged. Original endpoints remain real anchors. Ownership splits and crossings are graph junctions without added anchor HP or full anchor damage. Shared structures retain one HP record, and only final-owner loss starts their 20-turn collapse clock.

The old five-line/one-rectangle sample result becomes six lines after free-core checks account for a foreign actor in the former sole rectangle. The original five maps still lack a current enclosure template even when protection/occupancy masks are relaxed. Neither result is a floor-frequency estimate; frozen original actors and the restricted template family matter.

## Remaining gaps and recommendation

**Do not adopt this prototype directly as runtime gameplay.** The evidence is ready for a design review, with these boundaries:

- Candidate selection still prefers legal enclosures before lines within the explicit template catalog. Full source-dependent strategic scoring, richer outlines, live lure coordination and group formation are not implemented.
- Closed-door traversal and conservative locked-cell handling match the bounded accessibility probes, not every native enemy lock/faction permission. The fixed-lure stall remains visible.
- Debug damage bypasses real hit, range, weapon and resource checks. Native cache invalidation, actor swaps, capture, equipment, eight-source dragging and save behavior remain unproven.
- Native helpless NPCs without help can skip ordinary self-struggle. High binding does not imply guaranteed unaided recovery.

The shared-field contract is ready for the first native integration slice. Continue to stage native adapters and gameplay behavior instead of transplanting the demo wholesale. The focused evidence settles topology, ownership and damage accounting; it does not prove native hit legality or balance.

## Native integration handoff

Subject to the recorded review verdict, subsequent work should follow these behavioral boundaries:

1. Owned anchors/links, legal navigation, shared topology and map save state, exercised by the test-only scenario room.
2. Stable groups, unalerted prebuilding, one lure and paid construction actions under moving occupants and target loss.
3. Player Capture strands, independent leg-bag equipment, real recovery leash and native NPC binding adaptation.
4. Versioned test delivery with actual-game behavior, save/load, package and numerical checks.

Keep one-source continuation/wrapping, zero-source release, six-turn participant stun without capture cooldown, and field geometry independent from an already-admitted capture. Existing native and foreign item/tether ownership must remain intact.

## Maintainer verdict

**Accepted for runtime integration on 2026-09-21.** The maintainer's direct workspace instruction authorized the implementation workflow recorded in [#24](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/24). Runtime work follows #26 and #27 through #38. The parent Spec #20 remains open, and formal release remains out of scope.
