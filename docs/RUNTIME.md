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
| `SpiderlingsSpinnerCapture.js`                              | Capture admission, contest/wrap actions, native input and capture state. Rendering consumes a read-only capture view.                                                                                      |
| `SpiderlingsSpinnerField.js`, `SpiderlingsSpinnerArt.js`    | Training-room geometry and construction; character artwork.                                                                                                                                                |

Core precedes encounters and WebCaster movement. Webbing data precedes Webbing rules, which precede the native Webbing adapter. Tests explicitly load these dependencies; the independent manifest allowlist test protects delivery order. Rule-only tests load data and rules without registering enemies, items, native hooks or game events.

## Shared native hooks

`Spiderlings.Hooks.wrap(owner, native, create)` preserves the supplied native function and returns a stable wrapper. Reinstalling an owner already present in that Spiderlings chain replaces its callback at the existing position. This keeps new callbacks aligned with newly registered events without accumulating wrappers. `describe(handler)` reports owners in installation order.

| Native function              | Installation order, inner to outer | Delegation                                                                                                                        |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `KDAIType.hunt.beforemove`   | `WebCaster.hunt`, `Cocoon.hunt`    | Cocoon dispersal handles its eligible enemies; other calls reach WebCaster's native movement adjustment and the original handler. |
| `KDAIType.wander.beforemove` | `Cocoon.wander`                    | Unrelated calls reach the original handler.                                                                                       |
| `KinkyDungeonEnemyLoop`      | `Spinner.capture`, `Spinner.field` | The training field handles its builders; remaining calls reach capture handling and then the original loop.                       |

Each callback forwards the original receiver, arguments and result on its unhandled route. The registry tracks Spiderlings-owned wrappers only. It does not inspect or replace another Mod's private wrapper chain, and it is not a general-purpose Mod hot-reload system. Other compatibility hooks retain their existing owners and guards.

## State ownership and rendering

| State                                                                 | Owner and persistence                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Capture phase, participant IDs, contest work and wrap progress        | `KDGameData.SpiderlingsSpinnerCapture`; restored through `afterLoadGame`.                      |
| Capture retry timers                                                  | `KDGameData.SpiderlingsSpinnerRetries`.                                                        |
| Field phase, traps, connections and builder IDs                       | `KDMapData.SpiderlingsSpinnerField`.                                                           |
| Deposited silk and leg-bag escape work                                | The equipped item's `data`, including `wrapProgress` and `SpiderlingsLegbinderEscapeProgress`. |
| Graphics, texture promises, animation interpolation and timer handles | Runtime-only values; not serialized.                                                           |

Capture admission is inspected without changing saved state. Native tick, movement, enemy and load events commit participant changes or interruption. Drawing can hide invalid previews, but cannot cancel capture, create retry timers, migrate fields or advance work. The load handler converts legacy `remaining`/`successes` fields to work counters without granting progress. Saved equipment and state keys remain compatible with the previous test package.

The public runtime-boundary tests cover rule-only execution, shared hook composition and rendering without state writes. The complete watcher adds native-source compatibility tests. Final ZIP loading still requires the applicable in-game checks in the [verification matrix](../CONTRIBUTING.md#verification).
