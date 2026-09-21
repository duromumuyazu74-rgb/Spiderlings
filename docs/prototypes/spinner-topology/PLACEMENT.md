# Placement investigation for #22

The corrected prototype supports the documented small template catalog, including reachable remote sites, conservative placement protection, a free 3×3 core, coherent nested entrances, terrain invalidation and separate field/floor escape paths. It does not establish arbitrary orthogonal planning or complete partial-overlap HP semantics. Runtime integration needs another implementation step and the #24 review decision.

Start from review baseline commit `27dca6dce33310c016a4f36037ee3a47936233fe`. All ten fixed scenario classes and all six snapshot inputs remain present. [placement.json](evidence/placement.json) records the actual corrected engine and snapshot SHA-256, candidate scores, diagnostic masks and bounded counterexamples. [verification.json](evidence/verification.json) identifies the matching standalone HTML and walkthrough results. The original evidence remains unchanged in [original-verification.json](evidence/original-verification.json).

## Native facts and limits

The inputs are precisely KD 5.4.92 packaged `out/main.js` and the isolated compiled KD 5.5.0 reference `main.js`. Their SHA-256 values are `2d3041a085cbe475a63227ff40709f6d9c1595c77a58545c69edf359a57605a4` and `5b5c99689a6b009530fdeee75c76859feaf56629add6463930bf1585fa93fafe`. No conclusion here covers later 5.5 patches.

Read-only sources in the 5.5 reference establish these contracts:

