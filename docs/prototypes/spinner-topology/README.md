# Spinner topology review baseline

Download [index.html](index.html) and open it in a browser. The single offline file embeds ten fixed scenarios and six native KD map snapshots. It needs no installation, server or network. This is a topology prototype, outside the installable Mod.

This baseline reuses local archive `prototype/spinner-topology-20260921` at `4d6240a4e8f5d60ac88e9384b6dcb2f8dec75e36`, based on `476e897186a843e7c0ff6da5a26e06df017e279a`. The archive itself was never a remote artifact. [Spec #20](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/20) governs the design; [ticket #21](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/21) covers this portable baseline. Use this directory at the submitted Git commit for a retrievable revision. Its matching HTML SHA-256 is in [evidence/verification.json](evidence/verification.json).

## Review the artifact

1. The default scene is the regular room. Select **Adopt candidate**, then **Advance to ready / sealed** to prebuild with an open entrance.
2. Select **Place target in core**, then advance again to close the entrance. This is a debug placement, not simulated bait AI.
3. Choose **Inject single-cell damage** or **Inject 3×3 area damage** and click a web. Orange boundary-escape and blue floor-exit paths have different meanings.
4. Use the **Nested fields** guided walkthrough to prebuild, close and breach nested fields. Breaking the inner field alone leaves the outer barrier.
5. Use **Shared fields and breach** to create two groups sharing a physical link graph, then destroy a shared anchor. Both owners lose the incident links.
6. Use **Partial overlap durability** to inspect one physical span shared by adjacent boundaries. The walkthrough covers cell damage, area damage, a real-anchor breach and staggered owner collapse.
7. Use **Export state**, advance once, and **Restore state** to restore the exported state. Expand **Native KD snapshots** for six native-generated maps.

All unaware actors prebuild together. Core entry or the explicit Alerted control assigns one stationary lure. Workers reserve tasks, move toward distinct worksites and extend one cell per paid action within five clear tiles. Placed anchors supply endpoint cells; even a two-cell link requires a separate paid connection action. Each actor performs at most one operation per model world turn. Construction costs one budget point; movement and repair retain 1.5. The same room now prebuilds in 27/20/18 turns with 2/4/8 actors, including travel. Separate fixtures starting at legal worksites take 12/6/4 turns; see [current results](CURRENT-PACING.md).

Supplied groups, original static occupants, simplified eight-way movement, conservative protection and injected damage remain experiment limits. Native perception, combat, bait movement and multi-source leashes are not implemented. Model action cadence is not a change to native Spinner movement stats.

## Reproduce without dependencies

From the repository root, use Node.js 24:

```powershell
node docs/prototypes/spinner-topology/replay-durability.mjs
node docs/prototypes/spinner-topology/measure-pacing.mjs
node docs/prototypes/spinner-topology/build.mjs
node docs/prototypes/spinner-topology/verify-prototype.mjs
```

The durability recorder writes 14 focused replays and a summary. The builder rejects pacing or durability evidence from a different engine hash, then embeds the source and measured timing comparison into `index.html`. The verifier replays all 16 map walks, concave closure, shared destruction, per-cell AoE, dynamic invalidation and the 19/20-turn ownerless boundary. The map walks also check complete reachable regions beyond the floor exit and surviving shared geometry when one owner retires. It writes traces and `evidence/verification.json` with the HTML hash. A Node-only run marks browser checks `not-run`; it does not imply UI verification. Generated JSON can be formatted with the repository's Prettier command before committing.

Optional browser checks require an externally installed Playwright Core module and its matching Chromium binary. Set `PLAYWRIGHT_MODULE` to the absolute path of that installation's `index.mjs`, then run the same verifier. It opens the local file, checks room closure/breach and shared/nested walkthroughs, exercises a real downloaded state roundtrip and checks the 390px layout. Browser downloads go to an OS temporary directory and are removed after the check. There is no Playwright dependency in the project lockfile.

## Snapshot provenance and optional regeneration

[native-snapshots.json](native-snapshots.json) retains three KD 5.4.92 and three KD 5.5.0 snapshots. Each keeps the original version, seed, timestamp, source kind and bundle SHA-256. Personal filesystem locations were replaced with source-kind labels. Map data contains isolated generated entities, not real player saves or official assets/runtime.

| Input                                                  | Retained SHA-256                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| KD 5.4.92 packaged `out/main.js`                       | `2d3041a085cbe475a63227ff40709f6d9c1595c77a58545c69edf359a57605a4` |
| KD 5.5.0 isolated compiled `main.js`                   | `5b5c99689a6b009530fdeee75c76859feaf56629add6463930bf1585fa93fafe` |
| Original offline artifact before sanitizing/formatting | `b1f47797fc83da6b848488118973130b3b1c9b59e81e59e5eb51330155d36b38` |
| Original snapshots before source-path sanitizing       | `b67960e26e5d14d4129040be2e2829a29ea88c05c5e57f05d6ae8a6fa8c4bb28` |

The captured map inputs are level `3`, checkpoint parameters `grv`, empty room type and map modifier, world location `{x: 0, y: 3}`, and seeds `spinner-topology-20260921-0` through `-2` for each version. The extractor starts a disposable vanilla browser context without Mods. It conservatively protects every tile metadata entry and every non-floor feature. This small sample does not measure encounter frequencies.

To generate a separate sample, supply these environment variables and run `node docs/prototypes/spinner-topology/extract-native.mjs`:

- `KD54_ROOT`: read-only KD 5.4.92 app root containing `index.html`, assets and `out/main.js`.
- `KD55_ROOT`: read-only KD 5.5.0 app/source root containing `index.html` and assets.
- `KD55_BUNDLE`: an already compiled KD 5.5.0 `main.js` in a separate build area. This script does not compile the game.
- `PLAYWRIGHT_MODULE`: external Playwright Core `index.mjs` with Chromium available.
- `SNAPSHOT_OUTPUT`: a new disposable output directory outside both games and this baseline.

Missing inputs fail explicitly. The extractor refuses output inside the official game roots, including existing junction/symlink ancestors. It only serves game files read-only over localhost. It records the actual input hash; a different bundle may produce a different result and is not an exact reproduction. Matching old fingerprints may require the original locally built bundle, which is not redistributed here.

The original 5.5 extraction reported a missing `Logo.png` and an untyped browser `Event`; [the retained error record](evidence/native-5.5.0-errors.json) remains separate from the standalone UI results. All three maps were returned. The source includes a logo fallback for future runs; that does not retroactively erase the historical observations.

## Evidence and next investigations

- [Shared durability decision #27](DURABILITY.md) resolves the earlier partial-collinear limit as one physical segment graph. [Durability evidence](evidence/durability/summary.json) covers twelve topology-and-damage combinations, a shared-boundary breach and final-owner collapse.
- [Placement investigation #22](PLACEMENT.md) records corrected native masks, free-core and terrain counterexamples, nested entrances, the historical partial-overlap counterexample and an explicit fixed-lure stall. Run `node docs/prototypes/spinner-topology/probe-placement.mjs` to replay its bounded fixtures.
- [Pacing investigation #23](PACING.md) preserves the original measurements in the historical summary and links the immutable full traces. [Current results](CURRENT-PACING.md) cover 37 replayable cases and twelve contract checks, including worker scaling. Run `node docs/prototypes/spinner-topology/measure-pacing.mjs` to regenerate them.
- [Original verification](evidence/original-verification.json) retains all 16 previous passing walkthroughs and five extra experiments.
- [Portable verification](evidence/verification.json) identifies the current artifact and repeat checks after packaging changes.
- [Findings](FINDINGS.md), [desktop](evidence/desktop.png) and [mobile](evidence/mobile.png) explain observations and remaining limits. Trace files record every construction turn; no large exported browser save is committed.
- [engine.js](engine.js) exposes the DOM-free `globalThis.SpinnerTopology` boundary. `physicalGraph` and `durabilityFixture` supply the settled #27 experiment; `create`, `analyze`, `plan`, `step`, `attack`, `inspect` and JSON state restoration remain reusable by the placement and pacing investigations. `fixedMaps` and `nativeMap` provide fixture inputs; `page.html` and `ui.js` provide the disposable display.

Public packaging changes format sources, replace private path labels, add explicit extraction inputs and optional browser dependency resolution. The #22 model corrections and remaining limits are recorded in the placement report; #23 assesses action costs. The accepted runtime handoff starts with the shared-topology contract recorded in #27.
