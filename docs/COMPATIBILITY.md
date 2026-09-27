# Verified game environments

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
