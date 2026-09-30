# Spiderlings

**English** | [简体中文](README.zh-CN.md)

Spiderlings is a Kinkiest Dungeon Mod for KD 5.4.92, with spider encounters, layered webbing restraints, cocoons and a pink webbing option.

## Download and install

1. Download [Spiderlings_0.92.38.zip](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/download/v0.92.38/Spiderlings_0.92.38.zip) from the [formal Release](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/latest).
2. Load the ZIP through the game's Mod manager.
3. Enable one Spiderlings version at a time.

Use the attached installable ZIP. GitHub's automatic Source code archives contain the development repository and cannot be loaded directly as a Mod.

The current test package is `0.92.36-test.69`. The previous test.64 native acceptance covers KD 5.4.92 and official GitHub `5.5` commit `12a77c8b`, which reports 5.5.3. Every runtime delivery now fetches that branch and runs native acceptance on both targets. Test.60 lets hostile NPCs attack Spinner webs, pulls escaped players through open breaches, and prevents zero-time load refreshes from advancing construction. Test.59 adds persistent enemy silk and a native four-piece tome binding set, repairs both colors of the NPC legbag, and fixes extra payment when a completed NPC capture is retried. The starting demo perk is removed; the reusable test field remains available through the console. Test.58 adds seven authored Spinner wrapping stages in both colors, plays the final 500 ms after control returns, and tucks away the tail. Test.57 restricts Mage runes to Mage casters and removes the Spinner silk leash from generic restraint selection, while preserving normal spells and exact-ID recovery equip. Test.56 adds two rare Mage weapon drops: Tome of Silken Binding and Silkweaver's Staff. Cocoon Convergence uses 4 base mana and resolves after two subsequent turns; Silken Snare binds the first hostile target before slowing it. Each eligible Mage loot event has a 15% chance to drop one unowned weapon. The test package retains Test.55, which makes Spiderling Squad an optional -2-point disadvantage with six spiders, honors nest reinforcement weights for Mage at any floor, and keeps the Mage's abdomen pattern attached through facing changes and casting. It includes the previous fixes. The Mod manager's major-5 hint accommodates both branches; it does not certify every 5.x version. The public [itch.io browser game](https://ada18980.itch.io/kinky-dungeon) and the maintainer's installed Windows game were previously confirmed as 5.4.92. See [verified environments and coverage](docs/COMPATIBILITY.md).

Spinners prefer capture sites across actual doorway, junction and narrow-corridor routes. They reuse native walls, preserve doors, and prepare visible but passable openings before spending actions to close them around prey. Nearby idle groups can reinforce a field based on their real travel distance; incoming helpers walk to their assignments and stop before occupied cells. When preparation finishes, workers assign waiting positions once from their current locations. After closure, helpers share recent native observations and move close to prey across their former waiting areas. A recently perceived approach can change which openings remain passable, with paid reopening before another mouth closes. A passage group ends its lure engagement after twelve turns without sight when native sensing also has no contact. Player-made breaches retain their damage and rebuild delay. Existing single-entrance enclosures and saves remain supported. See [passage planning](docs/spinner-passage-algorithms.md).

Test.68 lightens per-cell warning backing, replaces moving web decals with staggered thin silk strands, and gives resolved bursts a bounded bright core and accents. Fixed danger cells, ground-level purple/pink sigils and the absence of numeric countdowns are retained. It retains test.66 event delivery, reload protection, bounded geometry and Rune placement revalidation. Gameplay timing and balance are unchanged.

Mage silk bolts apply ordinary Spiderlings Webbing. Fixed per-cell warning marks show the full danger area while silk gathers inward, followed by an impact burst; active sigils use ground-level silk without numeric countdowns. Mage spells use a separate binding profile; this build adds no exclusive items.

## Versions

