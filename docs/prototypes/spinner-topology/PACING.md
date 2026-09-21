# Construction and breach pacing

This is the #23 review of the #21 prototype at commit `27dca6dce33310c016a4f36037ee3a47936233fe`, under spec #20. The baseline measurements below belong to that engine revision. Later geometry fixes must produce separate results in `evidence/pacing/`; do not overwrite `evidence/pacing-baseline/` or describe changed geometry as a balance improvement.

## Reproduce and inspect

From the repository root with Node.js 24:

```powershell
node docs/prototypes/spinner-topology/measure-pacing.mjs
node docs/prototypes/spinner-topology/measure-pacing.mjs --replay docs/prototypes/spinner-topology/evidence/pacing/baseline-room.json
```

The first command writes 34 complete scenario replays plus a summary into `evidence/pacing/`. Each file contains the starting state, every debug or world-turn action, per-action observation deltas and a final state hash. The first observation is complete. Later actor/field entries merge by ID; anchor/link tuples replace the entry with the same first element. Unchanged values carry forward. The runner replays each generated case and compares all observations and the final state. The second command replays any one saved case using the checked-out engine. Historical replays require their recorded engine revision; a mismatch fails explicitly.

To reproduce the immutable historical set, run the same runner against the #21 engine and pass `evidence/pacing-baseline/` as its output argument. [Baseline summary](evidence/pacing-baseline/summary.json) records the engine SHA-256. Its `contractChecks` deliberately expose known baseline defects. A false contract check is an observed model gap, not a failed replay or an omitted run.

All cases use seed `spinner-01`. Group membership and actor spawn order are fixtures. The first active actor is an idle lure while there is another actor. Each actor earns one budget unit per world turn and spends 1.5 units on a move, placement, extension, repair, reopening, lure duty or paid wait. Budget accumulation is recorded separately. The runner reads the model's action labels and positions; it does not substitute a faster scheduler. No moving, placing or extending happens for free in the same action.

## Prebuild results

| Fixed geometry                 |       2 actors |        4 actors |       8 actors |
| ------------------------------ | -------------: | --------------: | -------------: |
| Room                           |             98 |              42 |             42 |
| Nested candidate               | 87, inner only | 113, two layers | 81, two layers |
| Two-cell corridor interception |             24 |              24 |             21 |

Units are prototype world turns, ending when all planned structures wait with an entrance or form a line barrier. Each row pins the same selected candidate across counts. Two actors cannot build the second layer, so 87 is not a faster completion of the same two-layer job. Additional actors use the model's existing nearby-spawn selection. More workers therefore also change occupancy and initial travel positions.

The original room uses three actors and takes exactly **50** turns. Its two workers spend 33 actions moving, four placing anchors, 27 extending links and two waiting. The lure consumes 33 paid actions. Across all three actors, 51 turns are budget accumulation. The original nested fixture uses four actors and takes exactly **113** turns: workers spend 130 moving actions, eight placements, 70 extensions and 17 waits; the lure consumes 75 paid actions and all actors accumulate budget for 152 actor-turns.

The apparent lack of improvement from four to eight room actors is reproducible. Movement grows from 47 to 99 actions and idle actions from six to 66 while the same four anchors and 27 extensions are built. The narrow corridor's eight actors also accumulate 65 occupancy waits. These observations support measuring travel and contention in native KD before changing action speed.

## Target timing and layering

Targets are debug-positioned. The experiment does not implement lure pursuit, visibility or hostility.

| Four-actor case | Entry world turn | Further turns to all sealed | Withdrawal result                                                    |
| --------------- | ---------------: | --------------------------: | -------------------------------------------------------------------- |
| Room, early     |                5 |                          37 | Separate withdrawal case returns to waiting                          |
| Room, late      |               42 |                           5 | One tick after entry, debug withdrawal; ready after one further tick |
| Nested, early   |                5 |                          91 | Baseline sequencing defect, see below                                |
| Nested, late    |              113 |                           6 | One tick after entry, debug withdrawal; ready after one further tick |

Normal nested prebuilding starts inner construction at turn 11 and outer construction at turn 53. Both layers share the same core, with three-coordinate boundary separation leaving two interior movement cells. The two-actor comparison creates only the inner layer. Gate closure is ordered inner before outer in the model, and the traces preserve each field phase per turn.

Early entry exposes a baseline defect: inner and outer placement both begin on turn 11, before inner readiness. The trigger bypasses prebuild sequencing. This is an implementation defect assigned to #22, not permission to optimize construction by building both layers together. Use the rerun after that correction for early-entry pacing.

## Destructive counterplay