| Source                                                                                                      | Observation                                                                                                                       | Prototype treatment                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Game/src/enemy/KinkyDungeonEnemies.ts`, `KinkyDungeonEnemyTryMove`, and Spinner's existing `opendoors` tag | Smart movement can open `D` doors.                                                                                                | Add closed doors to traversal, retain their placement protection.                                                   |
| `Game/src/enemy/KinkyDungeonPathfinding.ts`, `KinkyDungeonFindPath`                                         | Eight adjacent directions are searched without ordinary side-cell corner guards. Lock permissions have enemy-specific exceptions. | Preserve eight-way traversal. Conservatively reject every saved `Lock`; faction-specific passage remains unmodeled. |
| `Game/src/map/KDMapGen.ts`, `KinkyDungeonGetAccessible`                                                     | Interactable destinations may be returned without permitting transit through them; locked metadata affects access.                | Do not make a chest transit merely because it is interactable.                                                      |
| `Game/src/enemy/KDCommander.ts`, `KDCommanderUpdateChokes`                                                  | Door/grate and neighboring width heuristics provide choke candidates, not a complete room graph.                                  | Explicit translated templates and narrow-cut detection remain an approximation.                                     |
| Native pathfinding and `KinkyDungeonEnemyTryMove`                                                           | Immobile actors block movement; movable actors may move or swap.                                                                  | All original snapshot actors remain frozen foreign obstacles. This is deliberately more restrictive.                |

The optional replay extracts only `KinkyDungeonGetAccessible` from each exact bundle into a fresh VM. Both versions agree with the corrected model on diagonal-only passage, an unlocked closed door, a locked open-door tile and a chest that cannot serve as transit. These eight results are accessibility evidence, not full enemy-policy, animation or combat evidence. The existing 5.5 extraction asset warnings remain recorded separately.

All metadata-bearing cells stay protected from placement. Some metadata is substantive, including `OL`, `RequiredDoor`, `NoTrap` and `Jail`. Other entries only record coordinates. Relaxed masks below are diagnostic counterfactuals, not a proposal to erase that protection. Selected cells show their snapshot protection reasons in the UI.

## Why the native samples choose lines

Baseline #21 selected five lines and one rectangle. After requiring the entire minimum core to be free of foreign occupancy and protected interactions, the former rectangle sample also selects a line. Its two original rectangle candidates contain a frozen foreign actor within the only qualifying core. Removing occupancy restores those candidates. Own mobile builders and the future target are not part of this static core mask.

The following counts come from the corrected engine. Each triplet is rectangle / concave orthogonal / interception-line candidates. Metadata-only relaxation removes cells whose only protection reason is `tile-metadata`; the upper bound removes all placement protection, occupancy and locks, while retaining terrain.

| Exact version, seed suffix | Conservative | Metadata-only relaxed | Occupancy relaxed | Upper bound |
| -------------------------- | ------------ | --------------------- | ----------------- | ----------- |
| 5.4.92, 0                  | 0 / 0 / 191  | 0 / 0 / 198           | 0 / 0 / 263       | 0 / 0 / 299 |
| 5.4.92, 1                  | 0 / 0 / 82   | 0 / 0 / 89            | 0 / 0 / 338       | 0 / 0 / 447 |
| 5.4.92, 2                  | 0 / 0 / 381  | 0 / 0 / 390           | 0 / 0 / 406       | 0 / 0 / 447 |
| 5.5.0, 0                   | 0 / 0 / 230  | 0 / 0 / 251           | 2 / 0 / 253       | 2 / 0 / 304 |
| 5.5.0, 1                   | 0 / 0 / 208  | 0 / 0 / 235           | 0 / 0 / 228       | 0 / 0 / 300 |
| 5.5.0, 2                   | 0 / 0 / 202  | 0 / 0 / 232           | 0 / 0 / 270       | 0 / 0 / 319 |

None of the original five line fallbacks is caused solely by conservative metadata or occupancy under these templates. They still have no accepted enclosure with every placement mask removed. This is a restricted-template result, not proof that no arbitrary polygon could fit. Enumeration tries 5/7/9 outer-dimension rectangles and one orientation of a 9×9 concave outline. Rotations, reflections, arbitrary outlines and interior walls are not searched. Six maps are examples, not a frequency estimate.

Candidate scoring exposes exit proximity, choke proximity, route intersection, nest proximity, traversable travel length, room space and concave-template fit. A remote candidate can be more than ten route steps away. The ten-step grouping radius does not limit site travel. The shortlist still prefers any legal enclosure to all lines, then draws from the top eight of that class with seed/group RNG. This differs from final source-dependent strategic priority in #20; it is explicitly labeled in the UI. No target coordinates enter candidate analysis.

## Counterexamples and corrected behavior

Use the two new walkthrough tabs in [index.html](index.html), plus the existing nested/shared tabs and free-play terrain/damage controls. The remaining bounded cases are replayed by [probe-placement.mjs](probe-placement.mjs) and printed in the evidence JSON.

| Case                                                                     | Result                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foreign obstacle or protected interaction in a candidate's only 3×3 core | Candidate rejected. Own mobile actors and target can still temporarily occupy the core.                                                                                                        |
| Core interior becomes a wall after selection                             | Grid and walk mask change together; next construction retires the invalid field and chooses a line or abandons. Existing foreign objects remain.                                               |
| Target stands on planned anchor, then leaves                             | Placement waits, then resumes. A foreign static occupant instead invalidates the footprint.                                                                                                    |
| Builder surrounded by blocked approaches                                 | Actor waits at its original position; no teleport or forced overwrite.                                                                                                                         |
| Closed-door/lock separation                                              | Unlocked `D` permits traversal but remains protected from placement. Locked metadata blocks traversal independently of tile letter.                                                            |
| Entry from west/east/north/south of nested layout                        | Gates align on the approached side; recorded entrance path passes both gates and reaches the shared inner core. Outer footprint remains at most 13×13, with two free cells between boundaries. |
| Only inner nested boundary is breached                                   | Inner field has an outside path; outer field and floor exit remain unreachable.                                                                                                                |
| Concave notch isolated by ordinary walls                                 | A breached link permits leaving the actual polygon into the notch, even while floor exit and bounding-box exterior remain unreachable.                                                         |
| Single-door full blockade                                                | Floor exit becomes unreachable until breach. No mandatory always-open-route rule was added.                                                                                                    |
| Space too small for an anchor pair                                       | No plan.                                                                                                                                                                                       |
| Target enters a nested plan early                                        | Outer construction waits until the inner layer is ready or sealed. The early-entry fixture closes the inner before outer work begins.                                                          |
| Retired-only damaged link                                                | No repair, even when its old group retains a field reference.                                                                                                                                  |
| Shared owners lost ten turns apart                                       | Shared structures survive nineteen turns after the last owner is lost and disappear on turn twenty.                                                                                            |

The corrected KD 5.5.0 sample 3 selects a line whose anchor is occupied by the fixed lure. It remains blocked after 450 recorded turns. The **真实地图占位等待** walkthrough reproduces the stall, exposes a **调试移开固定诱饵** button, then completes three turns after that explicit debug relocation. This is not a natural completion time and not evidence that native lure AI works. Keeping the blocked outcome visible avoids silently forcing a structure through an actor.

## Overlap is only partially modeled

Identical whole links share one HP record and multiple field owners. `solids()` deduplicates all built coordinates into one physical obstacle per cell. A hit on a partial shared edge or crossing forwards damage to each incident link. Crossing lines never create a capture region. Intersecting, non-contained closed fields are also excluded from capture geometry; nested or identical regions remain eligible.

Partial collinear overlaps still retain separate endpoint-link HP records. The probe records two links sharing a cell, each taking distance-adjusted damage. Destroying one does not necessarily remove the other's remaining silk. This is a concrete mismatch with a fully merged shared-web graph, and remains a prototype correction before runtime adoption. Normalizing segments would require a decision about newly introduced junctions, anchor propagation and shared maximum HP; this ticket does not silently invent those rules. Collision deduplication alone does not prove the complete shared-structure contract.

## Reproduction and verdict

From the repository root with Node 24:

```powershell
node docs/prototypes/spinner-topology/build.mjs
node docs/prototypes/spinner-topology/verify-prototype.mjs
node docs/prototypes/spinner-topology/probe-placement.mjs
```

The final command needs no game install. For the optional eight native probes, set `KD_NATIVE_BUNDLES` to a JSON array with `{ "version": "5.4.92", "path": "<external packaged runtime>" }` and `{ "version": "5.5.0", "path": "<external compiled runtime>" }`. The runner requires exact recorded bundle hashes and excludes private input paths from output. A run without these inputs records `not-run` rather than preserving a prior native claim. The browser option remains `PLAYWRIGHT_MODULE` as documented in the README.

The geometry evidence supports continuing prototype review. It does not justify copying this planner directly into the Mod. Remaining prototype work includes partial-overlap graph ownership, richer outline coverage if the observed variety is insufficient, and full strategic scoring. Native integration must verify moving-actor swaps, legal attacks at every accessible web cell, cache invalidation, door/faction lock policy, AI perception, real action timing and runtime save behavior. The fixed-lure stall is direct evidence that movement coordination needs its own implementation. Numerical balance remains the separate #23 investigation.
