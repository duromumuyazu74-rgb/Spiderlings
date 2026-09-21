# Topology experiment findings

Date: 2026-09-21. Historical observations from the archived experiment. The portable baseline retains these results; later geometry and pacing investigations may qualify them. Runtime integration is not approved by this artifact alone.

## Observed

- Ten fixed cases passed bounded construction and geometry walkthroughs: single-cell door, double-width corridor, T, cross, regular room, irregular room, protected exit vicinity, insufficient space, shared overlap and nested enclosure.
- Six genuine vanilla maps generated in isolated browsers passed the same occupied/protected-cell checks. Three use KD 5.4.92; three use KD 5.5.0. Five selected an interception line and one a rectangle. This six-map sample is descriptive, not a frequency estimate.
- Every intermediate construction state in the recorder is checked for web cells placed on walls, protected cells or static native occupants. Builders consume movement OR placement per action.
- The separately selected concave orthogonal candidate closes without a diagonal escape. Rectangles are not the only supported closed shape.
- The nested fixture closes inner before outer. Breaking the inner layer does not open a route through the intact outer layer. Breaking both opens a route outside the composite boundary.
- Two overlapping fixture groups reuse four link records. Breaking a shared anchor removes incident links for both fields. Shared ownership does not create duplicate HP pools for the same endpoint pair.
- For an isolated seven-cell link, a centered 3x3 AoE at unit damage hits three non-anchor cells and sums `0.70 + 0.55 + 0.70 = 1.95` against shared HP.
- Changing a planned cell to a wall retires the invalid plan and selects a legal degraded/replacement plan before subsequent construction.
- An ownerless field remains after 19 turns and collapses on turn 20. Export/reload gives identical next-step state in every map walkthrough.
- The offline browser controls, guided shared-field walkthrough and downloaded state restoration passed. Desktop and 390px mobile screenshots were captured; no horizontal mobile overflow or prototype JavaScript errors were observed.

See `evidence/original-verification.json` for the original result, `evidence/verification.json` for the portable artifact rerun and corresponding per-turn trace files. These checks cover the original walkthrough matrix; they do not establish native runtime compatibility or balance, or certify every rule in the full specification.

## What this answers

The proposed geometry can be represented with separate anchors, shared link HP, owners and composite-field layers. A single physical web graph can serve more than one field without duplicating obstacles. Local topology can distinguish a complete enclosure from a useful interception line and from no legal construction.

The high-level degradation path is necessary: the conservative current templates cannot form enclosures on five of the six actual snapshots. Runtime work should retain useful line placement, rather than assuming every encounter can become a leg-bag arena.

Breaking a boundary and reaching the level exit are different properties. A ring built across a room's only exit may require a specific exit-facing breach, even after the target can leave the ring on another side. The UI now displays both paths separately.

## Shared durability resolution

Issue #27 resolves the original experiment's partial-collinear mismatch. The current engine merges field paths into unit edges, combines owner sets and coalesces only consecutive collinear edges with the same owners. A partial overlap is therefore one shared physical span between exclusive spans, not two HP records forwarding damage to each other.

Only original field endpoints are anchors. Crossings and ownership splits are graph junctions without anchor HP, full damage propagation or snaring effects. Ordinary damage measures graph distance to the nearest real anchor. The accepted segment maximum remains `2 + 0.5 * (occupied cells - 1)` after coalescing.

The [decision record](DURABILITY.md) separates this gameplay contract from storage choices and remaining native checks. The [focused summary](evidence/durability/summary.json) covers identical, partial-collinear, crossing and nested structures under direct-anchor, single-cell and per-covered-cell area damage. It also records a shared-boundary escape route and staggered final-owner collapse.

## Costs still to evaluate

At the current 1.5-action-budget approximation, the default regular room takes about 50 world turns to prebuild; the nested fixture takes about 113. These include relocation and one-cell construction, with the lure idle. This does not establish native timing. It does show that late-arriving groups may not finish a large arena during a short fight. Smaller templates, prebuilding before awareness and native movement cadence should be evaluated before changing approved rules.

No general room graph was assumed. The planner uses actual floor masks and explicit templates. It does not yet cover every concave outline, arbitrate unrelated capture targets, predict pursuit, or measure simulation under moving original NPCs. Accepted runtime behavior remains in `DESIGN.md` rather than being silently approximated in the browser.

The NPC discussion contained a factual overstatement: high binding does not guarantee eventual unaided recovery. The native enemy-update guard skips ordinary self-struggle for helpless NPCs without help. High reinforcement therefore requires observation of native helpless/help/recovery semantics, not a promised automatic release time.

## Review points before runtime integration

1. Does gradual one-cell construction convey a useful impending threat, especially with the large prebuild times?
2. Are interception plans on actual map snapshots acceptable when closed-room candidates are unavailable?
3. Does the separate boundary/exit path display match the intended meaning of breaking out?

These are observations for the agreed review stage. The portable source and evidence live beside this report. No gameplay scripts, version manifest or release archive changed.
