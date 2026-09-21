# Spinner prototype review and handoff

This package implements the prototype stage of [Spec #20](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/20). The installable Mod payload is unchanged. Download and open the [offline experiment](prototypes/spinner-topology/index.html); the [README](prototypes/spinner-topology/README.md) explains the controls and reproducible commands.

## Delivery state

| Ticket                                                             | Delivered                                                                                       | State                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [#21](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/21) | Portable source, offline HTML, sanitized native snapshots and artifact-bound browser evidence.  | Implemented in PR #25.                                      |
| [#22](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/22) | Native geometry comparison, corrected placement/lifecycle behavior and bounded counterexamples. | Investigation implemented; limitations explicitly retained. |
| [#23](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/23) | 34 replayable construction/breach cases with immutable baseline and corrected-engine results.   | Implemented; no final balance claim.                        |
| [#24](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/24) | This review package, remaining gaps and ordered integration handoff.                            | Maintainer verdict pending.                                 |

## Review four sequences

1. **Room prebuild and closure.** Use the default room, prebuild with the entrance open, place the target in the core with the explicit debug button, then close. Inject single-cell or area damage and inspect both the boundary-escape path and the floor-exit path.
2. **Nested fields.** Use the inner/outer walkthrough. The gates share a core; breaking only the inner layer leaves the outer barrier. Early target entry no longer permits simultaneous inner/outer prebuilding.
3. **Actual-map interception.** Expand native snapshots. The corrected conservative model selects a line in all six maps. In the third 5.5.0 sample, the stationary debug lure can block an anchor. Use the occupancy walkthrough to observe waiting, then explicitly vacate the lure; do not interpret that intervention as working lure AI.
4. **Shared destruction.** Two identical fields reuse HP and physical cells. Attack an anchor and observe both owners. Also read the partial-overlap limitation below before treating all overlapping webs as solved.

The [placement investigation](prototypes/spinner-topology/PLACEMENT.md) and [pacing investigation](prototypes/spinner-topology/PACING.md) contain the detailed inputs, counterexamples, commands and limitations.

## Evidence and observed changes

The immutable [initial published baseline](https://github.com/duromumuyazu74-rgb/Spiderlings/tree/27dca6dce33310c016a4f36037ee3a47936233fe/docs/prototypes/spinner-topology) preserves ten fixed scenes and six isolated native-map snapshots. Its room and nested prebuild observations were about 50 and 113 prototype world turns. The current engine preserves those normal-case measurements.

- [Artifact verification](prototypes/spinner-topology/evidence/verification.json): 16 map walks, five additional experiments, offline controls, nested/shared flows, state restoration, 390px layout, and the new occupancy/interior-change walkthroughs.
- [Placement evidence](prototypes/spinner-topology/evidence/placement.json): 15 bounded cases, six-map mask comparisons and eight isolated native-accessibility probes against exactly KD 5.4.92 and KD 5.5.0.
- [Immutable pacing baseline](prototypes/spinner-topology/evidence/pacing-baseline/summary.json): all 34 cases, including three failing historical contract observations.
- [Corrected pacing](prototypes/spinner-topology/evidence/pacing/summary.json): all 34 replays and all ten contract checks pass. The separate [current-results note](prototypes/spinner-topology/CURRENT-PACING.md) explains the differences.

Adding actors does not necessarily accelerate work. On the pinned room candidate, two/four/eight actors take 98/42/42 prototype turns. Four/eight actors take 113/81 turns on the two-layer candidate. These are deterministic fixture results with a stationary lure and fixed spawn choices, not measured native encounter balance.

Three historical defects are corrected: premature outer construction after early target entry, repairs to retired-only structures, and shared collapse timed from an earlier lost owner instead of the final owner. The early nested-entry case now takes 120 further turns after entry at turn five, rather than the flawed baseline's 91. No candidate action costs or HP values changed to obtain that result.

Independent review found and corrected two further defects. Reachable-area shading now shows the full connected region instead of stopping its search at the exit. A retired owner no longer vetoes another live owner's intact shared field. Both cases have bounded model checks and offline browser assertions; neither changes the measured construction cadence.

The old five-line/one-rectangle sample result becomes six lines after free-core checks account for a foreign actor in the former sole rectangle. The original five maps still lack a current enclosure template even when protection/occupancy masks are relaxed. Neither result is a floor-frequency estimate; frozen original actors and the restricted template family matter.

## Remaining gaps and recommendation

**Do not adopt this prototype directly as runtime gameplay.** The evidence is ready for a design review, with these boundaries:

- Identical links share HP. Partially overlapping collinear links with different endpoints still have separate HP records despite deduplicated collision cells and damage forwarding. Complete shared-segment ownership needs a precise junction/HP rule and a subsequent implementation. The current probe exposes the mismatch rather than hiding it.
- Candidate selection still prefers legal enclosures before lines within the explicit template catalog. Full source-dependent strategic scoring, richer outlines, live lure coordination and group formation are not implemented.
- Closed-door traversal and conservative locked-cell handling match the bounded accessibility probes, not every native enemy lock/faction permission. The fixed-lure stall remains visible.
- Debug damage bypasses real hit, range, weapon and resource checks. Native cache invalidation, actor swaps, capture, equipment, eight-source dragging and save behavior remain unproven.
- Native helpless NPCs without help can skip ordinary self-struggle. High binding does not imply guaranteed unaided recovery.

The engineering recommendation is to resolve the partial-overlap representation before adopting the complete shared-field contract, then stage the native integration rather than transplanting the demo wholesale. No unapproved normalization or numerical redesign has been selected.

## Native integration handoff

Subject to the recorded review verdict, subsequent work should follow these behavioral boundaries:

1. Owned anchors/links, legal navigation, shared topology and map save state, exercised by the test-only scenario room.
2. Stable groups, unalerted prebuilding, one lure and paid construction actions under moving occupants and target loss.
3. Player Capture strands, independent leg-bag equipment, real recovery leash and native NPC binding adaptation.
4. Versioned test delivery with actual-game behavior, save/load, package and numerical checks.

Keep one-source continuation/wrapping, zero-source release, six-turn participant stun without capture cooldown, and field geometry independent from an already-admitted capture. Existing native and foreign item/tether ownership must remain intact.

## Maintainer verdict

**Pending.** [#24](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/24) stays open for an explicit accepted / accepted-with-revisions / revise-prototype decision on these results. The parent Spec #20 stays open. Publishing this PR and passing automatic checks do not supply that verdict or authorize runtime integration.

简体中文：原型和证据已可审核。正常预布仍为 50/113 回合，已修正提前入场、退役修复和共享无主计时。请重点查看不同端点的部分重叠连接尚未合并 HP、固定诱饵可能堵施工位这两个限制。审核结论记录在 #24，随后才安排运行时接入。
