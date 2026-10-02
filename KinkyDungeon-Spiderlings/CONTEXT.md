# KD Spiderlings

This glossary defines the terms used when evolving the Spiderlings mod for KD 5.5.

## Item descriptions

`Desc` and `Desc2` describe the item's own material, form, coverage, texture and response to movement, in Spiderlings' gentle silk-weaving style. Keep other equipment, admission conditions, encounter procedures and escape-method advice out of restraint descriptions. Actual blocked actions and attachment results retain their accurate short feedback. A Cocoon description does not explain its inner-equipment gate; that rule belongs to action feedback and technical documentation.

## Spiderlings encounters

**Spiderling Hunting Grounds (幼蛛猎场)**:
A post-first-boss, Maidforce-qualified floor occupied by Spiderlings, with three objective nests, two or three staffed capture fields and dispersed legal NPC prey. Fresh maps provide three six-member nest crews and a roaming crew, aiming for 80–90% Spiderlings among mobile combat enemies hostile to the player; protected neutral actors and structures are separate.
_Avoid_: every NPC is a spider, one isolated arena, rewriting visited maps

**Spiderling Infestation (幼蛛侵扰)**:
The separate five-nest floor that preserves the native primary faction while two mixed six-member spider crews establish an expanding presence. Fresh maps target at least 50% Spiderlings among mobile combat enemies hostile to the player; existing objective groups and saved maps keep their history.

**Special-floor selection**:
The native journey's choice of an eligible Spiderling theme, with fresh default Infestation/Hunting Grounds weights of 200/1500 against keep-native 800. Zero disables that selection, saved custom values persist, and the weights apply to newly generated journeys rather than forcing a percentage of every biome or visited floor.

**Special-floor population (特殊楼层人口)**:
The theme-specific mix of necessary nest crews, optional roaming crews and eligible native arrivals within the shared population budget. A required crew is born complete or its newly created members are removed; this does not mean restoring terrain already opened for the theme. Objective nests, escape progress and later nest reinforcement retain their distinct roles.
_Avoid_: whole-map rollback, global spider scheduler, treating optional patrol failure as required-crew failure

**Special-floor prebuilt outer field**:
A staffed open capture area present at the start of a fresh Spiderling theme, with smaller bodies still requiring paid construction. Hunting Grounds needs at least two legal sites, prefers large fields and permits a smaller usable field when space requires it; insufficient space cancels the theme before births, and existing crews are not scattered to staff empty arenas.

**Persistent spider patrol**:
Idle mobile spiders travelling to distinct reachable destinations and hunting through native perception while invested Spinners keep their fields. Combat, capture, construction and recovery take priority; quiet time or completion of the escape objective does not retire living crews.

**Map Spiderling population cap**:
The configurable maximum of living Spinner, Jumper, WebCaster, Tunneler and Mage Spiderlings entities on the current map, including allies. Defaults to 25; zero disables this global cap, while themed floors retain their own mobile-spider budgets. Nests and other species do not count. Native population, Mage map-start placement, wandering respawns, the fixed squad, nest reinforcements and death summons share available slots. A fixed squad needs six slots or is skipped permanently for that map. Existing over-cap populations are retained; new arrivals pause until death or departure frees capacity.
_Avoid_: per-nest offspring cap, total spawns over a floor, nest count limit

**Native Spiderlings population**:
Spiderlings selected by KD's ordinary enemy population system. It coexists with the guaranteed squad and nest reinforcement and is not a fallback.
_Avoid_: guaranteed spawn, single-enemy fallback

**Guaranteed Mage Spiderling**:
One Mage placed before native random population on a newly generated ordinary map at floor 5 or effective security 0, if a legal cell outside authored spawn points and a mobile population slot exist. The map records its one-time outcome. This Mage is separate from the optional six-member squad; natural rolls may add more within the shared cap.
_Avoid_: treating the squad Mage as this independent guarantee, spawning on every revisit

