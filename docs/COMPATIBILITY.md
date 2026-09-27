# Verified game environments

The current package is `Spiderlings_0.92.36-test.51.zip`. Its `mod.json` declares exactly KD 5.4.92 for the requested web and Windows environments:

```json
{
  "gamemajor": 5,
  "gameminor": 4,
  "gamepatch_min": 92,
  "gamepatch_max": 92
}
```

The native Mod manager compares the major/minor fields for equality and uses inclusive patch bounds. It shows a compatibility warning for other versions rather than prohibiting loading. The 5.5.0 evidence below is a historical reference check, not the current manifest target.

## Test.51 web traversal regression evidence

Test.51 fixes an extra movement step after a spider enters an owned web cell. In KD 5.4.92, test.50 moved from `(10,8)` to the web at `(10,7)` and then into the wall at `(10,6)` during one native `KinkyDungeonEnemyTryMove` call, emitting two movement events. Test.51 stops on `(10,7)`, emits one event, spends the same movement credit and rejects the next step into the wall. The final ZIP was loaded through the native Mod manager using read-only local 5.4.92 resources in Chrome. It also passed the previous 40-turn lure-waiting scene and started capture through native melee in the enclosed-prey scene at turn 7.

The regression executes the pinned 5.5.0 movement function with the real Spiderlings field and mobility modules, covering a wall, empty space or another actor behind the web and effect-tile cancellation. Repository checks, 12 policy tests, 324 public tests, the complete 619-test local watcher and final ZIP verification passed.

The package is 25,518,363 bytes, SHA-256 `7f10408f210b64e7101ba0b3af226ddf04a10d32aee95faccd048cc37da79614`. Evidence is retained in the parent workspace at `.scratch/spinner-wall-20260927/`. The wall probe had no page errors; the world-turn capture run retained only the known native audio play/pause messages. This version was not separately rechecked in the online game, the Windows executable shell or the user's save.

## Test.50 Spinner regression evidence

Test.50 fixes repeated lure movement between tiles and resumes native pursuit and melee when sensed prey enters the common field core, after assigned gate work. A web boundary does not automatically equip restraints on an idle player; capture still requires a real melee hit and at least two eligible Spinners.

The final ZIP passed controlled KD 5.4.92 world-turn checks in Chrome using the read-only Windows installation's game resources over an isolated local HTTP server. Test.49 alternated between two positions for 40 turns in the outside-prey scene; test.50 stayed on the safe lure tile for all 40 turns. In the inside-prey scene, test.49 sealed the field but its lure stayed outside and no capture started over 40 turns. Test.50 completed paid sealing, approached the player, and started capture through a native melee hit at turn 7. A separate lone-Spinner scene confirmed ordinary binding attacks after sealing, without starting the two-source capture. The new package was not separately rechecked in the online game or desktop executable; their earlier test.48 results remain below.

Repository checks, 12 policy tests, 324 public tests and the complete 618-test local watcher passed. Final ZIP verification matched all 148 allowlisted entries to source. Native result logs retain the game's audio play/pause interruption messages; no other page errors occurred in the final scenarios.

Package SHA-256: `b30a4640a627f29ef311e30acb22658f2a9abf64795a00df67b8dd14cb2b8170`. Local evidence and the repeatable runner are in the parent workspace at `.scratch/spinner-bugs-20260927/`. The reported recordings' precise game/Mod versions and other enabled Mods have not been confirmed.

## Test.49 version declaration evidence

Test.49 changed only `mod.json` inside the ZIP; its runtime scripts and artwork match test.48.

Test.49 is 25,560,453 bytes, with SHA-256 `7091094376f59b5b345928e9c935f9690e8f99225d8b920d4696ac813bf16bbe`. Native Mod-manager evidence for its version declaration is retained in the parent workspace at `.scratch/manifest-versions-20260927/`. The comparison includes the real 5.4.92 runtime and simulated version values passed through the same native warning UI; those simulated values are not additional gameplay compatibility tests.

## Test.48 behavior evidence

`Spiderlings_0.92.36-test.48.zip` was verified on 2026-09-27 in both requested environments. Use the same ZIP in the game's Mod manager and enable only one Spiderlings version.

| Environment                                                                                  | Observed game version                               | Result                                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Browser game embedded on [the author's itch.io page](https://ada18980.itch.io/kinky-dungeon) | 5.4.92, PixiJS 7.2.1                                | Passed with online game resources in Chrome 153                  |
| Maintainer's installed Windows game, `KinkyDungeon.exe`                                      | 5.4.92, Electron 28.2.0, Chromium 120, PixiJS 7.2.1 | Passed through the installed executable with an isolated profile |
| Read-only source reference                                                                   | 5.5.0                                               | Passed the Rune impact, visibility and interpolation regressions |

The browser build resolved to `https://html-classic.itch.zone/html/9244018-1557145/index.html`. Its `out/main.js` and the Windows installation's `resources/app/out/main.js` were byte-identical, with SHA-256 `2d3041a085cbe475a63227ff40709f6d9c1595c77a58545c69edf359a57605a4`. Versions were read from the running game with `TextGet("KDVersionStr")`; the desktop shell's package version is not the gameplay version. Future itch.io updates need a new check.

## Package and coverage

- Runtime commit: `1e2eda5625a4f3be9954c031d73fd17280145a7f`.
- Package: `Spiderlings_0.92.36-test.48.zip`, 25,517,797 bytes.
- Package SHA-256: `e8ec23293d08268e9c459fc1b54328b310b865fd0f00cf4182d41eeaa5393d2f`.
- Required checks passed: repository checks, 12 policy tests, 322 public tests, 616 complete local tests including the public group, and final ZIP verification.

Both 5.4.92 environments loaded the final ZIP through native `KDLoadMod` and `KDExecuteMods`, started a new game and exercised these scenarios:

- Mage's normal Regular overlay, casting particles and glow, including 0/120/240 ms fade and expiry without a world turn.
- Hex warning and activation, the three collapse stages, silk-bolt orientation and trails, WebCaster projectiles and persistent ground silk.
- Evaded Jumper attacks without false impacts, and a brief highlight after paid Spinner construction.
- Rune placement, arming and the triggered 3-by-3 warning boundary.
- Rune binding an NPC after its caster leaves, with no false impact on shielded or immune targets.
- Marks at a visibility boundary, hidden-target exclusion, and attached marks and impacts following native movement interpolation.

No Spiderlings resource failures or page script errors occurred. The browser also requested the game's missing `Game/Locks/Red.png`; this was outside the Mod and did not fail the scenarios. The installed executable reported no page errors or unhandled rejections. Game files and the user's save profile were unchanged.

These are controlled native scenarios, not a complete playthrough, natural AI selection-frequency measurement, existing-save migration check or other-Mod compatibility test. They establish support for these exact runtime builds, not every 5.4.x or 5.5.x patch. The compatibility extension required no further runtime changes or package rebuild.

The maintainer's local evidence is retained under `.scratch/spell-effects-review-20260927/` in the parent KD workspace: `审查记录.md`, `兼容验收.md`, `compatibility/fingerprints.json`, and the `web`, `local` and `desktop` result and screenshot directories. The local HTTP run is supplementary; the desktop result uses the installed executable and a `file:` game URL.
