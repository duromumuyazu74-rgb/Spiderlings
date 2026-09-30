# Spinner passage selection

Research date: 2026-09-29. Baseline: `2c7b639` on `test`; implementation issue: [#107](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/107).

The passage planner prefers positions that can intercept traffic through a corridor or junction. It distinguishes an unavoidable passage from one with a route around it. A protected native door stays a usable route where the game permits it, but never becomes a web cell or a reusable wall. The topology owns paid preparation, closure and reopening; selecting a site does not create web segments.

## Existing behavior and change

The prior `SpiderlingsSpinnerAI.js` already shares a map snapshot and caches breadth-first distances per origin within a planning turn. Its minimum-enclosure search examines possible centers and validates gate access with route searches. A route touching a candidate is a scoring hint; it does not prove that prey cannot bypass the field.

`SpiderlingsSpinnerPassagePlanner.js` adds a map-only index with connected components and articulation points. It generates small wall-backed passage layouts, then checks a bounded shortlist against actual routes. AI can share the index across groups and turns until relevant geometry changes. This is a new site-selection layer, not a replacement for native actor movement, target perception or attack rules.

## Algorithm choice and sources

| Operation                                     | Algorithm and primary source                                                                                                                                                                                                                                        | Application and limit                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find single-cell structural bottlenecks       | Iterative DFS with low-link values, based on Tarjan's linear-time undirected biconnectivity result. [Original paper and abstract](https://epubs.siam.org/doi/abs/10.1137/0201010), [original-paper PDF](https://www.cs.cmu.edu/~cdm/resources/Tarjan1972-sccs.pdf). | One analysis per static map index. Cut vertices improve the shortlist; absence of a cut vertex does not reject a two-cell-wide corridor.                                                                  |
| Reuse distances to many possible sites        | Single-source breadth-first search. [Sedgewick and Wayne's official BFS documentation](https://algs4.cs.princeton.edu/41graph/BreadthFirstPaths.java.html).                                                                                                         | One field serves all destinations for an origin. Distances count tile steps in an unweighted graph; they do not claim to reproduce native traffic costs or the Spiderling web-speed preference.           |
| Prove traffic must enter the capture interior | Separately remove the proposed interior and gate cells, using BFS for each selected route.                                                                                                                                                                          | At most 24 candidates receive the two checks. Blocking gates alone cannot establish that open traffic crosses the capture interior. This handles multi-cell cuts without an all-pairs minimum-cut system. |

The low-link and BFS implementations were written for this module. No external source code was copied. The sources establish graph properties and complexity; the choice of field dimensions, gates, ranking and validation budget is a game-specific design decision.

## Map and movement assumptions

The graph contains unlocked cells marked `walkable`, falling back to `floor` for existing callers. It includes all eight neighboring steps. Native wall-corner diagonals are deliberately included: a four-neighbor approximation could falsely declare a route unavoidable. The index does not use moving actors as permanent obstacles. Native AI must still check legal occupancy and movement before spending an action.

Construction requires ordinary `floor`, with no lock or protected marker. Reused perimeter cells additionally require explicit `wall: true`, no walkability, no lock and no protected marker. Unknown impassable cells, doors, quest objects and stationary NPCs do not become walls by inference.

Candidate interiors are rectangles with each side between one and three cells, at most nine interior cells. Every neighboring cell outside the interior, including diagonals, must be a declared native wall or a paid gate cell. Each gate is one straight, contiguous mouth. Two-cell-wide mouths retain both cells in one gate. Candidates have two to four mouths, and each mouth must have an ordinary walkable exterior connection. Shapes with a walkable diagonal corner that would require a bent gate are skipped. A nearby legal shape or the existing enclosure fallback can still be used.

## Route evidence and scoring

`mandatory` means that a supplied route is traversable, that every route must enter the actual capture interior, and that closing all gates disconnects it. Both route endpoints must lie outside the candidate's planned cells. Ending a route inside the field cannot establish that it intercepts through traffic. A one-cell T center is a useful counterexample: closing its three mouths blocks the corridor, but native diagonal steps can cross from one open mouth to another without entering the center. That layout is not mandatory.

`detour` means the field lies on a shortest route through its interior, and avoiding it requires more graph steps. `local` means no such interruption is proved, including an unchanged route around the interior or a candidate unrelated to supplied routes. The proof records `interiorBypassDistance` and `blockedGateDistance` separately; `detourDistance` is their smaller value so the AI cannot overvalue a gate-only obstruction. A disconnected result is encoded as `null`. These candidates remain available at lower scores. The native game may choose a different weighted path; the proof does not claim to predict a particular future target decision.

The graph intentionally permits diagonal alternatives that a finished web might block. This can underestimate a field's value, but cannot promote a diagonal bypass into a false mandatory classification. Separate topology and native scenarios verify that completed gates actually contain prey.

## API and invalidation

```js
const index = Spiderlings.SpinnerPassagePlanner.buildIndex(snapshot, { metrics });
const steps = Spiderlings.SpinnerPassagePlanner.distance(index, origin, workCell);
const candidates = Spiderlings.SpinnerPassagePlanner.candidates(index, {
  routes: [{ id: "entrance-exit", from: entrance, to: exit }],
  maxCandidates: 8,
  blockedKeys: reservedFootprintKeys,
});
```

`snapshot` supplies `width`, `height`, `cells`, and optional `entrances`/`exits`. A cell has coordinates, `floor`, optional `walkable`, `wall`, `locked`, `protected` and `tile`. Default routes pair the supplied entrances and exits. `blockedKeys` filters planned footprints; it does not turn temporary reservations into permanent graph obstacles.

Returned JSON candidates have `type: "passage"`, a stable `id`, `center`/`core`, `interiorCells`, grouped `gates`, `nativeWallCells`, planned `cells`, `score`, and `proof`. `travelDistance` starts at zero; the AI combines the map-only score with actual group travel using the shared distance query. The native adapter receives the geometry together with owners and persistent field/group IDs.

The caller replaces the index after grid, lock/passability, protected objects, fixed blockers or route endpoints change. Normal actor movement does not rebuild its connectivity. Distance fields use an LRU bound of 64 origins and a one-MiB typed-array payload budget per map index, retaining at least one field on unusually large maps. The former 16-origin limit repeatedly evicted a static 17-origin working set; on a 25-by-25 map, twenty identical rounds now build 17 fields instead of 340. This is a deterministic BFS-work comparison, not an FPS measurement. Only the last candidate-query result is retained; the cache key includes route endpoints, result limit and reservation keys. Returned candidate arrays are copies, so a group cannot modify another group's shared proof.

## Work bounds and verification

Let `V` be walkable cells, `E` neighboring edges, `C` locally legal layouts, `R` supplied routes and `K ≤ 24` checked layouts. Building the graph and iterative low-link analysis costs `O(V + E)`. Fixed-size layout enumeration is linear in map cells, followed by `O(C log C)` shortlist sorting. Each missing origin-distance field costs `O(V + E)`. Candidate proof costs at most `O(KR(V + E))`; it is shared across members and repeated identical queries. Retained distance storage is at most sixteen `V`-entry fields. The geometric index and bounded candidate cache remain separate from saved gameplay state.

Metrics expose analysis count, visited graph vertices, distance-field builds, candidate cells, exact route checks, route searches, validation visits and cache hits. Each route check performs two searches: one blocking the interior and one blocking the gates. A single route cannot cause more than 24 exact checks or 48 route searches per candidate query. Multiple routes increase those bounds by their count. No timing speedup is claimed without a matched measurement.

The public planner tests cover one- and two-cell corridors, a T junction, parallel and diagonal bypasses, native-door preservation, protected/locked cells, route endpoints inside a field, static-index reuse, distance-cache bounds, stable candidate identity, changed geometry and a 12,000-cell corridor without recursive-stack growth. A cross-module test sends every emitted candidate from representative maps through `SpinnerTopology.validatePassage` and confirms planning creates no completed web cells. Native gameplay, recruitment, paid gate work and cache invalidation during play are verified by the owning integration scenarios.

## Fixed-fixture coordination measurement

Measured on 2026-09-29 at 15:27:57 UTC (23:27:57 Asia/Shanghai), using Node 24.14.1 on Windows after native/browser verification had stopped. Workspace-local evidence is in `.scratch/spinner-chokepoint-delivery-20260929/compare-planning.cjs` and `planning-comparison.json`. Three earlier reports remain as history: `before-rally-origin.json`, before support-station distance queries reused the member as the BFS origin; `before-rally-queue.json`, before the later support and queue-movement fixes; and `before-ready-phase.json`, before ready-phase mouth assignments were refreshed from current worker positions. The table below uses the final captured source, which remained unchanged throughout sampling.

The benchmark loads the actual AI, topology and native-field modules through the existing VM test harness. It compares test.60 with the passage implementation on identical 25×25 and 50×50 grids, each containing two 7×9 rooms joined by a one-cell corridor, with four or twelve Spinners equally divided between the rooms. The maps contain 133 and 158 walkable graph vertices respectively; these are corridor fixtures, not dense maps with 625 or 2,500 walkable cells. Map and initial actor-position hashes are checked for each pair.

Each fixture has three discarded warm-up pairs and twenty measured pairs, alternating baseline and candidate order. Each sample starts with a fresh runtime. Initial timing includes the first `beginTurn`, map snapshot, connectivity index and candidate preprocessing; module loading is excluded. The next twenty positive coordination turns keep terrain and actors fixed. They do not call actor actions, render the game, run combat, or advance the native KD world. The table reports milliseconds as p50 / p95, using the nearest-rank percentile.

| Map / Spinners | test.60 initial | Passage initial | test.60 next 20 turns | Passage next 20 turns |
| -------------- | --------------- | --------------- | --------------------- | --------------------- |
| 25×25 / 4      | 9.71 / 11.11    | 4.56 / 7.56     | 18.99 / 23.92         | 5.65 / 9.47           |
| 25×25 / 12     | 10.46 / 13.16   | 6.74 / 8.30     | 28.52 / 43.31         | 16.51 / 18.68         |
| 50×50 / 4      | 16.09 / 19.89   | 14.55 / 19.33   | 58.58 / 71.40         | 27.62 / 33.08         |
| 50×50 / 12     | 20.39 / 25.55   | 15.03 / 20.63   | 88.50 / 100.26        | 27.95 / 32.15         |

All passage samples build the connectivity index once. Candidate enumeration visits 133 or 158 walkable cells, with 24 or 48 proof searches; those counts do not increase during the following twenty turns. Distance fields have a separate bounded cache:

| Map / Spinners | Distance-field builds after initial turn | After twenty more turns |
| -------------- | ---------------------------------------- | ----------------------- |
| 25×25 / 4      | 11                                       | 11                      |
| 25×25 / 12     | 20                                       | 340                     |
| 50×50 / 4      | 15                                       | 15                      |
| 50×50 / 12     | 24                                       | 24                      |

The 25×25 twelve-member workload exceeds the sixteen-origin LRU capacity and still rebuilds distance fields. Reusing member origins reduced its final count from 551 in the earlier run to 340; it did not eliminate cache eviction. Stable small groups whose active origins fit the cache can reuse their distances. Shared connectivity and candidate proofs remain reusable even when distance origins are evicted. The AI regression test checks this distinction with fixed members and actual rally assignments, rather than imposing a wall-clock threshold.

These timings compare different planning behavior: test.60 chooses two independent room enclosures, while the candidate chooses route-intercepting passages and merges the four workers into one group on the 25×25 fixture. The other candidate fixtures retain two groups. No paid construction occurs in the measured interval. The candidate uses less coordination time in these samples, but this does not establish an equal-gameplay speedup, an end-to-end native frame improvement, or a bound for other map shapes. Runtime scheduling and garbage collection can affect wall-clock results.

Source strings were captured once before sampling, with all module SHA-256 values stored in the JSON. The baseline AI hash is `1b3c80df34bdac762e1faefaa53ad4c21fa7adab1a8e6c65f422c1b8fbbf396b`; the sampled candidate AI hash is `74fed37bcb78b7a6e961d03ab716ad17c8a8226eb36fe500ac18d171b772ad9d`; the planner hash is `6cf4f997f4d8eaee56551cbd53c2376ceb9e147be0c63779e207926c034f09a8`. The final `planning-comparison.json` SHA-256 is `1bfb3944b27442a2b4c76e516afd272c8410ddc23e87721630c765e485445490`. Both source sets report `stillCurrentAtEnd: true`. Support movement, collision waiting and native combat remain outside this coordination-only measurement; separate behavioral tests and native scenarios cover those paths.

The test.65 cache change is verified separately in [compatibility evidence](COMPATIBILITY.md#test65-local-mage-integration-and-distance-cache-verification). The table above retains the original test.64 measurements; it was not rerun and does not describe the new cache.
