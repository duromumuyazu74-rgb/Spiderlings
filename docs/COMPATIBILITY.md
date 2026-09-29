# Verified game environments

The current package is `Spiderlings_0.92.36-test.60.zip`. Every runtime delivery must pass KD 5.4.92 and the latest fetched official GitHub `5.5` commit. The repeatable command is `npm run test:compatibility`; see [setup and coverage](DEVELOPMENT.md#dual-version-runtime-acceptance).

Its `mod.json` uses the native major-version hint with minor and patch checks disabled:

```json
{
  "gamemajor": 5,
  "gameminor": -1,
  "gamepatch_min": -1,
  "gamepatch_max": -1
}
```

The native Mod manager compares enabled major/minor fields for equality and uses inclusive enabled patch bounds; `-1` skips a field. It cannot express the two separate supported targets in one manifest. This hint avoids a false mismatch on either tested version; it does not establish compatibility with every 5.x build. The exact tested versions and commits below define the verified scope. The old local 5.5.0 tree remains a historical reference.

## Test.60 completed normal-test acceptance

On 2026-09-29, the same final `Spiderlings_0.92.36-test.60.zip` passed all thirty native scenarios plus the shared fixture setup on KD 5.4.92 and freshly fetched official GitHub `5.5` commit `12a77c8b9e72dbbf9501aed12f1de839ac655eb6`, reporting KD 5.5.3. The successful final fetch was at `2026-09-29T13:46:53.635Z`. The package has 168 allowlisted entries, 24,787,662 bytes, SHA-256 `2ea4d8ac1b9d276bd8c9ebfc662ec0c76ddb03cc8c9a38f7a3fb10ab3270f200`. Runtime and acceptance source is recorded in commit `9364f030d921fdc8372d190371d9991ae62adf16`; the following documentation commit does not alter the payload.

Native acceptance exposed and now verifies fixes for AI-selected web breaching, recovery routing through an open breach, and extra construction during the zero-time refresh after load. The added scenarios cover 1/2/4/8-worker construction and repairs, action cadence, full-pin offense and recovery, capture interruptions, 2/4/8-source player recovery, Hex/Collapse timing, both floor objectives with actual descent, Normal/Pink rendering, and 310 sustained native turns. Final-package scenarios also retain the weapon silk, native tome set, NPC legbags, seven-stage capture animation and removed starting-demo checks. [Normal-test acceptance](normal-test-acceptance.md) records the Issue mapping, measured behavior, image assessment and controlled-scene limits. Prison experiment #68–76 remains independent.

Repository checks, 12 policy tests, 355 public tests and the complete 653-test local watcher passed. The final package checker reports zero errors, warnings or notes. Retained native screenshots were inspected. Evidence is in the parent workspace at `.scratch/kd-compatibility/runs/2026-09-29T13-46-53-651Z-0.92.36-test.60/acceptance.json`, with 31 passing checks in each per-game result. KD 5.4.92 records 21 known native audio play/pause interruptions and two requests for the native `Locks/Red.png`; it has no missing Spiderlings assets. KD 5.5.3 records no page errors, unhandled rejections or missing resources. SFX is disabled in the combat fixtures for the upstream sound defect described below. No official game source was modified.

An earlier final-package run exposed a timing assumption in the offense fixture: HeadMaidHairpin landed after native struggle had restored initial adhesion, correctly dealing full damage. The fixture now uses additional real binding hits and matched per-turn random seeds, recording the state at impact. It passed five consecutive isolated runs per game and the final complete run. This changed private acceptance code, not the package bytes.

### Paired performance on the final ZIP

Test.57 and final test.60 ran the same thirty zone/floor/seed inputs serially on each game with SFX disabled. Measurements cover synchronous map generation, the first native turn and ten later native turns per map. There are 30 active pairs on 5.4.92 and 29 on 5.5.3; both packages cancel the same insufficient-space seed. Values below are milliseconds, written as median / p95 / worst. No aggregate ratio exceeds the existing 1.25 investigation threshold.

| Game   | Measurement  | Test.57                | Test.60               | Ratios                |
| ------ | ------------ | ---------------------- | --------------------- | --------------------- |
| 5.4.92 | Generation   | 426.45 / 874.3 / 963.7 | 387.5 / 813.9 / 875.5 | 0.909 / 0.931 / 0.908 |
| 5.4.92 | First turn   | 52.35 / 66.5 / 99.4    | 50.7 / 63 / 94        | 0.968 / 0.947 / 0.946 |
| 5.4.92 | Steady turns | 9.75 / 438.9 / 1596.1  | 8.9 / 396.4 / 1543.2  | 0.913 / 0.903 / 0.967 |
| 5.5.3  | Generation   | 480.7 / 696.1 / 1108.7 | 487.9 / 685.1 / 910   | 1.015 / 0.984 / 0.821 |
| 5.5.3  | First turn   | 56.4 / 78.8 / 92.8     | 54.3 / 87.7 / 89.2    | 0.963 / 1.113 / 0.961 |
| 5.5.3  | Steady turns | 10.15 / 512.5 / 4821.4 | 10.7 / 480.7 / 1469.9 | 1.054 / 0.938 / 0.305 |

Initial entity count median/p95/worst is 57/72/73 in both 5.4.92 runs and 57/75/79 in both 5.5.3 runs. Native unseeded behavior and slow tail turns remain; these machine-local diagnostic timings do not establish a statistical speedup or guarantee smoothness. Raw measurements and exact hashes are retained in `.scratch/normal-test-closeout-20260929/performance-{baseline,github}-{test57,test60}.json`; `performance-summary.json` contains the aggregates.

## Test.59 enemy silk, NPC legbags and normal-line acceptance

On 2026-09-29, `Spiderlings_0.92.36-test.59.zip` passed twenty native scenarios on KD 5.4.92 and freshly fetched official GitHub `5.5` commit `12a77c8b9e72dbbf9501aed12f1de839ac655eb6` (KD 5.5.3). The successful final fetch was at 11:14:58 UTC. The same ZIP was used on both games: 168 allowlisted entries, 24,787,259 bytes, SHA-256 `430e949410a5de13f7de2aecbec84d6ead48de15e511fffc40beb9998fa1296e`.

The new `weapon-webbing` scenario verifies the four native conjured pieces, NPC dressing in both colors, both Stage7 legbag colors, native removal without inventory farming, save identity, resisted/foreign/staff exclusions, removal of the starting demo perk and the retained test-room entry. The existing `weapons` scenario now checks persistent silk from actual native Convergence, Snare and melee inputs. `npc-cooperation` uses real native AI for all six threat benchmarks and verifies paid-action exclusion, cancelled capture retry without another payment, persistent identity and exactly-once stolen-property return. `web-mobility` covers long pursuit, a faster web detour, reload, native breach and unchanged spray cooldown. `hunting-grounds` checks thirty seeded maps per game across floors 3, 7 and 12. Detailed coverage and remaining Issue rows are in [normal-test acceptance](normal-test-acceptance.md).

Repository checks, 12 policy tests and the complete 650-test local watcher passed, including all 353 public tests. The package checker reports zero errors, warnings or notes. Native NPC set and legbag screenshots were inspected. Earlier test.58 animation evidence remains applicable and its scenario also passes on this final ZIP.

The native acceptance is retained at `.scratch/kd-compatibility/runs/2026-09-29T11-14-58-120Z-0.92.36-test.59/acceptance.json` in the parent workspace. Per-game JSON includes every scenario and the package hash. Earlier failed runs are retained: the first fetch encountered a transient TLS EOF; a later full run exposed the upstream 5.5 `Windup` sound path defect. `KinkyDungeonMagicCode.ts` passes bare `MiniWind` to the sound player, and `KDWebAudio.ts` rejects the missing resource with an `AudioBufferSourceNode`. Cooperative combat and timing fixtures use the native Sound toggle to disable SFX; they do not suppress arbitrary errors or change gameplay functions. Audio is outside those fixtures. KD 5.4.92 still records its known native play/pause interruptions; the final 5.5.3 run records no page errors or unhandled rejections. No official game source was modified.

### Paired performance on the final ZIP

Test.57 and final test.59 each ran the same thirty zone/floor/seed inputs, serially on each game with SFX disabled. Measurements cover synchronous map generation, the first native turn and ten later native turns per map. Compare active pairs only: 30 on 5.4.92 and 29 on 5.5.3, where both packages cancel the same insufficient-space seed. Native unseeded generation may vary other actors; entity counts are retained rather than assumed identical. These are diagnostic timings on this machine, not a statistical speedup claim or a smoothness guarantee.

All values below are milliseconds, written as median / p95 / worst. No aggregate ratio exceeds the existing 1.25 investigation threshold; both packages still show slow tail turns.

| Game   | Measurement  | Test.57               | Test.59                | Ratios                |
| ------ | ------------ | --------------------- | ---------------------- | --------------------- |
| 5.4.92 | Generation   | 379.3 / 755.3 / 889.6 | 406.85 / 781.7 / 932.7 | 1.073 / 1.035 / 1.048 |
| 5.4.92 | First turn   | 47.15 / 66.2 / 97     | 49.25 / 74.6 / 96.9    | 1.045 / 1.127 / 0.999 |
| 5.4.92 | Steady turns | 9.8 / 402.5 / 1346.2  | 11.15 / 396.9 / 1129.5 | 1.138 / 0.986 / 0.839 |
| 5.5.3  | Generation   | 467.8 / 688.6 / 850.6 | 428.3 / 649.6 / 835.2  | 0.916 / 0.943 / 0.982 |
| 5.5.3  | First turn   | 55.2 / 75.4 / 80.9    | 50.3 / 72.3 / 76.1     | 0.911 / 0.959 / 0.941 |
| 5.5.3  | Steady turns | 8.55 / 450.1 / 4493.7 | 10.05 / 453.1 / 4777.1 | 1.175 / 1.007 / 1.063 |

Initial entity count median/p95/worst is 57/72/72 in both 5.4.92 runs; on 5.5.3 it is 57/75/79 before and 59/75/79 after. Raw measurements, exact package and scenario hashes, game commit and resource errors are retained in `.scratch/spinner-review-20260929/final-perf-{baseline,github}-{test57,test59}.json`; `final-performance-summary.json` contains the aggregates. These measurements do not substitute for the remaining human pacing and balance rows in #96.

## Test.58 Spinner artwork and completion animation

On 2026-09-29, the final test.58 ZIP passed sixteen native scenarios on KD 5.4.92 and freshly fetched official GitHub `5.5` commit `12a77c8b9e72dbbf9501aed12f1de839ac655eb6`, reporting KD 5.5.3. The upstream commit changed from test.57's reference despite retaining the same game version string.

The added `spinner-art` scenario starts from a real native Spinner capture. Five paid world turns deposit 0.2 each. On the fifth turn, saved progress reaches 1 and capture control ends immediately; actual render calls still report 0.8, 0.9 and 1 at 0, 250 and 500 ms of the final tween. The tail is hidden at completion. Both sheets load at 2048×2048 and restore the authored 2480×3508 canvas, including Stage7's `(906,1922)` trim offset. All fourteen color/stage combinations render on the native character. Completed equipment survives native save/reload without replaying the tween.

Repository checks, 12 policy tests, 344 public tests and the complete 641-test local watcher passed. The checker reports zero errors or warnings. The ZIP contains 167 allowlisted entries, is 24,784,258 bytes, and has SHA-256 `5296aaebe56369938dd74a8a784e6eba2d2799c86daa659c6b4d06f9714ca21c`.

Evidence is retained in the parent workspace at `.scratch/kd-compatibility/runs/2026-09-29T09-42-44-754Z-0.92.36-test.58/acceptance.json`, including per-version results and native character screenshots. The implementation worktree `.scratch/spinner-stage-animation-20260929/` retains build/check logs and `.scratch/Spinner捕获动画预览.gif`. That GIF samples the production renderer with the five-action timing curve on a native character; the paid-action and completion assertions come from the separate native scenario above. These controlled Chrome runs do not cover a full playthrough, other Mods or every outfit/pose. Broader human capture/breach acceptance remains under Issue #92.

## Test.57 owned effects and dual-version evidence

On 2026-09-27, the published test.56 ZIP reproduced both #78 omissions on KD 5.4.92 and official GitHub KD 5.5.3: a direct WebCaster call cast a Mage rune, and generic `leashing` admitted `SpiderlingsSilkLeash` alongside `BasicLeash` under collared-player tags. This tests the direct cast boundary, not a claim that the native WebCaster spell chooser selected a rune.

The final test.57 ZIP passed fifteen native scenarios on KD 5.4.92 and freshly fetched official GitHub `5.5` commit `f330c98e394e1e1a00b0662ae1fb815a6f9cad15`, reporting KD 5.5.3. The fetch at 15:48:55 UTC found no new upstream commit. The new `owned-effects` scenario rejects non-Mage and player rune casts without creating bullets, preserves WebCaster spray and Mage rune placement, excludes the silk leash from the real generic candidate pool, and equips the carrier by exact ID. Existing native scenarios cover friendly and orphaned runes; recovery unit regressions cover successful native-effect entry, carrier identity and reload.

Repository checks, 12 policy tests, 340 public tests and the complete 636-test local watcher passed. ZIP verification matched all 151 allowlisted entries to source. The package is 25,530,304 bytes, SHA-256 `7d63b7a04d2d12efd20a5ac8e1f878c412f43bf5efa1cc3895cdd74e25c7ddca`.

Evidence is retained in the parent workspace at `.scratch/issue78-fix-20260927/before/` and `.scratch/kd-compatibility/runs/2026-09-27T15-48-55-866Z-0.92.36-test.57/acceptance.json`; the implementation worktree retains `.scratch/issue78-build.log`. These controlled Chrome runs do not cover a full playthrough, user saves, other Mods, online deployment or the desktop shell. No runtime artwork or gameplay balance was changed.

## Test.56 Mage weapon drops and dual-version evidence

On 2026-09-27, the final test.56 ZIP passed fourteen native scenarios on KD 5.4.92 and freshly fetched official GitHub `5.5` commit `f330c98e394e1e1a00b0662ae1fb815a6f9cad15`, reporting KD 5.5.3. The fetch at 14:22:04 UTC found no new upstream commit. The new weapons scenario checks native weapon activation, melee input, spell casting, bullet collision, saving/loading, loot pickup and 72×72 inventory textures.

- Cocoon Convergence spends 4 base mana once and consumes a casting action, then resolves after two subsequent actions. Native save/reload preserves the pending circle; moving and switching weapons preserve its position and cooldown. The three rings receive base damage/binding inputs 2/8, 4/16 and 6/24. The corner, wall-protected target, ally and player are excluded.
- Silken Snare spends 2 base mana, passes an ally and strikes the first hostile target only. The hit enters native binding with no pre-applied slow; slow is applied afterward. A wall blocks the projectile and no ground web is created. Native ManaRegen discounts a first spell, so the cost probe applies its native suspension buff to measure undiscounted costs.
- Native melee receives explicit base binding 3 and 5. The tome's 15% binding buff uses one ID across main/off hand. A Mage with eligible native loot drops the missing staff exactly once under a forced successful roll, and native pickup adds it to the inventory. Unit regressions cover the strict 15% boundary, ineligible loot and owned-item selection.

Repository checks, 12 policy tests, 339 public tests and the complete 635-test local watcher passed. ZIP verification matched all 151 allowlisted entries to source. The package is 25,530,215 bytes, SHA-256 `4001bd90a18b9bede7f8b037cc2512e40adebe38ea0f2d712d67df8a975621e8`. Both inward-collapse screenshots were inspected.

Evidence is retained in the parent workspace at `.scratch/kd-compatibility/runs/2026-09-27T14-22-04-298Z-0.92.36-test.56/acceptance.json` and the weapon worktree's `.scratch/weapon-watcher.log`. KD 5.4.92 retains known native audio play/pause messages and `/Game/Locks/Red.png`; KD 5.5.3 has no page errors or missing resources. These controlled Chrome runs do not cover a full playthrough, the player's saves, other Mods, online deployment or the desktop shell. The agreed numbers are initial balance values, not playtest conclusions.

## Test.55 player-feedback fixes and dual-version evidence

On 2026-09-27, the final test.55 ZIP passed thirteen native scenarios on KD 5.4.92 and freshly fetched official GitHub `5.5` commit `f330c98e394e1e1a00b0662ae1fb815a6f9cad15`, reporting KD 5.5.3. The fetch at 10:45:11 UTC found no new upstream commit. The ten existing scenarios remain in place, with three additions:

- Saved nest reinforcement weights survive native settings reload. At floor one with low security, Tunneler=1 and Mage=1 allow both types; Tunneler=0 excludes Tunnelers; all five weights at zero spawn nothing. Other generation sources retain their own rules.
- Spiderling Squad is an optional negative Perk displaying −2 points and returning two available points. It adds exactly two Spinners and one each of Tunneler, WebCaster, Jumper and Mage on a fresh eligible map, independently of nest weights. The old global setting does not activate it, and the same map does not receive a second squad.
- Mage body layers follow both facings through fifteen native transform checks per game version, covering idle, Rune and Bolt states. The regular abdomen pattern stays visible at alpha 1 while particles and glow fade. Screenshots from both versions were inspected.

Repository checks, 12 policy tests, 332 public tests and the complete 628-test local watcher passed. ZIP verification matched all 148 allowlisted entries to source. The package is 25,519,542 bytes, SHA-256 `a049fcc7e7a9c1602caa8ab82715d037976d208005053e6367aefb25d2af4e1a`. The previous ZIP reproduced the detached Mage layer in both native versions; the nest-weight probe also demonstrated that the old low-floor Mage filter could leave Tunneler as the only eligible reinforcement.

Evidence is retained in the parent workspace at `.scratch/kd-compatibility/runs/2026-09-27T10-45-11-029Z-0.92.36-test.55/acceptance.json` and `.scratch/player-feedback-20260927/`. KD 5.4.92 retained known native audio play/pause messages and the native `/Game/Locks/Red.png` missing request; KD 5.5.3 had no page errors or missing resources. These controlled Chrome runs use native game resources and the final ZIP. The player's exact fifty-nest scene, online deployment, desktop executable shell, user saves, other Mods and complete playthroughs were not reproduced. Tunneler construction and each new nest's independent reinforcement allowance remain unchanged.

## Test.54 review fixes and dual-version evidence

On 2026-09-27, the final test.54 ZIP passed ten native scenarios on KD 5.4.92 and freshly fetched official GitHub `5.5` commit `f330c98e394e1e1a00b0662ae1fb815a6f9cad15`, reporting KD 5.5.3. The fetch at 10:14:51 UTC found no new upstream commit. The seven existing scenarios remain in place, with three additions:

- WebCaster projectiles bind NPCs after the caster dies or leaves. The live, dead and removed controls each added 6 Slime and reduced HP from 8 to 7.85 through actual native bullet updates.
- Friendly Mage Collapse, Hex and Rune affect hostile NPCs while leaving the nearby player's Will at 10 and adding no restraints. Hex and Rune also retain their faction after caster removal; Hex fields and pending blasts survive a JSON state round trip.
- Visible NPC wrapping renders normally. Hidden enemies and enemies behind a wall show neither the wrapping label nor strands; wrapping progress stays at one action.

Repository checks, 12 policy tests, 331 public tests and the complete 627-test local watcher passed. ZIP verification matched all 148 allowlisted entries to source. The package is 25,518,631 bytes, SHA-256 `a10f4973c183db6a695beb879cd7921292b6095640ff71ccfe898451070d7d08`. Five new regression tests failed on test.53 and pass after the fixes. Re-review against `ffe058438266bd0b04e3d3439fe90dbdda722a2e` found no further actionable defect in these changes.

Evidence is retained in the parent workspace at `.scratch/kd-compatibility/runs/2026-09-27T10-14-51-173Z-0.92.36-test.54/acceptance.json` and `.scratch/mod-review-fixes-20260927/`. Both versions' wrapping screenshots were inspected. KD 5.4.92 retained known native audio play/pause messages and the native `/Game/Locks/Red.png` missing request; KD 5.5.3 had no page errors or missing resources. These are controlled Chrome runs using native game resources and the final ZIP. Online deployment, the desktop executable shell, user saves, other Mods and complete playthroughs were not retested.

## Test.53 dual-version evidence

On 2026-09-27, the same final ZIP passed seven controlled native scenarios in each environment:

| Environment                                                                                                                                                   | Exact runtime                                                                                     | Result           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| Read-only installed game resources, served locally to Chrome                                                                                                  | KD 5.4.92; main script SHA-256 `2d3041a085cbe475a63227ff40709f6d9c1595c77a58545c69edf359a57605a4` | All seven passed |
| Freshly fetched [official GitHub `5.5` source](https://github.com/Ada18980/KinkiestDungeon/commit/f330c98e394e1e1a00b0662ae1fb815a6f9cad15), built separately | KD 5.5.3; commit `f330c98e394e1e1a00b0662ae1fb815a6f9cad15`                                       | All seven passed |

The scenarios cover native ZIP loading, Webbing progression through Cocoon and save/reload, Spinner waiting without oscillation, capture after prey enters the field, wall rejection after owned-web traversal, original/pink WebCaster flight and settled-web textures with expiry, Rune impacts after the caster leaves, and target-overlay visibility/interpolation. The seven scenario files group these checks into basic, wall, outside-prey, inside-prey, WebCaster, Rune and target-overlay runs. Retained screenshots were also inspected for model and effect rendering.

Repository checks, 12 policy tests, 327 public tests, the complete 622-test local watcher and final 148-entry ZIP verification passed. The package is 25,518,452 bytes, SHA-256 `ceb5032a3c9fab583574983379fa1287a50e4741c316c2cf16dfedfa9d19cc2d`. Only `mod.json` differs from test.52 inside the ZIP; its gameplay scripts and artwork are unchanged.

The final upstream fetch was recorded at `2026-09-27T08:17:34.779Z`. TypeScript 5.9.3 emitted the upstream tsconfig with `noCheck`, preserving source order; the resulting main script hash is `2fd6e4d15f7c06a2d7799a301071e86ed80dd631e1ccf66e4b7a932c45cae9d9`. This is native runtime acceptance, not an upstream type-check result. All four atlas groups were built from that commit's own assets, outside the source checkout. No game or art files were borrowed from the baseline or historical snapshot.

Local evidence is retained in the parent workspace at `.scratch/kd-compatibility/runs/2026-09-27T08-17-34-794Z-0.92.36-test.53/acceptance.json`, its per-version result files and screenshots, with check logs and the Chinese acceptance record in `.scratch/kd-compatibility/`. Known native audio play/pause interruptions remain in the logs. These controlled Chrome runs do not revalidate the online deployment, Windows executable shell, the user's saves, other Mods or a complete playthrough.

## Test.52 WebCaster artwork evidence

Test.52 removes the extra 180-degree rotation from WebSpray so the web's open edge faces forward. Native lingering WebSpray trails now draw the existing complete `SpiderWebHit` web at native opacity instead of stretched silk multiplied by 0.32. Short moving afterimages still use stretched silk; damage, binding, collision, lifetime and Mage collapse strands are unchanged.

The final ZIP was loaded through the native Mod manager in Chrome using read-only local KD 5.4.92 resources. Real WebSpray casts in all four cardinal directions passed for original and pink artwork. Visible settled webs used the expected complete-web texture at alpha 1, compared with stretched webs at alpha 0.32 in test.51. All tracked webs expired through native turns and the native render-time fade, leaving no live bullets or visible sprites. No page errors or unhandled rejections occurred. Screenshots, before/after results and the runner are retained at `.scratch/webcaster-visuals-20260927/` in the parent workspace.

Repository checks, 12 policy tests, 326 public tests, the complete 621-test local watcher and final 148-entry ZIP verification passed. The package is 25,518,429 bytes, SHA-256 `f6665292ceeec2b5af9c59f66e319296f8bfca85c25ba3a2f44234c282f1b03c`. It includes the test.50 and test.51 Spinner fixes. This visual change was not separately tested in the online game, Windows executable shell or the user's save.

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