| Branch                                                                                  | Version           | Purpose                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`main`](https://github.com/duromumuyazu74-rgb/Spiderlings/tree/main)                   | `0.92.38`         | Formal release                                                                                                                                                                                                  |
| [Infestation PR #83](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/83)         | `0.92.36-test.24` | Infestation playtest with active Spinner construction and nest defense                                                                                                                                          |
| [Hood and rune Issue #84](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/84)  | `0.92.36-test.26` | Optional Spiderlings Hood, delayed 3-by-3 Mage runes, and no Mage arm restraint                                                                                                                                 |
| [Enemy Webs Issue #86](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/86)     | `0.92.36-test.29` | Paired Spinner art, v2 WebCaster effects, and Pink Spinner web cells                                                                                                                                            |
| [Hunting Grounds spec #90](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/90) | `0.92.36-test.65` | Separate five-nest Infestation (default weight 50; any primary faction) and three-nest Hunting Grounds (default weight 1000; Maidforce only), where ordinary Spiderlings patrol for NPCs of a different faction |

This test package includes both the five-nest Spiderling Infestation and the three-nest Spiderling Hunting Grounds. Hunting Grounds is occupied by the same ordinary Spiderlings found elsewhere. On this floor they patrol for NPCs of a different faction, including allies, shops and quest characters; same-faction actors are not prey. Native sight still governs combat, and native capture limits still prevent wrapping `nocapture` targets. It does not include the separate Nest prison experiment. Install only one Spiderlings package at a time. The Nest prison experiment uses its own `prison.alpha.N` version series.

Test.42 calibrates the default weights to 50 for Infestation and 1000 for Hunting Grounds across complete native journeys. Infestation accepts any primary faction; Hunting Grounds requires Maidforce. Both preserve that faction and are mutually exclusive. Across 5,000 normal journeys in each tested runtime, both labels appeared on about 5.35% of eligible nodes. Weights are editable in Mod settings; zero disables a modifier. Set them before starting a new game: KD builds the journey map up front, so existing previews and maps stay unchanged. Saved custom values, including the previous 750 default, are retained; change that value manually to use 1000. See the [parameter guide](KinkyDungeon-Spiderlings/Spiderlings_0.9_Parameter_Guide.md#幼蛛猎场楼层).

Test.40 fixes the shared death-handler collision so Maidforce destruction releases the extra Tunneler on either floor, preserves preset guards through the final Hunting Grounds population cap, and migrates cached test.32 Hunting Grounds maps when loading from a side room. Five-nest Infestation saves retain their identity and progress.

Test.31 gives each of the three original Infestation nests four guards and keeps descent locked until all three are destroyed. Spinner enclosure fields start at a 3-by-3 footprint and can expand with paid construction actions. Mobile spiders traverse owned webs faster. WebCaster silk can pin hostile NPCs; nearby spiders can then spend three actions to wrap eligible prey without killing it. BlindZombie can be pinned but cannot be wrapped away.

The test branch retains its `0.92.36` baseline and includes the compatibility fixes carried into formal `0.92.38`. It adds experimental Spinner capture and Mage Spiderlings. Mage silk bolts deal damage and attempt one eligible ordinary Webbing restraint on a successful hit. Mages also place visible rune traps. In test.26, a rune shows a glowing spider icon while being placed, then warns for one turn over a 3-by-3 area after triggering. Targets still inside receive silk binding. On a newly generated ordinary map, one Mage appears from floor 5 or effective security 0 when there is a legal cell and room under the Spiderling population cap. The Mage enemy sprite has dedicated artwork. The separate Mage arm restraint is removed. The Spiderlings Hood setting is on by default; turning it off prevents the owned Hood even without the native NoHood perk, while Cocoon and Silken Awakening remain available. Only formal versions have GitHub Releases at present; build test packages locally using the [development guide](docs/DEVELOPMENT.md).

Test.28 adds T_Swizzle's matching Pink border and tether art to the existing Normal set, rotates the four Spinner field corners to align with their straight edges, and replaces all four WebCaster projectile effects with their v2 Normal/Pink pairs. The selected webbing color applies to these drawings as well.

Test.29 also applies the selected color to Spinner web-cell enemies, which reuse the WebSprayTrail art. This fixes the gray-white web cells that remained visible with Pink selected.

Test.38 distributes newly generated Infestation nests as 2+2+1 by default, with occasional 2+3 or a single group of five. At floor 3, selection probabilities are 80% / 18% / 2%. The five-nest probability rises by one percentage point per floor to 30% at floor 31, reducing 2+2+1 accordingly. Placement tries another legal grouping when terrain cannot support the selected one. Idle mobile Spiderlings near nests choose distinct reachable patrol destinations to reduce WebCaster, Jumper and Mage crowding. Existing maps retain their nest positions and can also use these patrols. Saved single-entrance enclosures remain supported alongside the passage fields. Test.39 renders this boundary with the `SpiderlingsSpinnerTrap` edge and corner artwork and removes independent ground traps and stepping-triggered slowing. Old fields migrate without losing construction or durability. This package also restores the supplied Mage artwork, casting particles and glow layers.

## Development

Source, runtime artwork and build/check scripts live in `KinkyDungeon-Spiderlings/`. See [development and publishing](docs/DEVELOPMENT.md), [maintenance notes](KinkyDungeon-Spiderlings/MAINTENANCE.md), and [game design](docs/spiderlings-0.92-game-design.zh-CN.md).

Report bugs and track planned work in [GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues).

See [contribution rules](CONTRIBUTING.md) for code conventions and the PR workflow.

## Licenses

Chlorlne's original code contributions use MIT. Spiderlings artwork credited to T_Swizzle uses CC BY-NC 4.0, which permits noncommercial reuse with attribution. The edited ZapSplat sound effects remain under [ZapSplat's Standard License](https://www.zapsplat.com/license-type/standard-license/). The [license scope](LICENSE.md) identifies the covered files and exceptions. Other contributors' code and Kinky Dungeon retain their own terms.

## Credits

Art assets: T_Swizzle. Original mod author: anthropocentricity. Reset author: Chlorlne. Existing authorship in the manifest and source is preserved.

Sound effects obtained from [ZapSplat](https://www.zapsplat.com/); see [third-party notices](THIRD-PARTY-NOTICES.md) for the source tracks and modifications.

Kinky Dungeon code and native templates: Strait Laced Games LLC / Ada18980. See [third-party notices](THIRD-PARTY-NOTICES.md) for licensing boundaries.

Test.69 clips cross-cell Mage center artwork to visible cells, skips entirely hidden warnings and checks inward motion against a fixed visible filament set. The test.68 visual language and gameplay timing remain unchanged.
