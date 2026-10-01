# Test.79 gameplay fixes

Tracks the accepted follow-up in [Issue #113](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/113). Test.78 and its evidence remain preserved.

## Spinner movement and fields

The corner reproduction contains three Spinners: two continue paid construction while the lure has to route around a wall. Teammates' work previously reset the lure's six-turn wait for 65 observed turns. Progress now means prey approaching or the lure itself advancing on a legal route. Native movement credit, sensing, four-turn unseen report expiry and pressure fallback remain authoritative.

Paid gate closure, connection and reopening take priority over lure pressure. After recognizing prey inside the core, a distant Spinner approaches along a legal native route before returning control to native melee. This keeps pressure from blocking unfinished closure or leaving a sealed field's lure outside attack range. The native passage scene retains its real-entry, paid-closure and adjacent-melee capture assertions.

Fresh Hunting Grounds and Infestation maps attempt one legal 9-by-9 outer enclosure for an existing eligible two-Spinner crew. Its 31 nongate boundary cells are map geometry; the entrance remains open and the 7-by-7 and 5-by-5 inner bodies require native paid work. The crew stays together. Invalid terrain or insufficient staffing records a skipped attempt rather than opening protected terrain or adding spiders. Old maps and revisits do not add another field.

Hunting Grounds terrain authoring first reserves a complete large field and then at least three separate nest rooms. The same large-site identity survives objective placement instead of being replaced by a small candidate. Its planned inner/outer boundary cells retain temporary native `OL` through initial random population; authored spawns keep their native rules. Post-generation releases the reservation and creates the outer field. Protected terrain and preset actors can still reject a site. The existing five-attempt limit and safe fallback remain; no new spawn-selection wrapper is required.

The optional field is separate from the three-nest objective. An illegal field or incompatible spacing permits at most one safe planning fallback without that field. Existing actors, terrain and mandatory routes remain authoritative; only a truly impossible objective cancels the floor. Final native sampling includes all 30 maps per version: baseline has 16 fields, 14 skipped fields and no cancelled objectives; GitHub has 17 fields, 12 skipped fields and one insufficient-space cancellation.

The cancelled GitHub `grv/5/seed 1` map still has only two safe nest anchors in its fifth terrain attempt after removing the optional field. An independent planner probe on its complete native map and actors also finds no legal three-nest objective. The final ZIP and zero-error proof are retained in `.scratch/last-cancel-review-20261001/github/report.json`.

Topology refresh shares one solid-cell set across layers. Unchanged target contact skips a full refresh, and actor movement only revisits cores entered or exited. Dynamic occupancy still invalidates routes; unchanged owned-web geometry survives actor movement, while damage, construction and map replacement invalidate it. Wrapping rejects protected actors before scanning possible spider sources.

A paired native 5.5.3 probe on the Test.79 ZIP with SHA-256 `f599b802dc20b30a61299dbdea50ed3c4a131f96cea5feed0b70de5bc9a05e53` retains the complete generated Hunting Grounds map and all NPCs for 60 positive turns. Three performance modules alone are swapped against the previous implementation; both fresh runtimes receive identical native RNG input each turn. Initial state, every resulting entity/planning state and simulation RNG call counts match, with 80 initial and 109 final actors. Median synchronous world-turn time falls from 71.1 to 35.0 ms, 95th percentile from 158.6 to 58.8 ms, and the 60-turn total from 5,137.9 to 2,351.6 ms. Entry handling falls from 2,664.3 to 2.7 ms. This measures one controlled map, not player FPS or a general difficulty change. Planning remains a significant cost.

Evidence is this checkout's `.scratch/spinner-fix-implementation/matched-finalcontrolled-f599b802dc20-comparison.json` and matching `-before/after/` traces/profiles. An earlier uncontrolled candidate comparison diverged after turn 19 because real render frames consumed native random calls at different times; its results are retained and excluded from the behavior-preserving timing claim. Per-turn RNG control isolates the optimization from that visual-clock input drift while retaining real render frames. Those frames still consumed 12 and 13 random calls at different times in the paired run; the matching recorded entity/planning states and measured synchronous world-turn durations exclude that uncontrolled visual input. Earlier candidate maps have different layouts and cannot supply a cross-version timing comparison.

## Hunting and Mage binding

Eligible independent NPC prey and spiders use the same pair predicate for native hostility, nearest-target selection and projectile collision. This lets warriors and casters retaliate while preserving same-faction, ally, party, servant, ceasefire and native capture restrictions. The hunting timing scene observes all original actors off the entrance staircase and rejects an accidental map transition.

Native map generation also updates enemies at zero time. During that synchronous update, the added rivalry, target acquisition, awareness and collision adaptation yield to native behavior; positive turns restore them. This avoids free initialization attacks while retaining native relationships and restores the scope even after nested updates or exceptions.

MageBolt inputs base 4 glue HP damage and explicit base 6 Slime binding to hostile NPCs. Six replaces implicit four; it does not add another six. Native resistance, shield and already-disabled multipliers still apply. The same hit records only actual added silk, once. Player power remains 0.5 glue and one eligible Webbing attempt.

The original flying spider symbol is replaced by a transparent ivory/lilac silk ball generated with builtin imagegen on 2026-10-01. It has two short thin thread trails and a spread-web impact. Native trajectory, collision and lifetime are unchanged.

The expanded native NPC combat also exposed a missing derived Witch rope-launcher impact image. A precise bullet-board alias uses the same-family native Rope impact art available in both versions; gameplay names, hit effects and other images remain intact.

## Weapon IDs and tuning

Canonical IDs are `SpiderlingTome` and `SpiderlingStaff`. Nonenumerable legacy aliases and save migration retain old main/offhand equipment, quick choices, variants, stored and dropped items. Duplicate instances preserve their identity. Display names remain localized.

| Native input                        |       Test.78 |       Test.79 |
| ----------------------------------- | ------------: | ------------: |
| Tome damage / binding / stamina     | 1.5 / 3 / 1.5 | 1.5 / 4 / 1.5 |
| Tome binding amplification          |           15% |           20% |
| Staff damage / binding / stamina    |     3 / 5 / 3 |     3 / 7 / 3 |
| Staff accuracy multiplier           |             1 |           1.1 |
| Snare binding / ordinary slow turns |         8 / 2 |        10 / 3 |
| Snare mana / cooldown               |         2 / 3 |         2 / 3 |

A prior controlled native scan covered 192 cases: four targets, three seeds and eight weapon variants on each of two versions. It isolated output by disabling target movement and attacks while retaining native defenses and silk recovery. Binding-only Tome tuning reduced attacks against ordinary Maid from three to two, Guard from four to three, and Mummy from five/six to four. Extra HP damage gave no further benefit there. Staff binding-only retained two/two/three against those targets; shields left most Wolfgirl cases at the 30-attack cap. This supports a bounded first binding adjustment, not a claim about full combat win rates. Snare retains native immune/resistant branches; its new values are tested separately from that melee scan.

Complete body cocoons require native helplessness and independently sufficient surviving player-owned silk from either weapon. Unrelated Slime cannot pay for the transition. Partial binding stays as bands; native recovery removes the cocoon visual. Drawing and zero-time queries do not equip new restraints, add binding or collect an NPC. Mage/hunting silk uses its own ownership predicate for the same final appearance.

Final package verification and the exact fetched game commit are recorded in [COMPATIBILITY.md](COMPATIBILITY.md).
