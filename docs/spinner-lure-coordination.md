# Spinner lure coordination evidence

This record covers the scenario-only alert behavior from Issue #31. It builds on the native field, autonomous planning and enclosure work delivered by Issues #28 through #30. Capture, equipment, recovery, ordinary-floor activation, version changes and a release ZIP remain outside this slice.

## Behavior under test

- The native `hunt.beforemove` target and computed `AIData` establish either a player or hostile-NPC engagement. Awareness without native sensing cannot publish a target coordinate.
- One lure stays assigned across turns and JSON save/load. Death, incapacity, missing identity or changed hostility causes deterministic replacement. The lure is excluded from builder reservations.
- Shared position and direction have age zero on the observation turn, remain usable through age three and are removed at age four. Eight turns without actual sight delegate the lure to native pursuit. Reacquisition restores lure mode.
- Lure movement, builder movement, field work, yielding and waiting each consume the actor's AI pass and gate later native attacks and spells. Adjacent defense keeps the retained job and pays the native attack cadence.
- Cooperative enclosure scenarios reuse `SpinnerTopology.nextWorkAction` and `SpinnerNativeField.applyPaidAction`. Occupied work cells wait without teleporting, overwriting an entity or rerolling the plan.
- Load audit validates members, plans, target/lure identities and assignments before an action. Repeated audit and `delta: 0` do not advance state or duplicate jobs.

## Automated verification

Run from the repository root:

```powershell
node --test Spiderlings_0.91/tools/tests/spiderlings-spinner-ai.test.js Spiderlings_0.91/tools/tests/spiderlings-runtime-boundaries.test.js
```

The focused fixtures cover player and NPC acquisition, stable identity, role replacement, age-four expiry, turn-eight pursuit, native adjacent defense, action-phase gates, blocked occupancy, JSON restoration and adoption of an existing enclosure. The runtime-boundary fixture also checks the named hook order plus receiver, argument and return-value forwarding.

## Native source boundary

The implementation is pinned to the read-only KD 5.5.0 source used by Issues #28 through #30. `KinkyDungeonEnemies.ts` SHA-256 is `9281E8A60FBC48FA5177FCB87F2ABBE0178C56E2B581796C4BB5DD26DA9E5242`. The relevant native sequence selects a player or NPC target, computes sensing, calls `KDAIType.beforemove`, then evaluates `KDAIType.attack` and `KDAIType.spell`. Positive `tickAfter` is the sole owner of group information age.

No graphical in-game session was available for this branch. The automated fixtures and native source checks do not prove rendered visibility, natural target approach, real attack cadence or save behavior in a running KD client. Manual acceptance must use `spiderlingsSpinnerCooperative` and record player and NPC traces for approach, visible retreat, pre-seal withdrawal, loss and reacquisition, role-holder loss, adjacent defense, a moving blocked gate and save/reload.