Damage fixtures contain a horizontal link and an incident vertical link, both shared by two field owners. Each injected attack has base damage one, bypasses weapon, hit, range and resource checks, and does not advance a world turn. These counts are debug applications, not native player actions or promised escape counts.

| Horizontal length in cells |  HP | Center single hit | Center 3×3 AoE total | Single hits to break | Center AoE applications to break | Anchor hits to break both incident links |
| -------------------------- | --: | ----------------: | -------------------: | -------------------: | -------------------------------: | ---------------------------------------: |
| 3                          |   3 |              0.85 |                 2.85 |                    4 |                                2 |                                        2 |
| 9                          |   6 |              0.40 |                 1.50 |                   15 |                                4 |                                        2 |

HP follows the current model's `2 + 0.5 × (cells.length - 1)`. The short-link AoE includes both endpoint anchors and its center, so damage is `1 + 0.85 + 1`. Its nearby vertical link also takes `1 + 0.85`. The long-link center AoE sums `0.55 + 0.40 + 0.55`. An anchor-centered AoE deals 1.85 to each incident link. Damage is per covered cell, with anchor propagation preserved; owner count never duplicates physical damage. Killing the two-HP anchor removes both incident links regardless of their remaining HP.

In the paired repair-pressure cases, one damage unit hits the same room link each world turn. With no repairer it breaks after six applications and five intervening turns. A sole surviving adjacent repairer uses five paid 10%-HP repairs; the link breaks after nine applications and eight intervening turns. The test records actual HP each turn. This illustrates a longer breach window under these inputs without defining a target win rate.

Destroying a room link starts cooldown at four. Its next three turns show cooldown 3, 2, 1; the fourth permits work. Travel and the 1.5 action budget delay the first new link cell until seven turns after damage; waiting readiness returns after 15. The four-turn timer is link rebuilding. It is not a capture retry timer, and six-turn participant stun is outside this model.

## Occupancy, removal and ownership

No stalled samples are discarded:

- A target standing on an unbuilt anchor prevents readiness throughout a 120-turn window. Debug withdrawal then permits readiness after 44 more turns. The failure is retained with its occupancy-delay actions.
- Removing three of four actors at turn 12 leaves unfinished construction after 120 more turns. The survivor cannot extend it, as required, while the paired repair case demonstrates permitted solo repair.
- Adding a static occupant to the planned boundary causes retirement and a new interception-line plan. The replacement reaches its barrier after 21 more turns in this fixture.
- Explicitly retiring a completed roadblock leaves its physical cells present after 20 turns with a live owner. The baseline incorrectly repairs a retired-only link from HP 3.65 to four; #22 owns this fix.
- A single owner's structures remain at ownerless turn 19 and disappear at turn 20. With staggered owner loss, the baseline wrongly deletes shared structures only ten turns after the last owner disappears. Both measurements and the failing check remain in the baseline evidence. The corrected shared lifecycle must count 20 turns from the last effective owner.

Retirement is injected explicitly because target escape and capture completion are not modeled here. Repeated capture, participant stun, active target locking, lure replacement and native group formation cannot be inferred from these fixtures.

## Recommendation and native measurements

Preserve the accepted per-action costs and candidate damage values during this prototype review. Correct the three exposed contract defects before judging their outcomes. Keep short interception lines available: they finish in 21–24 turns in the selected narrow fixture, compared with 42–98 for this room and 81–113 for two layers. These are separate geometries and should not be treated as a randomized comparative trial.

The room's four-to-eight plateau is a reason to inspect travel and reservations, not evidence that the action budget must be reduced. Any future changes to actor cadence, gate cost, worker assignment or simultaneous construction require an explicit design decision and a paired rerun. No proposed parameter change is adopted by this ticket.

Native KD still needs measurements of:

- Enemy action cadence and the ordering of movement, attack, construction and stun turns.
- Legal melee, ranged and AoE hits against anchors and link cells, including range, tools and damage resistances.
- Actual map navigation and contention with moving NPCs and the lure.
- Player stamina, will, tool availability and escape progression under equipment and perks.
- Capture entry, one-source continuation, zero-source release, six-turn stun and five-turn leg-binder wrapping.
- NPC binding resistance, ordinary struggle, reinforcement target and source attribution.
- Leash attachment, external-item reuse, eight-source recovery, crossing closed webs and interaction with native pulls.

简体中文：50/113 回合已按原始人数复现。更多施工者不一定更快；移动与占位会吞掉收益。已保留所有卡住的样本，并暴露提前入场、退役修复和共享无主计时三处模型问题。本报告不代表实机平衡结论。
