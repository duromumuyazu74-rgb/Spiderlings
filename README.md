# Spiderlings

**English** | [简体中文](README.zh-CN.md)

Spiderlings adds spider encounters, progressive silk restraints, capture fields and Mage spells to Kinky Dungeon. Normal and Pink artwork are selectable in Mod settings.

## Versions and installation

| Channel                     | Version           | Availability                                                                                                                                 |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Formal release              | `0.92.39fix1`     | [Download the installable ZIP](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/download/v0.92.39fix1/Spiderlings_0.92.39fix1.zip) |
| Test release: Prison + Boss | `0.92.39-test.14` | [Pre-release ZIP](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/download/v0.92.39-test.14/Spiderlings_0.92.39-test.14.zip)      |

1. Download the ZIP for the desired channel above, or build the selected development candidate using the [development guide](docs/DEVELOPMENT.md).
2. Load that ZIP through the game's Mod manager.
3. Enable only one Spiderlings package at a time. Back up saves before changing versions.

GitHub's automatic Source code archives are repository downloads, not loadable Mod packages. A PR's CI artifact is a candidate tied to its commit; its verification scope is recorded separately.

Test.14 combines V6 Nest Prison and the Matriarch Boss, adds two free direct-start perks and shortens Boss feedback. Initial automatic saves preserve selected perks, the chosen spawn and captive identity. The same ZIP passed all 75 native checks and seven locale loads on each of KD 5.4.92 and official KD 5.5.6, plus 1,204 local regressions; details are in [COMPATIBILITY.md](docs/COMPATIBILITY.md). Escape and balance playtesting continues in [#76](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/76) and [#165](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/165). Earlier source versions remain under [Git tags](https://github.com/duromumuyazu74-rgb/Spiderlings/tags). See [current progress](docs/STATUS.md) for delivery status.

Hostile silk contacts accumulate uncapped Silk Density, qualifying Cocoon at 100 after the existing equipment prerequisites. Density increases escape work and starts to disperse after ten world turns without a qualifying silk hit, including while restrained. Ordinary faction queries skip unrelated escort/custody checks, reducing repeated equipment and field scans without changing population or reinforcement rules. See [the experiment rules](docs/PRISON-EXPERIMENT.md).

## Current development gameplay

Development source `0.92.39-test.20` includes the fixed 81×63 V6 Nest Prison and the [Matriarch demo](docs/BOSS-DEMO.zh-CN.md). The prison has an upper cross junction, two connected middle fields, a lower storage field, a main-nest enclosure and a mandatory exit junction. Native barrels and chests occupy side areas; actual Spinners build and close the six authored sites under the existing workforce and project limits. The Matriarch occupies nine cells in a separate Court reached from the prison. Victory and defeat return to that same prison; support formations retain safe positions near walls.

Eight Court Spinners build nine adjacent rings from separate directions, then attack after the innermost ring closes. Boss support Jumpers retire after one resolved attack. The tracking rune's base movement cost is 1.5 world turns per cell.

The Start category offers two free, mutually exclusive perks: Nest prison start begins in the prison chamber; Matriarch start begins in the Court with a connected prison for returns. Other selected perks determine equipment, including Silken Awakening. Boss skill feedback is shorter while retaining warnings and world-turn countdowns.
Recovery and newly equipped prison-escort carriers use the artist's white and pink Silk Leash artwork. Nine cord poses and the collar follow the existing Pink silk setting. See [Leash artwork](docs/leash-art.md).

Web slow and Silk density each have five prepared status icons; Weave resonance has its own icon. Native counters show the stack count and density. See [status icons](docs/buff-icons.md).

Captured field prey retains its field attribution. Spiderlings assigned to interception actively attack competing NPC escorts; other members keep their field duties. Player recovery starts only after an actual inside-to-outside field crossing while wearing the leg bag. Wearing it or moving off-center inside the field does not qualify. Approved contacts use native paid attacks and return the player to the exact nearest reachable center. Maidforce members and both native Adventurer-faction Maid Knights are Spiderlings rivals.

- Webbing progresses independently by body region. The Hood toggle, native equipment compatibility and Cocoon admission rules remain separate. See the [parameter guide](KinkyDungeon-Spiderlings/Spiderlings_0.9_Parameter_Guide.md) for values and conditions.
- Spinner fields use paid construction, repair and gate work. A global controller handles support requests and loans; each field commands its Spinners. Workers, travelling reinforcements and usable staff are counted separately. Large legal layered enclosures are preferred, with passage fallback where appropriate.
- Layered capture fields require 1, 3, 6, 10 permanent Spinners for one through four live layers. Global command fills minimum allocations before optional support and preserves donor minimums. Own-field missions retain residency; allocation and actual arrival remain separate. Population shortages pause additional independent projects.
- New independent fields need `floor(n / 4)` permits from living eligible hostile Spinners and must fit the configured maximum, which defaults to three. The permit count does not overwrite that setting. A nearby character triggers readiness demand during planning; actual movement, combat and Capture still require their native conditions.
- Infestation has five objective nests and two initial three-member crews. Hunting Grounds requires the native Maidforce primary faction, has three six-member nest crews, and uses the global spider cap plus twenty. Initial large fields depend on legal space and permits. Both floor weights default to 200; weights are conditional choices, not global encounter percentages.
- Mage bolts, runes, Hex and Collapse keep separate spell state and visible danger cells. The Tome and Staff provide player silk attacks and abilities. Six native Journal entries record Spiderlings discoveries.
- Eligible NPC prey can leave nonlethally after six consecutive turns of sustained owned silk control; struggle or rescue can interrupt this. Capture, recovery, native damage and death retain their separate rules.

These describe this development candidate. Older releases and saved encounters may differ; historical results are in [the archive](docs/archive/README.md).

## Development

Source, runtime artwork and maintenance scripts live in `KinkyDungeon-Spiderlings/`.

- [Documentation index](docs/README.md) and [current progress](docs/STATUS.md)
- [Runtime modules](docs/RUNTIME.md) and [ownership contracts](docs/MODULES.md)
- [Development, focused tests and packaging](docs/DEVELOPMENT.md)
- [Maintenance guide](KinkyDungeon-Spiderlings/MAINTENANCE.md)

For development feedback, preview `npm run test:affected -- --base <starting-commit> --plan`. Run without `--plan` for selected public tests; add `--include-local` for selected local contracts. Native scenes are recommendations. Final gates remain in [CONTRIBUTING.md](CONTRIBUTING.md#verification).

Report work through [GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues), with the Mod version, game version and a reproducible encounter when possible.

## Licenses

Chlorlne's original code contributions use MIT. Spiderlings artwork credited to T_Swizzle uses CC BY-NC 4.0, which permits noncommercial reuse with attribution. The edited ZapSplat sound effects remain under [ZapSplat's Standard License](https://www.zapsplat.com/license-type/standard-license/). The [license scope](LICENSE.md) identifies the covered files and exceptions. Other contributors' code and Kinky Dungeon retain their own terms.

## Credits

Art assets: T_Swizzle. Original mod author: anthropocentricity. Reset author: Chlorlne. Existing authorship in the manifest and source is preserved.

Sound effects obtained from [ZapSplat](https://www.zapsplat.com/); see [third-party notices](THIRD-PARTY-NOTICES.md) for the source tracks and modifications.

Kinky Dungeon code and native templates: Strait Laced Games LLC / Ada18980. See [third-party notices](THIRD-PARTY-NOTICES.md) for licensing boundaries.
