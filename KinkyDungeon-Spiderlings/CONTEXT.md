# KD Spiderlings

This glossary defines the terms used when evolving the Spiderlings mod for KD 5.5.

## Spiderlings encounters

**Map Spiderling population cap**:
The configurable maximum of living Spinner, Jumper, WebCaster and Tunneler entities on the current map, including allies. Defaults to 25; zero means unlimited. Nests and other species do not count. Native population, wandering respawns, the fixed squad, nest reinforcements and death summons share available slots. A fixed squad needs four slots or is skipped permanently for that map. Existing over-cap populations are retained; new arrivals pause until death or departure frees capacity.
_Avoid_: per-nest offspring cap, total spawns over a floor, nest count limit

**Native Spiderlings population**:
Spiderlings selected by KD's ordinary enemy population system. It coexists with the guaranteed squad and nest reinforcement and is not a fallback.
_Avoid_: guaranteed spawn, single-enemy fallback

**Guaranteed Spiderling squad**:
A default-enabled, one-shot encounter of exactly one Jumper, WebCaster, Tunneler, and Spinner on an eligible newly generated ordinary map. The group is additional to native population and is created only as a complete atomic unit.
_Avoid_: random four Spiderlings, natural spawn replacement, one-enemy fallback

**Compact squad placement**:
A complete four-cell placement selected from legal `2×2` squares first, or from other connected four-cell neighborhoods only when no legal square exists. It never reduces the squad size to fit a map.
_Avoid_: partial squad, arbitrary scatter, single-member fallback

**Nest reinforcement**:
A recurring child spawn owned and capped by one living hostile NestEntrance. It runs when the nest is aware of a visible player, natively perceives a hostile Maidforce target, or retains its short native alert flag from a hostile NPC attack. The attack alert spans one configured interval plus the current tick; it does not grant an immediate spawn. It is separate from native population, the guaranteed squad, Tunneler-created entrances, and the entrance's death burst.
_Avoid_: global reinforcement budget, NestEntrance spell list, death summon

**Grouped infestation nests**:
Five original objectives form a trio and a pair. Within each group every Euclidean distance is 4–5 tiles; every cross-group distance is at least 6, and the nearest cross-group pair is no farther than 8. Initial living hostile objectives therefore grant two nearby bonuses per trio nest (35%) and one per pair nest (25%). The complete placement retains connectivity and an attackable neighbor per nest. Failure cancels the objective; existing maps retain their positions.
_Avoid_: five mutually reinforcing nests, five guards per group, relocating saved objectives

**Nest lifetime Tunneler budget**:
The configurable number of successful Tunneler reinforcements from one nest over its lifetime. Defaults to 3; zero disables that species for recurring reinforcement. Its entity counter survives saves and map revisits; child death or nest construction does not refund it. New nests have independent budgets. It coexists with the living offspring and map caps. Legacy nests initialize from attributable Tunnelers still present, without reconstructing removed historical entities.
_Avoid_: simultaneous Tunneler cap, shared ancestry budget, total nest count limit

**Nest child**:
A living Spinner, Jumper, WebCaster, or Tunneler created by recurring nest reinforcement and tagged with its parent entrance ID. Untagged natural, squad, Tunneler, and death-burst entities are not nest children.
_Avoid_: every Spiderling near a nest

**Spiderlings nest prison**:
A persistent KD side room tied to one source floor. A selected living NestEntrance receives a native shortcut on admission. The original Cocoon equipment stays on the player; the saved chamber, buildable western floor, optional main-nest area and outer return exit stay on `KDMapData` across visits. The exit returns through native stairs with zero journey advance. `Spiderlings.Prison.enter({ entrance })` admits an arrived escort, while `recapture()` relocates the player inside the same map.
_Avoid_: regenerating the room on capture, making every ordinary nest an entrance, a separate map stack

## Spiderlings Webbing

**Spinner Capture strands**:
Temporary source-to-player strands admitted by a real Spinner melee hit inside a closed containing composite field. Admission needs two legal sources but records only the hitter. Up to seven more sources can spend later enemy operations to join. The strands pin translation without adding equipment and continue after field damage. One source weaves 6.25/100 per world turn against an escape goal of 50; two weave 12.5 against 75; further sources add 4 rate and 25 escape target. A paid pull adds 25 escape work for displayed stamina 10 and one world turn. Source loss preserves both counters, and escape wins simultaneous finishes. Escape holds only effective participants for the next six hostile operations. There is no retry cooldown or global immunity.
_Avoid_: proximity admission, free joins, field-breach cancellation, capture restraint item

**Spinner recovery leash**:
The real neck-restraint carrier established by a fresh Spinner hit after the player leaves a breached field, with up to eight distinct sources and one paid pulling executor. It remains separate from Capture strands and the leg bag; reusing an external leash preserves that item's state and native ownership.
_Avoid_: leash on breach, outside-position admission, collar replacement, copied external item state, free pull, native-plus-owned double movement

