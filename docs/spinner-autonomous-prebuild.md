# Spinner autonomous prebuild evidence

This record covers the scenario-only line-planning slice from Issue #29. Ordinary-floor activation, enclosing fields and alert-time lure behavior remain outside this slice.

## Runtime contract

- A group starts with at least two eligible hostile Spinners connected by a native-reachable path of at most ten steps. Saved groups do not merge later. An ungrouped nearby Spinner can join without changing its squad or nest provenance.
- Each group saves one plan. Different groups can own simultaneous lines without a global field cap. All lines remain fields in the same schema-2 physical graph. The map seed, map identity, group ID and selection ordinal feed a local random stream; selection does not call `KDRandom`.
- Candidate analysis receives floor cells, locks, protected metadata, entrances, exits, choke hints, nests and group origins. It receives no player or target coordinate.
- The runtime reserves distinct tasks and work cells. A handled pass performs one native move, one anchor placement, one link-cell extension, one repair, one yield or one wait.
- Dynamic occupancy causes a wait or yield and does not change the plan. A static footprint change retires only the owned line, increments the saved selection ordinal and chooses a non-overlapping replacement when at least two capable members remain.
- One survivor can repair existing silk. It cannot choose a new plan or continue unfinished construction.
- The native `hunt.beforemove` hook runs after KD sensing. A Spinner that detects the player on that pass delegates to native behavior, so it cannot build and then move or attack on the discovery turn.

## Deterministic timing fixture

`spiderlings-spinner-ai.test.js` runs the same five-cell line for 30 construction turns, applies anchor damage, then runs eight repair turns. Counts are paid action outcomes across all supplied actors.

| Actors | Travel | Construction | Wait | Yield | Repair |
| -----: | -----: | -----------: | ---: | ----: | -----: |
|      2 |     22 |            5 |   46 |     0 |      3 |
|      4 |     22 |            5 |  122 |     0 |      3 |
|      8 |     22 |            5 |  274 |     0 |      3 |

The fixture proves separate accounting and one-operation scheduling. It is not a balance target. Extra workers wait once the two anchors and the sequential link-extension task are reserved.

## Verification boundary

Automated tests cover corridor, T-junction, cross-junction and exit-adjacent candidate priorities, simultaneous group fields in one schema-2 graph, an impossible footprint replacement, a live occupant, a later worker, member death, JSON save/load, map-state revisit and proxy reconciliation. The pinned KD 5.5.0 contract probe covers path conditions, attackable proxies, final native damage, movement budgets and both path caches.

No full graphical KD session is recorded in this change. The `spiderlingsSpinnerAutonomous` scenario input enables the same planner and field adapter for that manual pass. The source remains scenario-only and does not bump the Mod version or produce a ZIP.
