# Spiderlings

**English** | [简体中文](README.zh-CN.md)

Spiderlings adds spider encounters, progressive silk restraints, capture fields and Mage spells to Kinky Dungeon. Normal and Pink artwork are selectable in Mod settings.

## Versions and installation

| Channel                       | Version            | Availability                                                                                                                         |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Formal release                | `0.92.38`          | [Download the installable ZIP](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/download/v0.92.38/Spiderlings_0.92.38.zip) |
| Current development candidate | `0.92.36-test.152` | Source candidate in [PR #149](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/149), targeting `test`; not a formal Release    |
| Nest prison experiment        | `prison.alpha.N`   | Separate [PR #77](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/77); not included in the ordinary test package              |

1. Download the ZIP attached to the [formal Release](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/latest), or build the selected development candidate using the [development guide](docs/DEVELOPMENT.md).
2. Load that ZIP through the game's Mod manager.
3. Enable only one Spiderlings package at a time. Back up saves before changing versions.

GitHub's automatic Source code archives are repository downloads, not loadable Mod packages. A PR's CI artifact is a candidate tied to its commit; its verification scope is recorded separately.

The development package is verified on KD 5.4.92 and the specific official `5.5` commit recorded in [COMPATIBILITY.md](docs/COMPATIBILITY.md). Every new runtime delivery fetches and tests the latest official `5.5` commit again. The manifest's broad 5.x hint does not certify untested versions. See [current progress](docs/STATUS.md) for source, package and integration status.

## Current development gameplay

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