**Guaranteed Spiderling squad**:
An optional native Enemies perk, `SpiderlingsSquad`, displaying cost -2 and granting two points through internal cost -1. It adds a one-shot encounter of two Spinners and one each of Jumper, WebCaster, Tunneler and Mage on an eligible newly generated ordinary map. The former global toggle does not select the perk. The group is additional to native population and is created only as a complete atomic unit.
_Avoid_: random six Spiderlings, natural spawn replacement, one-enemy fallback

**Compact squad placement**:
A complete six-cell placement selected from legal `3×2` or `2×3` rectangles first, or connected six-cell neighborhoods within Chebyshev radius three of an anchor when no legal rectangle exists. It never reduces the squad size to fit a map.
_Avoid_: partial squad, arbitrary scatter, single-member fallback

**Nest reinforcement**:
A recurring child spawn owned by a living hostile nest, subject to its living guard limit, lifetime Tunneler allowance, legal placement and the shared map budget. Species weights have one shared default table (Spinner8/Jumper2/WebCaster4/Tunneler1/Mage2); saved custom values and zero exclusions persist, and alerting a nest does not grant an immediate free spawn.
_Avoid_: global reinforcement budget, guaranteed Tunneler chance, death summon

**Independent Hunting Grounds nests**:
Three original objective nests, each initially owning two Spinners, one Jumper, two WebCasters and one Mage, with six living guard places on fresh maps. Previously saved four-member guard budgets remain compatible; destruction ends that nest's replenishment without relocating its field or regenerating an objective.
_Avoid_: a movement leash for wild spiders, relocating saved objectives

**Nest defense report**:
A short report of a task nest being attacked by a native hostile NPC, including a live native projectile source. Nearby defenders can investigate the known nest position without knowing an unseen attacker's current coordinates; builders retain invested work unless local danger justifies defense.

**Hunting Grounds population and prey**:

During native enemy initialization at zero or negative time, added rivalry, targeting, awareness and projectile-faction adaptation yield to native behavior. Their synchronous scope restores after nested updates or exceptions; normal positive turns enable the hunting rules below.
The same ordinary Spiderling species hunt independent mobile combat NPCs through native vision, perception, hostility and action payment, allowing prey to retaliate. Shopkeepers, prisoners, allies, party members, servants, ceasefire actors, scenery, immobile actors and dependent followers are excluded from added hunting, while already valid native combat and protected authored births retain their rules.
_Avoid_: hunting statues, faction-wide NPC immunity, counting nests or web walls as enemies

**Nest lifetime Tunneler budget**:
The configurable number of successful Tunneler reinforcements from one nest over its lifetime. Defaults to 3; zero disables that species for recurring reinforcement. Its entity counter survives saves and map revisits; child death or nest construction does not refund it. New nests have independent budgets. It coexists with the living offspring and map caps. Legacy nests initialize from attributable Tunnelers still present, without reconstructing removed historical entities.
_Avoid_: simultaneous Tunneler cap, shared ancestry budget, total nest count limit

**Nest child**:
A living Spinner, Jumper, WebCaster, Tunneler, or Mage created by recurring nest reinforcement and tagged with its parent entrance ID. Untagged natural, squad, Tunneler, Mage map-start, and death-burst entities are not nest children.
_Avoid_: every Spiderling near a nest

## Spiderlings Webbing

