# Current construction pacing

The regular-room fixture now finishes within the requested 30-turn limit for two Spinners. More workers reduce construction time. Travel limits the improvement in total elapsed time.

The [current summary](evidence/pacing/summary.json) identifies the engine hash and all 37 replayable cases. [PACING.md](PACING.md) and the unchanged [historical summary](evidence/pacing-baseline/summary.json) retain the original results.

## Same room, different worker counts

The arrival-inclusive runs keep the original 5-by-9 boundary, seed `spinner-01`, target position and spawn order. The footprint was not reduced to meet the timing target. Separate on-site fixtures start actors at distinct legal worksites chosen by the planner. This changes their initial condition; gameplay does not teleport workers there.

| Spinners | Previous arrival-inclusive turns | Current arrival-inclusive turns | Current on-site turns |
| -------- | -------------------------------- | ------------------------------- | --------------------- |
| 2        | 98                               | 27                              | 12                    |
| 4        | 42                               | 20                              | 6                     |
| 8        | 42                               | 18                              | 4                     |

On site, doubling two workers to four halves the duration. Eight finish in four turns, three times as fast as two. Anchor prerequisites, per-cell extension and the last available tasks prevent perfect linear scaling. Travel and construction can interleave in the arrival-inclusive runs, so subtracting the on-site result does not measure exact travel time.

The original three-actor room fixture falls from 50 to 22 turns. Two-layer construction falls from 113 to 42 turns with four actors and from 81 to 37 with eight. The two-actor nested fixture takes 23 turns but builds only the inner layer. It is not the same job.

The narrow-corridor fixture takes 16/16/18 turns with 2/4/8 actors. Crowding and few available tasks can erase the benefit of more workers. The room result is not a universal claim that every added actor accelerates every site, or that every full-floor journey finishes within 30 turns.

## Changes and costs

- All unaware actors build. Core entry or the explicit Alerted control reserves one stationary lure. Native perception and moving lure AI remain unimplemented.
- Workers retain task assignments, prefer reachable work and use distinct worksites ranked by travel and boundary coverage. Idle workers can yield a pending work cell through a paid move.
- Construction reaches up to five clear tiles. The model checks intervening terrain, closed doors and frozen foreign occupants; this is not a native line-of-sight implementation.
- Placed anchors supply endpoint cells. An adjacent-anchor link still requires a separate paid connection before it blocks movement.
- Construction costs one budget point. Movement and repair retain 1.5. Each actor earns one point per world turn and performs at most one operation in that turn.

Link/anchor HP, distance-based damage, repair amount of 10% and the four-turn rebuilding cooldown are unchanged. Retired-only repair exclusion, inner-before-outer construction and last-owner collapse rules remain covered.

## Verification and limits

All 37 cases replay to matching observations and final states. All twelve contract checks pass. They cover the two-worker deadline, on-site scaling, arrival-inclusive improvement for the pinned room and the existing lifecycle rules. The scaling checks use fixture regression bounds, not native balance thresholds.

Early nested entry occurs at turn five. The inner layer is ready at turn 19 and the first outer action occurs at turn 20; closure takes 52 further turns after entry. A destroyed room link begins rebuilding after four turns and returns to readiness after five. Blocked-target, withdrawal and insufficient-survivor cases remain recorded as incomplete when appropriate.

Reproduce with `node docs/prototypes/spinner-topology/measure-pacing.mjs`, then build the offline page. The page displays measured arrival-inclusive and on-site timings and rejects evidence from another engine hash. Replay an individual current trace using the runner's `--replay` option. Historical traces require their historical revision.

These are abstract prototype world turns. Injected damage is not a paid native attack. Actual travel, perception, construction reach, combat resources, capture and leash behavior still require game integration and measurement.
