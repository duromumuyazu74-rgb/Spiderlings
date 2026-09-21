# Shared web durability decision

Status: settled for runtime integration by Issue #27 on 2026-09-21. This record resolves the partial-collinear limitation in the immutable PR #25 prototype at `cf9d152ecf986296ba6815a15b2f0c0cefcb93e9`. It does not activate native gameplay or change the installable Mod.

## Settled physical graph

Every field boundary contributes axis-aligned unit edges to one map-owned physical graph. The graph merges the same unit edge across all fields and records the complete owner set. It then coalesces consecutive collinear edges only while their owner sets match. The resulting maximal span is one physical segment with one HP pool.

Original field endpoints are real web anchors. An overlap split or crossing is a graph junction, but it has no anchor HP and does not grant full anchor propagation unless at least one source field already placed an endpoint there. A real anchor records every field whose physical segment is incident to it. This prevents removal of the group that originally placed the anchor from deleting another owner's surviving structure.

The four focused fixtures produce these graph forms:

| Fixture                      | Physical result                                                                                                                                                  | Capture meaning                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Identical boundaries         | Four shared segments and four shared real anchors.                                                                                                               | The coincident closed boundary remains one enclosure.                               |
| Partial-collinear boundaries | Exclusive span, one shared span, then another exclusive span along the common side. The overlap endpoints are real anchors because each is an original endpoint. | Breaking the shared span opens an outside-boundary route for both adjacent fields.  |
| Crossing lines               | Four segments meet at one non-anchor junction. No fifth anchor is created.                                                                                       | The crossing remains an obstacle graph and never creates a capture field by itself. |
| Nested boundaries            | Separate inner and outer segment loops.                                                                                                                          | The declared closed loops retain their common-core capture behavior.                |

Segment IDs, object order and whether an implementation stores unit edges after coalescing are representation choices. They may change without changing gameplay. Owner sets, real-anchor identity, physical span boundaries, HP, damage and the final-owner timer are gameplay state and must survive save/load.

## HP and damage

Each coalesced physical segment uses the approved candidate maximum:

```text
max HP = 2 + 0.5 * (occupied cells - 1)
```

Applying this formula after graph coalescing is a gameplay decision. A partial overlap becomes separately breakable exclusive and shared spans. A graph split does not copy the original whole-link HP pool onto every owner and does not stack owner-specific HP.

Ordinary link-cell damage uses `max(0.25, 1 - 0.15 * distanceToNearestAnchor)`. Distance follows the live physical graph to the nearest placed real anchor. A junction endpoint is not a distance-zero anchor. One cell hit contributes once to every physical segment occupying that cell. At a non-anchor crossing, this means one ordinary attenuated contribution to each incident segment.

A direct hit on a real anchor damages that anchor and adds full damage once to every incident physical segment. Destroying the anchor destroys those incident segments. Area damage evaluates every covered cell. A covered real anchor supplies its full incident propagation, and every other covered segment cell supplies its ordinary attenuated contribution. Owners never multiply any of these contributions.

## Ownership and collapse

A physical segment or real anchor remains owned while any field in its owner set still has a valid live owner. Losing one owner does not change HP, delete the structure or start its collapse timer. Exclusive structures for the lost owner may count down independently.

The shared structure's ownerless counter starts at zero on the first active-map world turn after its final owner becomes invalid. It remains through turn 19 and collapses on turn 20. A surviving owner resets the counter to zero. Retiring one field does not make a shared part ownerless while another recorded owner remains valid.

## Evidence

`replay-durability.mjs` generates 14 bounded replays under `evidence/durability/`:

- identical, partial-collinear, crossing and nested geometry under direct-anchor, single-cell and 3x3 area damage;
- a partial shared-boundary breach with the resulting outside-boundary route;
- staggered owner loss showing exclusive collapse, survivor retention and the final-owner 19/20-turn boundary.

The summary records graph shape, segment maximum HP, owner sets, final hashes and the engine SHA-256. Each JSON file can be replayed independently:

```powershell
node docs/prototypes/spinner-topology/replay-durability.mjs
node docs/prototypes/spinner-topology/replay-durability.mjs --replay docs/prototypes/spinner-topology/evidence/durability/partial-owner-collapse.json
```

The offline artifact includes a **Partial overlap durability** walkthrough. It exposes the shared HP record, ordinary cell damage, per-cell area accumulation, a real-anchor breach and staggered owner collapse.

## Open native work

No shared-topology alternative remains open for runtime implementation. The native stage must still verify attack selection, range, tools, damage resources, cache invalidation, map save/load and actual action timing. The HP formula, anchor HP, attenuation and 20-turn collapse remain initial gameplay candidates subject to explicit balance changes after native evidence. Such calibration must not change graph ownership or turn junctions into anchors.

Visual knot placement at non-anchor junctions remains an art choice. It cannot add anchor HP, snaring silk or full anchor propagation.