**Spinner leg bag**:
The leg bag occupies ItemLegs and uses the existing broad helical ribbon on the original canvas. Losing a Capture strands contest starts five paid world turns of wrapping without creating an item. The first successful wrapping turn adds the bag through native compatibility checks and deposits 0.2; later turns update the same item's `data.wrapProgress`. One source can finish it. Zero sources end temporary control while the exact partial item, lock, escape work, events and compatible linked equipment remain unchanged. A later lost contest resumes that item, while a complete bag blocks admission. Full bags require four Cut or six Remove/Struggle actions; incomplete bags require two or three. Native costs and accessibility remain effective.
_Avoid_: scaled full-body Cocoon, contest-owned wrap progress, forced replacement, animation frames as world turns

**Spinner training field**:
The legacy flat-room experiment retained for historical comparison, distinct from current map-aware Spinner encounters. Current acceptance uses ordinary/infestation maps and the ten native scenario fixtures in [runtime documentation](../docs/RUNTIME.md); the old fixed-training-room save and playtest flow are not current acceptance paths.
_Avoid_: decorative-only boundary, teleporting the player into a capture, immortal Spinner

**Spinner demo reaction opportunity**:
A real player input that advances time while a contest or leg bag is present, counted once even when the native action schedules multiple world turns. Jumper warnings still snapshot their target tile and resolve after two subsequent opportunities. Automatic weaving advances world effects without consuming player opportunities; NPC-targeted dashes retain world-time behavior.
_Avoid_: every tick is a player action, frozen world during weaving

**Silken Awakening start perk**:
The optional `SpiderlingsCocoonStart` perk granting two displayed perk points (internal `cost: -1`) in KD's Start category. A selected new game equips all ten Lv1, five Lv2 and eight Lv3 restraints, then Cocoon, retaining all twenty-four physical items. The starting Cocoon has no reinforcing outer webs. Loading the Mod or continuing the run does not equip the set again.
_Avoid_: three separate level perks, inventory-only reward, reinforced starting Cocoon

**Lv1 restraint set**:
The ten physical first-layer restraints: Arm, Mitten Left, Mitten Right, Belly, Legs, Ankles, Foot, Blindfold, Stuffing, and Gag. The two mittens are independent items sharing the KD `ItemHands` group. They use native `bypass` to apply despite inaccessible arms or hand-group blockers, while preserving no-overpower same-group linking checks and existing items. This does not bypass player escape restrictions. Mittens and Stuffing exist only at Lv1; Blindfold and Gag also have Lv3 variants.
_Avoid_: nine-item set, combined Mittens item, Lv2 mouth

**Lv2 restraint set**:
The five rendered second-layer restraints for Arm, Belly, Legs, Ankles, and Foot. Lv2 has no mittens, Blindfold, Stuffing, or Gag.
_Avoid_: seven Lv2 items, invisible Lv2, Lv2 hand/eye/mouth items

**Lv3 restraint set**:
The eight full-coverage third-layer restraints: Arm, Belly, Legs, Ankles, Foot, Blindfold, Gag, and Hood, each with power 3 and a two-effective-action escape target. They advance independently after each family's inner layers and before Cocoon, and remain manually equippable.
_Avoid_: manual-only stage, consumed inner restraints, Lv3 mittens or Stuffing

**Binding profile**:
A source-specific weight vector used by the shared exact-ID selector after equipment, pose, group, and native-add eligibility filtering. Each family contributes only its next layer; upgrades compete with empty parts using the same family weight, and saturated parts leave the pool. Every hit reads current physical equipment without a turn-boundary gate. It expresses preference and never supplies a fallback item.
_Avoid_: fixed application order, KD broad tag pool

**Native external restraint layering**:
Enemy Webbing, including Cocoon, may share a group with armour or ordinary external restraints when native addition permits a link without overpowering or removing blockers. External instances, locks, properties and escape progress remain during addition and after unlinking a Spiderlings outer item. Cocoon eligibility requires all eight Lv3 items physically equipped; Lv1 and Lv2 completeness is not required. Native incompatibility continues to reject the candidate.
_Avoid_: automatic external-item removal, armour-only eligibility, forced links, skipped set members

**WebSpray slow**:
The single capped transient SlowLevel state produced only by direct or trail effects carrying exact `WebCaster.WebSpray` provenance. It is independent of equipped Webbing and generic SpiderWeb terrain.
_Avoid_: LooseWebbing stack, equipment slow, generic SpiderWeb progression

