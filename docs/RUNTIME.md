# Runtime ownership

The manifest owns script loading order. Runtime scripts remain plain JavaScript in KD's native global environment, sharing the `Spiderlings` namespace. This structure applies to the `0.92.36-test.12` development package.

| Module                                                      | Responsibility and interface                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SpiderlingsCore.js`                                        | Shared named registration, restraint catalog, text registration, summon-message compatibility, and owned hook composition.                                                                                 |
| `SpiderlingsEncounters.js`                                  | Configuration, population caps, squad placement, nest reinforcement and encounter events. Existing `EncounterRules`, `ReinforcementRules` and encounter entry points remain available.                     |
| `SpiderlingsWebCaster.js`                                   | Qualification for crossfire and WebCaster movement preferences inside native movement budgets.                                                                                                             |
| `SpiderlingsModelRuntime.js`, `SpiderlingsWebbingModels.js` | Texture readiness and model registration.                                                                                                                                                                  |
| `SpiderlingsWebbingData.js`                                 | Immutable Webbing definitions, family metadata, messages and constants shared by rules and native integration.                                                                                             |
| `SpiderlingsWebbingRules.js`                                | `resolveWebbingAction({catalog, snapshot, action})` computes outcomes without native game globals. Its catalog and classification helpers serve the KD adapter.                                            |
| `SpiderlingsWebbing.js`                                     | Reads native equipment and eligibility, applies rule outcomes, registers restraints/events, and handles native escape and UI integration. The existing `Spiderlings.Webbing` caller interface is retained. |
| `SpiderlingsCombat.js`, `SpiderlingsJumperDash.js`          | Owned hit resolution and Jumper action lifecycle.                                                                                                                                                          |
| `SpiderlingsInfestation.js`                                 | Infestation map objectives, placement and exit conditions.                                                                                                                                                 |
| `SpiderlingsSpinnerTopology.js`                             | JSON-only interception-line construction, shared durability, snare use and final-owner collapse rules.                                                                                                     |
| `SpiderlingsSpinnerNativeField.js`                          | Projects topology cells into attackable KD entities, validates paid operations, routes final native damage, reconciles saves and refreshes navigation caches.                                              |
| `SpiderlingsSpinnerScenarios.js`                            | Supplies two known builders and a doorway-line plan to the native field runtime. It does not implement an alternate simulation.                                                                            |
| `SpiderlingsSpinnerCapture.js`                              | Capture admission, contest/wrap actions, native input and capture state. Rendering consumes a read-only capture view. The old training-room handler remains a compatibility delegate.                      |
| `SpiderlingsSpinnerField.js`, `SpiderlingsSpinnerArt.js`    | Legacy training-room geometry/construction compatibility and character artwork.                                                                                                                            |
| `SpiderlingsSpinnerRuntime.js`                              | Owns the single Spinner enemy-loop wrapper and the native field's damage, movement, load and positive-turn event dispatch.                                                                                 |

Core precedes encounters and WebCaster movement. Webbing data precedes Webbing rules, which precede the native Webbing adapter. Tests explicitly load these dependencies; the independent manifest allowlist test protects delivery order. Rule-only tests load data and rules without registering enemies, items, native hooks or game events.

## Shared native hooks

`Spiderlings.Hooks.wrap(owner, native, create)` preserves the supplied native function and returns a stable wrapper. Reinstalling an owner already present in that Spiderlings chain replaces its callback at the existing position. This keeps new callbacks aligned with newly registered events without accumulating wrappers. `describe(handler)` reports owners in installation order.

| Native function              | Installation order, inner to outer | Delegation                                                                                                                        |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `KDAIType.hunt.beforemove`   | `WebCaster.hunt`, `Cocoon.hunt`    | Cocoon dispersal handles its eligible enemies; other calls reach WebCaster's native movement adjustment and the original handler. |
| `KDAIType.wander.beforemove` | `Cocoon.wander`                    | Unrelated calls reach the original handler.                                                                                       |
| `KinkyDungeonEnemyLoop`      | `Spinner.runtime`                  | Native field construction, legacy training and capture are ordered delegates; every unhandled call reaches the original loop.     |

Each callback forwards the original receiver, arguments and result on its unhandled route. The registry tracks Spiderlings-owned wrappers only. It does not inspect or replace another Mod's private wrapper chain, and it is not a general-purpose Mod hot-reload system. Other compatibility hooks retain their existing owners and guards.

## State ownership and rendering

| State                                                                 | Owner and persistence                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Capture phase, participant IDs, contest work and wrap progress        | `KDGameData.SpiderlingsSpinnerCapture`; restored through `afterLoadGame`.                      |
| Capture retry timers                                                  | `KDGameData.SpiderlingsSpinnerRetries`.                                                        |
| Field phase, traps, connections and builder IDs                       | `KDMapData.SpiderlingsSpinnerField`.                                                           |
| Native line topology, owners, HP, built cells, snare IDs and age      | `KDMapData.SpiderlingsSpinnerEncounter`; plain JSON saved with the active map.                 |
| Native web-cell entities                                              | Reconciled projection of the encounter topology; exactly one owned proxy per solid cell.       |
| Deposited silk and leg-bag escape work                                | The equipped item's `data`, including `wrapProgress` and `SpiderlingsLegbinderEscapeProgress`. |
| Graphics, texture promises, animation interpolation and timer handles | Runtime-only values; not serialized.                                                           |

Capture admission is inspected without changing saved state. Native tick, movement, enemy and load events commit participant changes or interruption. Drawing can hide invalid previews, but cannot cancel capture, create retry timers, migrate fields or advance work. The load handler converts legacy `remaining`/`successes` fields to work counters without granting progress. Saved equipment and state keys remain compatible with the previous test package.

The public runtime-boundary tests cover rule-only execution, shared hook composition and rendering without state writes. The complete watcher adds native-source compatibility tests. Final ZIP loading still requires the applicable in-game checks in the [verification matrix](../CONTRIBUTING.md#verification).

## Native Spinner line slice

Issue #28 keeps activation inside the supplied doorway scenario. It does not form groups on ordinary floors and does not create a capture region. Each builder spends its pinned native movement-rate budget on exactly one anchor or extension operation; a handled construction pass never also moves that builder. Every operation rechecks terrain, protected metadata and occupancy before changing topology.

The KD 5.5.0 projection uses a non-immobile `SpiderlingsSpinnerWebCell` enemy with `SpiderlingsWebTraversal` as its native path condition. Ordinary enemies fail the condition and remain blocked. A Spiderling accepted by the condition lands on the legal empty cell immediately beyond the web; the proxy is neither swapped nor co-occupied and stays attackable at its original coordinate. Projectiles and sight continue to use the underlying floor tile.

`afterDamageEnemy.dmgDealt` is the only durability input. Reconciliation then overwrites surviving proxy HP from topology and removes breached cells. Every solid-cell change sets `KDUpdateEnemyCache` and replaces both `KDPathCache` and `KDPathCacheIgnoreLocks`; `KDUpdateDoorNavMap()` alone is insufficient for the second cache in this patch. `afterLoadGame` reuses one valid proxy per cell, drops duplicates and creates missing projections without changing saved HP or ownership. Positive `tickAfter` events on the active map alone advance the final-owner collapse age.
