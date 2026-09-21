# Corrected-engine pacing results

This supplements [PACING.md](PACING.md), which intentionally preserves the immutable #21 baseline. [Current summary](evidence/pacing/summary.json) identifies the engine hash and all 34 replayable cases. [Historical summary](evidence/pacing-baseline/summary.json) remains unchanged.

| Observation                        | Initial #21 engine                                  | Corrected placement/lifecycle engine                         |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| Default three-actor room prebuild  | 50 turns                                            | 50 turns                                                     |
| Default four-actor nested prebuild | 113 turns                                           | 113 turns                                                    |
| Early nested entry at turn 5       | 91 further turns; outer work starts with inner work | 120 further turns; inner ready at 53, first outer work at 59 |
| Retired-only damaged roadblock     | Incorrectly repairs from 3.65 to 4 HP               | Remains at 3.65 HP                                           |
| Shared owners lost ten turns apart | Collapses ten turns after final owner loss          | Present at final-owner turn 19, gone at 20                   |
| Contract observations              | 7 pass, 3 known model defects                       | All 10 pass                                                  |

These changes correct state rules rather than speed or damage parameters. The same pinned room 2/4/8-actor prebuilds remain 98/42/42 turns. Nested 4/8-actor prebuilds remain 113/81; the two-actor 87-turn case is inner-only and must not be treated as a faster completion of the two-layer job.

Occupancy stalls and unfinished cases remain included. A target blocking an anchor and a survivor unable to finish new construction are expected incomplete scenarios, not discarded observations. The additional native-map fixed-lure stall is documented separately in [PLACEMENT.md](PLACEMENT.md).

Reproduce the current cases with `node docs/prototypes/spinner-topology/measure-pacing.mjs`. Replay a saved current case with its `--replay` option against the matching engine revision. Historical replays must use their historical engine; a different final state hash fails explicitly.

All times are abstract prototype world turns. Injected damage is not a paid native attack. Actual construction cadence, movement coordination, resistances, tools, player resources and native capture/leash behavior still require game integration and measurement.

简体中文：这是修正后的测量，原始报告不被覆盖。正常预布时间未变；提前入场的双层施工、退役后不修复、最后所有者失效满二十回合才坍塌均已通过检查。结果不代表原生战斗平衡。