**WebCaster crossfire**:
Two distinct living hostile WebCasters directly hitting within two player turns may add one extra eligible inner Webbing restraint, capped at one successful bonus per player turn across all casters. Both sources must remain aware, within six tiles and have a clear physical line to the player; stun, freeze, silence, helplessness, teleporting, death and lost sight break cooperation. Same-source hits and trails supply no bonus. Bonus selection rechecks physical equipment, stage, pose and native addition after the ordinary hit. Native kiting prefers legal steps that spread firing angles without moving closer; movement budgets and HP remain unchanged.
_Avoid_: shared HP, extra attacks, trail combos, same-hit Cocoon, forced equipment

**Cocoon**:
The final `ItemDevices` restraint applied by eligible enemy progression when all eight Lv3 items are physically equipped, without requiring complete Lv1 or Lv2 sets, or equipped directly from player inventory. Its own artwork covers the torso, limbs, and lower face, leaving the upper head exposed; direct inventory equipment needs no inner restraints and does not supply a Hood. It permits slow movement until three effective Cut, Remove, or Struggle actions and attack intents combined within twelve turns arm reinforcement for the next eligible WebCaster direct hit to add outer webs, pinning the player until the cocoon is removed. Missed melee attacks and offensive spell actions count once per committed action; healing and buffs do not. Pending reinforcement makes a hostile WebCaster prioritize the visible player and remain active until its native spray can land. The pending reinforcement survives waiting for the next hit; Spinner and Jumper can repair progress but cannot add outer webs. Outer webs are persistent state and a separate visual layer of this same item.
_Avoid_: Cocoon1–5 chain, consumed inner layers, TEST placeholder, automatic Hood

**Effective escape action**:
A legal Cut, Struggle, or Remove action that reaches the post-cost native struggle result and therefore counts toward a Spiderlings escape target. Queries, blocked actions, missing tools, and insufficient-stamina attempts do not count.
_Avoid_: UI click, query calculation, free progress

**Paired outer-layer gate**:
The player-facing removal order within Spiderlings chains. An equipped Cocoon is the outermost gate across groups for all twenty-three Lv1/Lv2/Lv3 items, including the split mittens and Hood, regardless of inner-set completion, artwork coverage, or reinforcement state. Cocoon itself remains operable; removing it restores the per-group rules. Matching Lv2 blocks Lv1 and matching Lv3 blocks Lv1/Lv2 for the five body families. Lv3 Gag blocks Lv1 Stuffing/Gag, and the head chain runs Lv1 Blindfold → Lv3 Blindfold → Lv3 Hood. A blocking outer item hides the covered item's HUD and context-menu actions until removed and prevents player Cut, Struggle, and Remove against its inner items without spending an action or resources; unrelated restraints and system-level removals remain independent.
_Avoid_: global removal lock, consumed inner layers, inner-layer escape through an outer layer

## NPC silk combat

**Temporary silk subdual**:
Spiderling attacks use shared light tickle damage profiles for players and hostile NPCs: melee 0.05, dash 0.10, direct spray 0.05 and trail 0.01. Players receive eligible Webbing equipment; NPCs receive native Slime binding. Damage and binding have separate native resistance checks. NPC contact amplification is capped at twice its scaled input to prevent flat weakness bonuses overwhelming these tiny amounts. Native immunity, shields and struggling remain effective. Subdual means native helplessness, not permanent capture, recruitment or collection. Successful melee binding consumes the attacking Jumper; Spinners and WebCasters remain for repeated support.
_Avoid_: guaranteed capture, player Webbing equipment on NPCs, HP damage as binding

**NPC silk gag**:
An NPC with attributed Spiderling Slime binding cannot talk or send ordinary/commander distress signals while natively helpless. Recovery restores native speech immediately; exhaustion of Slime clears attribution. The attribution survives saves and is created only by an actual binding increase from an owned attack. Existing unattributed Slime is not migrated, and unrelated Slime or resisted hits do not qualify. It adds no NPC equipment and does not grant permanent capture.
_Avoid_: permanent silence, gagging every Slime-bound NPC, an extra player restraint

**NPC crossfire binding**:
Two distinct currently qualified WebCasters successfully increasing the same hostile NPC's binding via direct hits within two turns may add base Slime binding 2 through native resistance/shield handling, with no extra HP damage. Qualification reuses activeWebCasters against the NPC. Each recipient has a four-turn successful-reward cooldown saved on the entity; loading clears pending pairs. Trails, repeated sources and blocked or binding-free hits do not qualify. This is separate from player equipment crossfire. WebCaster now has native glue resistance, including against player glue attacks.
_Avoid_: extra player restraints on NPCs, guaranteed capture, shared player/NPC cooldown

