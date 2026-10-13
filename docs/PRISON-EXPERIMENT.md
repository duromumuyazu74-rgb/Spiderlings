# Spiderlings Prison experiment

The independent Prison candidate follows [#68](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/68)
and its children #69–76. It starts from the current shared modules on test commit
`73d630d` and retains the behavior of formal release `v0.92.39fix1`.
The old #77 alpha provides Prison-specific implementations, not replacement shared modules.

## Admission and transport

An equipped Cocoon must have anchored outer webs. Its saved dispatch deadline is 30–50 world turns.
Losing eligibility cancels the task. Dispatch selects a reachable hostile living nest within 12 Euclidean
tiles. Otherwise an eligible Tunneler travels to a legal site and uses the native
`SummonNestEntrance` selfcast, cooldown, delayed summon and Tunneler consumption. At capacity the task
reuses a living Tunneler or waits. Real Spiderlings use native leash warnings, tethering and paid movement.
The player and carrier must reach the selected nest before forced admission.

The native Nest context menu opens the Nest dialogue for voluntary entry. Visitors spawn at the outer entrance in the
`Visit` stage. They retain their prior prisoner state and receive ordinary hostility. Entering or walking
into the chamber does not begin the captivity timer.

Captured admission and recapture select the original chamber, establish native
`PrisonerState = "jail"`, and select the Spiderlings `Intro` then `Jail` stages.
Admission does not call the ordinary defeat or Doll entry procedures. Equipped items, linked data,
escape progress and backpack contents remain under native inventory ownership.

Both modes use one native persistent lair per source room and world slot. The outer stairs return to
that room without advancing the journey. The exit hook clears this capture's identity and stops new
chamber dispatch. Earlier destroyed nests and paid construction remain on the saved map.
Distinct source rooms within one world slot have separate lair IDs; existing saved IDs are retained.
Patrols spend only positive world-time movement credit. A failed delayed Tunneler summon can retry
after the normal grace period even when the native tick counter wraps through zero.
The Cocoon vigil leaves a dispatched Tunneler's native building spell available at its work site.

## Construction and intelligence

The original ten main entrances share the existing proximity reinforcement formula. The living
Spiderling cap is at least 40 for positive settings, accepts higher values, and keeps 0 unlimited.
Per-nest living offspring bounds remain. Prison reinforcement has no lifetime Tunneler budget;
extra constructed entrances have a separate simultaneous cap of six.

Patrols and ordinary construction run before detection and during voluntary visits. Reports come
from native visual contact, expire across source-floor time, and alert only the local region.
Distant crews select interception sites in their own region from the last report. They do not
acquire a pursuit engagement from another region's report or use the unseen player's live coordinates.

A captured chamber stay counts 50 world turns, survives loading and ends on departure. Its real
builder teams use the shared topology's ownership, gates, collision, damage, repair and paid action APIs.
Outward layers use the current one-cell shared spacing and stop when terrain rejects further work.
The Prison module owns these dispatched teams and its chamber composite; ordinary Projects does not
adopt and command that same composite.

## Acceptance

Current package: `Spiderlings_0.92.39-prison.alpha.15.zip`, runtime source
`29fa5f98ac8dcc00dabd62e933fbcfd315fbacc0`. Its [compatibility record](COMPATIBILITY.md#prison-alpha15-2026-10-13)
binds the exact ZIP hash, both game inputs and the check results. The complete 1,158-test watcher and
all 68 native scenarios plus seven locales passed on KD 5.4.92 and freshly fetched official KD 5.5.4.
Both targets completed four paid physical layers and exceeded 60 living actors at cap=0.

#69–75 are closed for experimental implementation and runtime acceptance. [#68](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/68)
and [#76](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/76) remain open and `ready-for-human`.
[PR #77](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/77) remains open against `test`; the ordinary test
package and formal release do not contain this experiment.

Both targets completed a prepared early escape route back to the source floor. Mature four-layer
scenes retained 50 failed paid Cut attempts and prepared Mage attempts that failed to remove Cocoon.
The remaining decisions are whether the recorded escape/population pressure meets the intended balance
and whether to integrate the experiment into ordinary `test`.

The native scenario registry includes `prison`, `prison-regions`, `prison-rivals` and `prison-escape`.
Final delivery requires all registered scenarios and languages with the same ZIP on KD 5.4.92 and
a freshly fetched official GitHub 5.5 commit, followed by the full delivery collector.
The independent `prison-review` scene checks zero-time crouching, separate same-slot source rooms with saved
destruction and native returns, and interrupted Tunneler summons across tick wrap and reload.

Keep mature failed breach attempts and prepared-Mage outcomes in the evidence. The historical
three-layer failure and controlled Mage success remain scoped to their old package and game.
Current failed attempts do not become successful acceptance merely because another route works.
The intended escape/balance acceptance and #68's experiment integration condition remain explicit
decisions before closing #76/#68 or integrating into test.