**Spinner capture field (捕获场地)**:
An owned area that admits capture only after its boundary is closed. Autonomous Spinners compare legal passage and enclosure sites near their recent recognized prey observation and prefer more usable interior space. A doorway, junction or narrow-passage candidate must have an actual capture interior that intercepts a map entrance-to-exit route; an unavoidable route ranks above a meaningful detour. A passage reuses real native walls and has two to four web gates. Native doors and protected objects are never replaced by web or counted as walls. If no suitable passage is available, a legal enclosure remains an option.
Nearby idle groups can join an existing field using their actual reachable distance, with arriving helpers tracked separately. A fresh recognized approach can redirect a plan before paid construction begins. The crew retains its invested or completed field and distributes waiting members among distinct legal peripheral stations; space does not detach its owners. Active capture, recovery, wrapping and nest-defense duties remain assigned. Each transition into a prepared, ready field assigns waiting gates from current member positions and remaining gate coverage. Membership changes or an unreachable partition blocked by a stationed coworker trigger repartition; ordinary waiting keeps the allocation stable. Incoming helpers may advance along an unoccupied path prefix when a coworker blocks the full route, but never move through that actor. Capture, recovery and nest-defense duties retain their priority. Workers prepare each passage gate while it remains open, then spend separate actions to fill its cells and connect it after prey enters the interior. While waiting for prey outside, at least two designated gates remain open for through traffic; prepared openings have a faint visual cue without collision. A recently perceived approach may change which gates are designated open, subject to the adjustment cooldown: workers open the new route before closing the old one. Prey departure triggers paid reopening. Changing openings or loading a save preserves web damage and rebuild cooldowns.
A Spinner has an eight-tile base vision range. Recognized native sight or actual hearing supplies player intelligence across the current map before planning; stealth recognition, terrain and native perception remain effective. Lost contact leaves only a historical position for fewer than four positive world turns. An ordinary group's lure can wait on its best safe tile. Six visible turns without a closer prey approach or the lure's own useful route progress switch it to active pressure pursuit; seeing the prey again does not resume indefinite waiting. Sensing prey inside the common core ends evasion. Assigned gate work takes priority, body workers finish the unfinished enclosure through paid actions, and the lure uses native pursuit and melee to deliver the hit required for capture. Once a passage is sealed, helpers share observations less than four turns old and physically approach the recorded prey position without their waiting-gate partition restricting the approach. Passage groups end their lure engagement after twelve turns without sight if the current turn also has no native sensing contact. Without a valid field plan, the Spinner uses native AI.

Tagged mobile spiders of either faction traverse any intact Spiderlings-owned web at 1.5 times ordinary movement credit and prefer its 2/3-cost path. This changes movement only; work and offensive actions keep their native cadence.
Existing single-entrance enclosures and their saved progress remain supported. New legal concentric enclosures prefer a 9-by-9 outer footprint, then 7-by-7, 5-by-5 or 3-by-3 where terrain requires a smaller site. Paid construction completes the outside body before smaller inner bodies. A radius-two inner ring retains a 3-by-3 usable core; only the smallest fallback has a one-cell core. Existing saved cores remain intact, and layer numbering remains inner to outer. One capable Spinner can build the field; saved completed rings retain their positions and construction. The web proxy and one actual spider may share a cell, but two actual actors may not. Non-spiders breach web boundaries through ordinary attacks. Native-wall changes invalidate passage closure; the Mod does not manufacture a replacement wall. Field construction and player Capture strands are separate capabilities. These fields belong to ordinary test gameplay; the Nest prison experiment remains independent. See [passage selection and route proofs](../docs/spinner-passage-algorithms.md).
_Avoid_: a required 3-by-3 interior, four-owner expansion gate, free planned segments, a new restraint from lone construction

**Spiderlings player intelligence**:
The current map's single recognized player report, shared by hostile Spinner crews with the same recorded position, direction and age. A living, actionable hostile Spinner, Jumper, WebCaster, Tunneler, NestEntrance or MageSpiderlings may supply native contact. Allied and party actors do not publish hostile intelligence, and an NPC target cannot stand in for the player. Reports expire after four positive world turns without renewed recognized contact; hidden movement and zero-time loading add no information. Shared-only engagement does not block idle recruitment from unpaid fields. An unfinished enclosure retains its sole available builder until body preparation ends. With recently recognized prey in an unfinished common core, assigned body workers retain paid construction even beside the prey, while the lure applies native pressure. If another actionable member can reach a legal unreserved work position for that body task, the lure leaves body work to that member and keeps its gate and pressure duties. Capture, Recovery and nest defense retain priority. Pressure uses live player coordinates only after native player recognition, otherwise a valid historical report. Existing NPC engagements retain their targets. A pending player Recovery duty may use player intelligence even when its crew has an NPC engagement.
_Avoid_: omniscient live coordinates, detection progress from sampling, ally-to-hostile reports, NPC-to-player identity substitution, expiry renewed by load