**Task nest evacuation**:
A Maidforce lethal HP crossing on an original infestation objective permits one extra Tunneler death summon before the normal burst, only when native death removal succeeds. The separate death allowance ignores lifetime/offspring quotas but respects the map cap and placement; it has no parent reinforcement ID. Normal nests, other finishers and non-kill removals do not get this allowance. Any replacement nest remains ordinary, and objective destruction still counts.
_Avoid_: last nonlethal attacker attribution, guaranteed spawn on a full map, regenerating objective IDs

**Infestation clearing and quiet garrison**:
New task nest groups separately open ordinary walls and debris inside each group’s bounding rectangle plus one tile of walking margin; the gap is not carved as one large rectangle, retaining interactive/protected tiles and borders. Carving occurs only after successful five-nest creation and refreshes native navigation. Saved maps are not carved again. On an infestation map, wild mobile spiders within twelve Euclidean tiles of the original five nest positions share a fifteen-turn peace timer. A perceptible hostile player or capable NPC within twelve tiles of a participating spider or surviving objective nest resets it. Perception uses native vision, blind sight and LOS from either NPC; player threats require spider perception and aggression. Helpless, imprisoned, stunned, frozen and noAttack NPCs do not count, while partial binding and recovery still count. After fifteen quiet turns, retain the five closest wild spiders and remove the excess without killing. Allies, party/captive spiders, remote spiders and all nests remain; no minimum population is spawned. Timer/anchor positions persist on the map, and ordinary maps are unaffected.
_Avoid_: five per nest, killed spiders, all-map population cap five, removing pets, reopening old map terrain

Clearing also preserves walls bordering areas inaccessible from the start before carving, using native eight-direction accessibility (including locked/interactable cells). Quiet-turn sampling checks both turn start and end and includes hostility between participating spiders; a contested turn cannot become quiet merely because its opponent leaves or dies before the end.

A player waiting inside an equipped Cocoon, without pending reinforcement, does not veto peace for either spiders or objective nests. This fifteen-turn garrison timer is independent of the twenty-five-turn Cocoon movement vigil. Attacks, struggles, spells and attempted movement (including anchored blocked movement) interrupt peace; Cocoon removal restores normal player threat checks. Nearby capable NPCs still veto peace, and newly reinforced spiders remain subject to the five-spider quiet garrison at turn end.

**NPC Dash target**:
The hostile NPC identity and ground tile selected when a Jumper begins its wind-up. Moving off that tile evades the impact; a replacement occupant is not the target. Death or lost hostility cancels the wind-up.
_Avoid_: homing leap, any occupant of the warning tile

## Spiderlings artwork

**Webbing display color**:
The player-selected original or pink artwork for all twenty-five Webbing layers, including Hood, Cocoon and OuterWebs. The default is original. KD persists the `spiderlingsPinkWebbing` boolean; leaving settings refreshes existing player model copies. Color selects a restraint texture folder and the matching original/pink PNGs for SpiderWeb, SpiderWebHit, WebSpray and WebSprayTrail; it does not change restraint/spell identity, mechanics, poses, layering or displacement. Pink uses twenty-one updated PNGs from `Webbing-pink-parts1.zip`, with both mittens, Cocoon and OuterWebs retained from `Webbing-pink-parts.zip` in independent `SpiderlingsWebbing*Pink` folders. Both twenty-five-frame atlases preload at startup into separate aliases; each color retains its source PNG fallback.
_Avoid_: new restraint variants, generated tint, shared aliases across colors

**Lv1 runtime art set**:
Ten formal runtime PNGs for the ten Lv1 restraints, now supplied by ten delivered artworks including independent Left hand and Right hand canvases in the updated recolor archive.
_Avoid_: nine runtime PNGs, combined runtime Mittens, Lv2 mouth assets

**Webbing atlas input set**:
Fifty explicit direct-fallback PNGs packed losslessly into two 4096×4096 Webbing atlases, one per color: each has ten Lv1 runtime images, five Lv2 runtime images, eight Lv3 runtime images, Cocoon, and its outer webs. The original twenty-five runtime images use the PNGs delivered in the complete `T's NEW Webbing (6).zip`: ten Lv1 (including independent Left hand and Right hand canvases), five Lv2, eight Lv3, Cocoon, and OuterWebs. The corrected Cocoon and newly supplied Hood are adopted in 0.92.4; no artwork is missing from this delivery. The pink atlas uses the current pink runtime art set. Both atlases are derived optimization, not the authority over their inputs.
_Avoid_: recursive asset scan, TEST placeholder input, legacy three-page atlas

**Full-coverage artwork**:
The Lv3 and Cocoon artwork that hides covered inner model layers through cover poses while preserving the equipped inner restraints. Hidden inner displacement layers stop rendering. Hood covers the complete head independently; Cocoon covers the torso, limbs, and lower face, leaving the upper head exposed.
_Avoid_: inner-item removal, cumulative duplicate rendering, Cocoon-implied Hood
