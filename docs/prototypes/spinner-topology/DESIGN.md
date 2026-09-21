# Spinner field design record

Status: user-confirmed design, 2026-09-21. Implementation has NOT entered the Mod.
Authority: this conversation, questions 1–180, with later corrections superseding earlier options.
This file is a local design record, not a new issue tracker or a claim about current runtime behavior.

## Delivery boundary

The first deliverable was a disposable topology prototype with a single offline HTML entry point. This document retains that historical design discussion; [Spec #20](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/20) is the current authority. The portable review baseline is now under `docs/prototypes/spinner-topology/`. Use ten fixed scenarios and genuine isolated KD map snapshots. Show candidates, scores, protected cells, group paths, construction, closed regions, shared structures and breach paths. User reviews the prototype before runtime integration. Test-branch integration will be a separate stage, enabled by default on ordinary floors; formal publication is not authorized. Do not alter official games. Debug room is a scenario sandbox, not a player tutorial. Old training-room saves are unsupported, not silently migrated.

## Vocabulary

| Term            | Meaning                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| Web anchor      | Structural endpoint with its own HP.                                                          |
| Web link        | Axis-aligned connection with shared HP, attacked through its occupied cells.                  |
| Snaring silk    | One-use movement penalty per target on an anchor cell.                                        |
| Web field       | Independent interception line or simple orthogonal enclosure.                                 |
| Composite field | Nested enclosures with a common innermost capture core.                                       |
| Capture strands | Temporary multi-source control and visual relationship; no equipment.                         |
| Leg binder      | Independent real ItemLegs restraint produced after player capture defeat.                     |
| Silk leash      | Real player neck-restraint carrier for recovery dragging, independent of capture and leg bag. |

## Planning and groups

- Ordinary combat and infestation floors only; exclude boss, jail, tutorial and dedicated scripted areas. Hostile Spinners only. Existing allies, pets and party members are not builders.
- At least two Spinners form a stable group within ten reachable path steps. Later arrivals join a nearby group. Save group identity. One active plan per group; no global field cap, no historical field cap.
- Unaware builders may travel across the whole floor. They know topology, entrances/exits and nest locations, not an unseen target's position. Nest-origin groups prioritize nest entrances; ordinary groups prioritize main-route chokes/exits, junctions and then suitable rooms. Weighted choice among high scoring candidates uses a map-seed/group-ID random stream; save choice immediately.
- Analyze candidates once per new map, invalidate affected candidates after terrain changes. Revalidate before every placement. Degrade enclosure to interception line to another location/abandonment. Never clear unrelated objects to construct.
- All ten cases matter: single-cell door, two-cell corridor, T, cross, regular room, irregular room, exit vicinity, insufficient space, two overlapping groups, nested fields.
- Enclosures are simple horizontal/vertical loops, not limited to rectangles. Core includes a free 3x3 area; innermost active area is 3x3 through 7x7. A group can build two layers with at least four active Spinners. Two free cells separate nested boundaries; overall span is about 13x13 maximum, so the largest inner size cannot be combined with every outer size. Build inner first.
- Multiple groups may overlap. Reuse the same physical anchors and exact shared links and record all owners, instead of stacking entities. Crossing non-nested structures remain obstacles, not new arbitrary capture cells.
- Complete blocking of the only route is allowed. Do not occupy stairs, exits, shrines, jail doors or required interaction cells. Attackable links themselves provide counterplay; do not require a reachable anchor or mandatory open escape lane.

## Construction and structures

- Each action chooses movement OR anchor placement OR extension of one cell OR repair OR an active drag. No free construction during movement. A group queue reserves distinct tasks for builders.
- Before discovery, all group members build. After discovery, one lure and all other group members build; stable roles with replacement on death, incapacity or prolonged loss of sight. Lure remains visible, avoids melee, retreats toward the planned area. Lost sight for eight world turns restores ordinary pursuit; last-known target information expires after four. Builders defend for an action against adjacent threats.
- Prototype review target: two Spinners prebuild the pinned regular room within 30 world turns including travel; additional workers should reduce construction time. The current candidate uses one budget point per construction action, 1.5 for movement or repair, and at most one operation per actor per turn. Workers can construct within five clear tiles, reserve distinct tasks and reuse placed anchor endpoints. A short link still needs a paid connection action. These are abstract prototype candidates; native timing and sight rules need runtime validation. [Current measurements](CURRENT-PACING.md) separate arrival-inclusive runs from fixtures that start at legal worksites.
- Before discovery, complete bodies of enclosures but leave a coherent entrance route. Only entry into the innermost core triggers inner-to-outer incremental gate closure. If target exits before sealing, reopen designated entrances using actions. Closed capture needs real topology, not proximity to a fixed rectangle.
- Candidate link HP: `2 + 0.5 * (length - 1)`; length unit must be explicitly exposed by the prototype. Anchor HP candidate: 2. Repair candidate: 10% max HP per action. Broken link cooldown: four world turns before rebuilding cell by cell.
- Attack on a link cell: multiply damage by `max(0.25, 1 - 0.15 * distanceToNearestAnchor)`; link HP is shared. Anchor hits deal full damage to every attached link as well as the anchor. Destroying an anchor destroys its attached links.
- AoE counts each covered cell separately against a link, including additional full anchor propagation. It is deliberately effective against long links. Do not deduplicate the entire AoE per link.
- Links block non-spider ordinary movement; they do not block sight/projectiles. All Spiderlings can cross. Actual target attacks can still select links. Other NPCs attack hostile web obstacles when no reasonable detour exists.
- On capture end the structures remain closed. The same target still inside can be captured again. After target fully departs, retire the field as an unmaintained obstacle and let the group plan another. Shared pieces still needed by active owners remain maintained.
- No valid owners: 20 active-map world turns until collapse. A shared part starts that countdown only after all its owners become invalid. Survivor groups may repair with one Spinner but cannot start a new plan/capture. Retired is not identical to ownerless.
- Snaring silk gives MoveSpeed -1, duration parameter 2, once per entity; no direct damage or restraint. Forced entry also triggers it. Geometry is visible when in vision. HP is shown on targeting/damage rather than every edge all the time.

## Player capture

- Entry requires complete containing nested field, at least two legal nearby hostile Spinners and one native melee hit. Native range, evasion, LOS and incapacity apply. Each additional strand consumes its source's full action without another ordinary damage hit. At most eight active capture sources.
- Capture strands pin the target at its current cell. Attacks, spells, items and explicit escape remain available and advance world time. No real item until wrapping. Breaking field geometry after admission does not cancel capture.
- One remaining source continues capture. Candidate weaving: one source 6.25/turn; two 12.5; each extra +4; goal 100. Escape target: one 50; two 75; each extra +25. Paid pull +25 for displayed stamina 10 and one world turn. Simultaneous filled bars favor escape.
- Failed capture: escape bar full, including being automatically filled when all sources disappear. Stun the currently effective surviving participants for six subsequent world turns. No capture cooldown and no global target immunity. Nonparticipants can initiate a later legal capture immediately.
- Lost/dead/disabled/out-of-range/occluded sources remove their strand; recompute target, retain current progress, and immediately recognize an already-filled reduced target. Reset both temporary bars on a terminated attempt; real deposited equipment progress survives.
- Goal 100 permits even ONE source to start and continue five-world-turn real wrapping. Breaking the field does not interrupt. Zero sources interrupts and preserves partial bag. The bag remains separate from the leash, preserves arms, uses the existing leg-only shape. A partial bag can be continued by a later failed contest; complete bag blocks further bag contests.
- During an active capture/wrap, other Spiderlings wait/reposition rather than attack the target; existing player dash warnings cancel. Capture strands do not inherit Silk leash source bonuses. Existing real leash persists but dragging pauses. Visual distinction remains an art decision, not a fixed line-width/color rule.

## Player recovery leash

- After actual departure through a breach, recovery attack must hit again. Create one Silk leash in ItemNeckRestraints if native addition permits. If an existing usable `leash: true` item prevents duplicate addition, use that item as carrier. Preserve external item, lock, escape progress and native tether ownership.
- Up to eight DISTINCT Spinner source IDs. Repeated same-source hit refreshes, not stacks. Alive, hostile, actionable, within three tiles, physical LOS. Invalidated sources must hit again, never silently reconnect. Source count upgrades the owned leash and drops dynamically.
- All layers of a composite field share its innermost recovery core. If unrelated fields exceptionally attach simultaneously, majority source group chooses destination; tie uses nearest valid field. No existing field: surviving sources pull toward themselves.
- One designated Spinner spends its action dragging; other sources supply strength and may spend their own actions otherwise. No action means no pull. Native and owned pulls together must not double-move a target in the same world turn.
- Forced pulling may cross ANY Spiderlings web, not ordinary walls/locked doors/foreign obstacles. Two pull actions cross one occupied web cell: first presses against boundary, second crosses to a legal far-side cell. Expose this as a two-action abstraction, not teleport through ordinary terrain. Active voluntary movement cannot use the exception.
- Stand firm spends one action and displayed stamina `5 + 2*(n-1)` as a candidate, and negates the next owned pull; if no pull occurs yet, retain the protection.
- Single strand removal: one effective Cut or two effective Remove/Struggle actions, native accessibility/costs respected. Removing whole carrier clears all sources. Owned leash stays slack when source count is zero; external carrier stays unchanged.
- Whole owned leash removal uses NATIVE escape values, NOT fixed action counts. BasicLeash is baseline: power 1, tether 2.9 and native method-specific escapeChance/limitChance/affinity. Additional distinct sources add linear temporary escapePenalty through beforeStruggleCalc; increment awaits native calibration. Preserve native tools, stamina, pose, perk and accumulated progress. Never impose this penalty on an external carrier.
- Show source count /8, stand-firm cost and target field. Art remains unconstrained until assets exist.

## NPC branch

- NPCs share planning, lure, closure, hit admission, temporary strands and multi-source recovery logic. Only living hostile mobile targets that can actually gain native binding qualify; physical appearance is irrelevant.
- No NPC Leg binder, NPC equipment stages or five-turn item application. No white weaving bar. Capture prevents voluntary movement but is not a custom full stun; native combat disablement still applies.
- Aggregate active sources once per world turn into native glue/Slime binding, candidate 1.5 per contributing Spinner from the existing melee baseline. Retain native resistance, shields, helpless silk-silence attribution and native struggle when the game permits it. Use an internal escape counter based on native struggle ability; successful escape stuns participants for six turns. Two sources to enter, one to maintain, zero resolves as target escape.
- Continue reinforcement beyond helpless, target `maxhp * (KDNPCStruggleThreshMult + 1)`. At target, end strands without stun and restore normal Spinner AI. NPC retains binding; no imprisonment, collection or removal.
- Important source limitation: native ordinary enemy update skips self-struggle when helpless AND without help (`KinkyDungeonEnemies.ts`, around 4366). Therefore the prior conversational claim that every helpless NPC will eventually self-recover is NOT established. Preserve native behavior; do not secretly add guaranteed recovery. This must be visible in runtime balancing evidence.
- NPC recovery uses visible multi-source relationship, no NPC leash equipment. Original Q132–Q144 equipment proposals are superseded.

## Lifecycle and verification

- One target per composite field. After closure, target selection is stable until escape/end/invalidation. Selection follows native hostility/perception, not unconditional player priority. Field stays closed after ending; Q162 reopening precondition was superseded by Q161B.
- Per-map setting snapshot at generation; current and revisited maps retain their decision. Future newly generated maps use updated setting. Test runtime default on. No active runtime toggle teardown.
- Save topology, plans, groups, HP, ownership, timers and native-random plan choices in map state. Saved render objects/timers are not state. Same-map reload audits source IDs, equipment and topology. Map departure clears active target control and owned source links, retains real equipment, field structures and paused map timers.
- Defeat/passout/jail transitions stop active control, retain formed equipment subject to native lifecycle rules. Old fixed-room saves unsupported.
- Topology prototype validates geometry/state transitions only. It cannot prove native combat balance, native NPC recovery, eight-source integration, actual group cooperation quality or art. Runtime calibration must measure construction/breach/capture/recovery timing with native tools, armor, resistances and action costs.