**Spinner Capture strands**:
Temporary source-to-player strands admitted by a real Spinner melee hit inside a closed containing composite field. Admission needs two legal sources but records only the hitter. Up to seven more sources can spend later positive-time enemy operations to join. Native zero-time refreshes and loading may audit existing sources but grant no joining, movement or weaving operation. The strands pin translation without adding equipment and continue after field damage. One source weaves 6.25/100 per world turn against an escape goal of 50; two weave 12.5 against 75; further sources add 4 rate and 25 escape target. A paid pull adds 25 escape work for displayed stamina 10 and one world turn. Source loss preserves both counters, and escape wins simultaneous finishes. Escape holds only effective participants for the next six hostile operations. There is no retry cooldown or global immunity.
_Avoid_: proximity admission, free joins, field-breach cancellation, capture restraint item

**Spinner recovery leash**:
The real neck-restraint carrier established by a fresh Spinner hit after the player leaves a breached field, with up to eight distinct sources and one paid pulling executor. After the first native carrier attaches, eligible departed crew members may pay a later operation to relay through a connected Spinner within three Chebyshev cells and native LOS. Every chain needs a current physical player-contact root; disconnected cycles cannot anchor themselves. Joining cannot also pull. Source removal, LOS or status changes audit the whole connected chain. Eight sources intentionally represent an extreme encounter without a withdrawal grace period. Eligible departed or slack sources pursue through native perception or recent valid player intelligence before trying another real hit. For a pending player duty, native sensing of that player can select the player over an NPC candidate; native recognition and melee still decide the new hit. A new leash needs a compatible collar and native equipment access; a failed attachment reports the unmet equipment condition and creates no pull. It remains separate from Capture strands and the leg bag; reusing an external leash preserves that item's state and native ownership.
_Avoid_: leash on breach, outside-position admission, collar replacement, copied external item state, free pull, native-plus-owned double movement

**Spinner leg bag**:
The leg bag occupies ItemLegs and uses the authored seven-stage leg wrap on its original canvas, ending above the ankles with exposed feet. Losing a Capture strands contest starts five paid world turns of wrapping without creating an item. The first successful wrapping turn adds the bag through native compatibility checks and deposits 0.2; later turns update the same item's `data.wrapProgress`. One source can finish it. Zero sources end temporary control while the exact partial item, lock, escape work, events and compatible linked equipment remain unchanged. A later lost contest resumes that item, while a complete bag blocks admission. Bag escape uses native chance, speed, tools, accessibility and progress; incomplete wrapping continuously scales its native chance and speed upward. Ordinary-panel calibration puts full bags above ordinary Lv3, with Cut most efficient. No action counter forces completion.
_Avoid_: scaled full-body Cocoon, contest-owned wrap progress, forced replacement, animation frames as world turns

**Spinner training field**:
The disposable flat room available through `Spiderlings.SpinnerField.enter()`, with reset and add-enemy controls for quick native tests. The starting demo perk is removed. Current map-aware encounters and the ten `SpinnerScenarios` fixtures remain separate; see [runtime documentation](../docs/RUNTIME.md).
_Avoid_: decorative-only boundary, teleporting the player into a capture, immortal Spinner

**Spinner reaction opportunity**:
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
The eight full-coverage third-layer restraints: Arm, Belly, Legs, Ankles, Foot, Blindfold, Gag, and Hood, each with power 3 and native escape parameters calibrated above Lv2. They advance independently after each family's inner layers and before Cocoon, and remain manually equippable.
_Avoid_: manual-only stage, consumed inner restraints, Lv3 mittens or Stuffing

