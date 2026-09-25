# Spiderlings

**English** | [简体中文](README.zh-CN.md)

Spiderlings is a Kinkiest Dungeon Mod for KD 5.4.x / 5.5.x, with spider encounters, layered webbing restraints, cocoons and a pink webbing option.

## Download and install

1. Download [Spiderlings_0.92.38.zip](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/download/v0.92.38/Spiderlings_0.92.38.zip) from the [formal Release](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/latest).
2. Load the ZIP through the game's Mod manager.
3. Enable one Spiderlings version at a time.

Use the attached installable ZIP. GitHub's automatic Source code archives contain the development repository and cannot be loaded directly as a Mod.

## Versions

| Branch                                                                                 | Version           | Purpose                                                                         |
| -------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| [`main`](https://github.com/duromumuyazu74-rgb/Spiderlings/tree/main)                  | `0.92.38`         | Formal release                                                                  |
| [Infestation PR #83](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/83)        | `0.92.36-test.24` | Infestation playtest with active Spinner construction and nest defense          |
| [Hood and rune Issue #84](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/84) | `0.92.36-test.26` | Optional Spiderlings Hood, delayed 3-by-3 Mage runes, and no Mage arm restraint |
| [Enemy Webs Issue #86](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/86)    | `0.92.36-test.28` | Paired Spinner trap borders and tether; v2 WebCaster effects; corrected corners |

This test package covers the three-nest Infestation redesign and does not include the separate Nest prison experiment. Install only one Spiderlings package at a time. The Nest prison experiment uses its own `prison.alpha.N` version series.

The test branch retains its `0.92.36` baseline and includes the compatibility fixes carried into formal `0.92.38`. It adds experimental Spinner capture and Mage Spiderlings. Mages use a damaging silk bolt and visible rune traps. In test.26, a rune shows a glowing spider icon while being placed, then warns for one turn over a 3-by-3 area after triggering. Targets still inside receive silk binding. On a newly generated ordinary map, one Mage appears from floor 5 or effective security 0 when there is a legal cell and room under the Spiderling population cap. The Mage enemy sprite has dedicated artwork. The separate Mage arm restraint is removed. The Spiderlings Hood setting is on by default; turning it off prevents the owned Hood even without the native NoHood perk, while Cocoon and Silken Awakening remain available. Only formal versions have GitHub Releases at present; build test packages locally using the [development guide](docs/DEVELOPMENT.md).

Test.28 adds T_Swizzle's matching Pink border and tether art to the existing Normal set, rotates the four Spinner field corners to align with their straight edges, and replaces all four WebCaster projectile effects with their v2 Normal/Pink pairs. The selected webbing color applies to these drawings as well.

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