**Native escape calibration**:
`WebbingData.ESCAPE_PROFILES` supplies native escapeChance, struggleSpeed and minimum speed for Lv1/Lv2/Lv3, the leg bag and Cocoon. Counts are simulation outcomes for an ordinary unperked panel, not hard gates: roughly one, two, then two-to-four actions; full bags are tougher and Cocoon additionally consumes much more stamina and gates its real inner equipment. Cut remains subject to native tool/environment access. Old counted-save work migrates once to native struggleProgress, capped below completion, without replacing equipment or locks. See the [test.77 simulation record](../docs/spiderlings-test77-balance.md).

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
The final `ItemDevices` restraint applied by eligible enemy progression when all eight Lv3 items are physically equipped, without requiring complete Lv1 or Lv2 sets, or equipped directly from player inventory. Its own artwork covers the torso, limbs, and lower face, leaving the upper head exposed; direct inventory equipment needs no inner restraints and does not supply a Hood. It permits slow movement until three effective Cut, Remove, or Struggle actions and attack intents combined within twelve turns arm reinforcement for the next eligible WebCaster direct hit to add outer webs, pinning the player until the cocoon is removed. Missed melee attacks and offensive spell actions count once per committed action; healing and buffs do not. Pending reinforcement makes a hostile WebCaster prioritize the visible player and remain active until its native spray can land. The pending reinforcement survives waiting for the next hit; Spinner and Jumper can repair progress but cannot add outer webs. After 25 inactive world turns, hostile Spinner, Jumper, WebCaster, Tunneler and MageSpiderlings disperse through native movement and stop attacking the passive Cocoon player; pending WebCaster reinforcement is the only species-specific exception. Renewed player activity restarts the vigil. Outer webs are persistent state and a separate visual layer of this same item.
_Avoid_: Cocoon1–5 chain, consumed inner layers, TEST placeholder, automatic Hood

**Effective escape action**:
A legal Cut, Struggle, or Remove action that reaches a post-cost native result. Native KD owns escape progress and completion; Spiderlings uses legitimate results only for Cocoon reinforcement frequency and explicit recovery-source removal. Queries, blocked actions, missing tools and insufficient-stamina attempts grant no owned work.
_Avoid_: UI click, query calculation, free progress

**Paired outer-layer gate**:
The player-facing removal order within Spiderlings chains. An equipped Cocoon is the outermost gate across groups for all twenty-three Lv1/Lv2/Lv3 items, including the split mittens and Hood, regardless of inner-set completion, artwork coverage, or reinforcement state. Cocoon itself remains operable; removing it restores the per-group rules. Matching Lv2 blocks Lv1 and matching Lv3 blocks Lv1/Lv2 for the five body families. Lv3 Gag blocks Lv1 Stuffing/Gag, and the head chain runs Lv1 Blindfold → Lv3 Blindfold → Lv3 Hood. A blocking outer item hides the covered item's HUD and context-menu actions until removed and prevents player Cut, Struggle, and Remove against its inner items without spending an action or resources; unrelated restraints and system-level removals remain independent.
_Avoid_: global removal lock, consumed inner layers, inner-layer escape through an outer layer

## NPC silk combat

**Mage Spiderlings combat**:
Mage is the Spiderlings specialist against Maidforce. Two unmitigated bolts killing an ordinary 8-HP Maid is intentional; a higher overall capture ratio is not a reason to reduce this role's damage. Native shields, resistance, hostility and each spell's existing target eligibility still apply. The summonable Mage can cast `SpiderlingsMageBolt`, `SpiderlingsMageRune`, `SpiderlingsMageHex` and `SpiderlingsMageCollapse`. Its direct bolt applies base 4 native glue HP damage and explicit base 6 Slime binding to eligible hostile NPCs, replacing implicit glue binding. The same native hit records only actual surviving added silk once, preserving resistance and shields. In test.80, the silk bolt uses the original spider icon as a placeholder with thin thread trails and a spread-web impact. The test.79 AI-generated silk-ball candidate is withdrawn and no longer used. Replacement runtime artwork must come from the user and artist; do not adopt AI-generated assets. Native shields, resistance and immunity still resolve the hit. A successful native `Damage` player effect applies base 0.5 glue damage and attempts one eligible ordinary Webbing progression. Missed or blocked bolts add no Webbing. All Mage spell applications use the independent `MageSpiderlings` binding profile, initially matching WebCaster's ordinary family weights while retaining Mage source identity. Future Mage-only restraints belong to this source's candidates; none are added in test.61. The Mage enemy sprite has its dedicated artwork. All Mage spawning shares the mobile population cap. Natural and guaranteed spawning follow the floor or security threshold; nest reinforcement uses its configured weight independently. The selected squad includes its Mage from floor one.

**Mage runes**:
On KD 5.5, each available Mage spell action has a one-in-four chance to select `SpiderlingsMageRune`; otherwise the Mage chooses among the bolt and its two larger spells when available. KD 5.4.92 retains native candidate selection because it does not emit `enumerateSpellOpts`. Both versions reject unavailable owned spells through native `castCondition` before paying enemy cooldown. A glowing spider icon marks the rune's one-turn placement; the icon disappears once the stationary rune is armed. A player or hostile Maidforce NPC stepping on the center triggers a glowing 3-by-3 warning, which resolves after two positive turns for NPCs and 2 + ceil(max(0, SlowLevel) / 2) turns for the player, sampled once on contact. Waiting or later slow changes do not refresh the deadline. The player receives one normal random Webbing progression, including the current Hood preference and Cocoon condition. Each hostile Maidforce NPC receives base 6 native Slime binding with native shield and resistance checks. The rune occupies one tile for up to 300 turns, carries its caster ID and phase through save/load, triggers once, survives caster death, and keeps the native `rune` tag for NegateRune. No more than three live runes belong to one Mage; friendly Spiderlings and other NPCs do not trigger it.

**Mage field spells**:
Shield Hex warns on a 4-by-4 ground area for two turns, then stays active for three turns. It immediately removes up to 3 shield from hostile Maidforce within the area. A target in the active field gains one mark stack each turn, up to three; its mark lasts 3, 4 or 5 turns from the last refresh. Shield fragility lasts three turns from the last field contact and increases actual shield damage from any attacker by 50%, capped at the shield remaining, without adding HP overflow. A successful direct Spinner, Jumper or WebCaster hit triggers a one-turn delayed burst centered on the hit target's tile: 1 stack affects that tile, 2 stacks a 3-by-3 square and 3 stacks a full 5-by-5 square. Burst binding follows the usual player Webbing resolver or native NPC Slime path. The existing rune remains independent.

Thousand-Silk Collapse charges for five turns. Its warning web moves through the outer 12 tiles, inner 8 tiles and center of a 5-by-5 square without corners. It resolves once after the charge, using each target's current tile. Outer, inner and center apply 1, 3 and 5 normal Webbing attempts to the player or native Slime attempts to a hostile Maidforce target. Hostile Maidforce receives base 1, 3 or 5 glue HP damage; the player receives base 0, 1 or 2. A dead caster cancels the charge; a completed blast starts a seven-turn cooldown. Both field spells draw from the existing T's Normal/Pink web art.

**Temporary silk subdual**:
Spiderling attacks use shared light tickle damage profiles for players and hostile NPCs: melee 0.05, dash 0.10, direct spray 0.05 and trail 0.01. Players receive eligible Webbing equipment; NPCs receive native Slime binding. Damage and binding have separate native resistance checks. NPC contact amplification is capped at twice its scaled input to prevent flat weakness bonuses overwhelming these tiny amounts. Native immunity, shields and struggling remain effective. Subdual means native helplessness, not permanent capture, recruitment or collection. Successful melee binding consumes the attacking Jumper; Spinners and WebCasters remain for repeated support.

Hostile NPC silk contact applies a short native ShieldDrain buff while a shield remains; sealed Spinner fields refresh it each turn on shielded hostile NPCs inside. Its power exceeds native shield regeneration by two, allowing shield to run down before normal native binding. Shielded targets still block binding, and breaking a web field ends its sustained pressure.
_Avoid_: guaranteed capture, player Webbing equipment on NPCs, HP damage as binding

**NPC adhesion**:
An actual direct WebCaster Slime increase opens an eight-world-turn pressure sequence for a hostile NPC. Successful paid Spiderling silk actions add their post-resistance Slime increase once per action; trails and crossfire add native binding but no pressure. The saved NPC ledger keeps current attributed Slime separate from recent pressure. Native removal proportionally reduces surviving pressure, and each contribution expires at its own eight-turn boundary. Named thresholds are BlindZombie/Maidforce 3/6, MaidforceMini 6/9, MaidKnightHeavy 9/15, DragonGirlCrystal 12/18 and DragonGirlShadow 15/24; other bound enemies use the max-HP and native binding-threshold-factor rule in `SpiderlingsNPCAdhesion.js`. Initial pin blocks voluntary translation. Full pin also scales outgoing direct damage to 0.65 before native defenses, but preserves attack and spell actions. Native helplessness remains independent and may follow continued Slime. NPC adhesion does not affect the player or create equipment. Its map-local clock and per-enemy ledger survive new-save reload.

**NPC silk gag**:
An NPC with attributed Spiderling Slime binding cannot talk or send ordinary/commander distress signals while natively helpless. Recovery restores native speech immediately; exhaustion of Slime clears attribution. The attribution survives saves and is created only by an actual binding increase from an owned attack. Existing unattributed Slime is not migrated, and unrelated Slime or resisted hits do not qualify. It adds no NPC equipment and does not grant permanent capture.
_Avoid_: permanent silence, gagging every Slime-bound NPC, an extra player restraint

**NPC crossfire binding**:
Two distinct currently qualified WebCasters successfully increasing the same hostile NPC's binding via direct hits within two turns may add base Slime binding 2 through native resistance/shield handling, with no extra HP damage. Qualification reuses activeWebCasters against the NPC. Each recipient has a four-turn successful-reward cooldown saved on the entity; loading clears pending pairs. Trails, repeated sources and blocked or binding-free hits do not qualify. This is separate from player equipment crossfire. WebCaster now has native glue resistance, including against player glue attacks.
_Avoid_: extra player restraints on NPCs, guaranteed capture, shared player/NPC cooldown

**Task nest evacuation**:
An independent 25% chance of an extra Tunneler when a Maidforce lethal hit successfully destroys an original task nest, subject to legal placement and the shared map budget. It is separate from weighted recurring reinforcement and does not replace the destroyed objective or refund its progress.
_Avoid_: last nonlethal attacker attribution, guaranteed spawn on a full map, regenerating objective IDs

**Nest clearing**:
The opening of ordinary walls and debris around newly placed task nests so guards and attackers can reach them, preserving interactive/protected terrain and previously inaccessible areas. Saved maps are not carved again; clearing grants neither free movement nor retirement of quiet spiders.

**NPC Dash target**:
The hostile NPC identity and ground tile selected when a Jumper begins its wind-up. Moving off that tile evades the impact; a replacement occupant is not the target. Death or lost hostility cancels the wind-up.
_Avoid_: homing leap, any occupant of the warning tile

## Spiderlings artwork

**Webbing display color**:
The player-selected original or pink artwork for all twenty-five Webbing layers, including Hood, Cocoon and OuterWebs. The default is original. KD persists the `spiderlingsPinkWebbing` boolean; leaving settings refreshes existing player model copies. Color selects a restraint texture folder and the matching original/pink PNGs for SpiderWeb, SpiderWebHit, WebSpray and WebSprayTrail, plus the Spinner web-cell enemy aliases that reuse WebSprayTrail; it does not change restraint/spell identity, mechanics, poses, layering or displacement. Pink uses twenty-one updated PNGs from `Webbing-pink-parts1.zip`, with both mittens, Cocoon and OuterWebs retained from `Webbing-pink-parts.zip` in independent `SpiderlingsWebbing*Pink` folders. Both twenty-five-frame atlases preload at startup into separate aliases; each color retains its source PNG fallback.
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

**Player weapon silk**:
The surviving native Slime attributable to player tome/staff melee and their spells, distinct from other binding and enemy adhesion. Partial silk gives a brief web impact; a fully helpless NPC displays the existing artist Cocoon only when owned silk alone is sufficient, and recovery removes that appearance without creating equipment.
_Avoid_: permanent partial bands, automatic Lv1 equipment, automatic NPC collection

**Tome convergence charge**:
Further weaving of the same fixed spell circle through its native weapon button before closure, up to three tiers. Each added tier costs real mana and a world action, delays closure and increases binding rather than expanding the damage mask or moving the target.

**Weapon sustain**:
Limited resource recovery from an effective paid hit and each independent prey's first lifetime complete owned-silk cocoon. Empty or unchanged hits, repeated recapture and player-created summons provide no renewable reward; spell mana recovery stays within half the actual paid cost and the convergence circle's final cap.
_Avoid_: repeatable mana extraction, invented free-spell mana cost, reward from unrelated binding
