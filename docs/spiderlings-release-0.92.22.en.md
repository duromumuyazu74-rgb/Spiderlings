# Spiderlings 0.92.22

Fixes Webbing progression getting stuck around compatible native restraints and reduces the Lv3 escape target.

- **Compatible native restraints can stay equipped.** Ordinary restraints such as LatexArmbinder and WolfBallGag no longer fail the selector just because they are not armour. Every Webbing group, including Cocoon, uses native addition checks without overpowering or removing blockers. External items, locks and progress remain intact.
- **Preserve exposed restraints after removal.** Removing an outer Webbing item retains the original external restraint instance and escape progress when native unlinking rebuilds the group root.
- **Two effective actions for Lv3.** All eight Lv3 items now require two effective Cut, Remove or Struggle actions, in any combination. Power remains 3. Lv1, Lv2 and Cocoon escape targets are unchanged.
- **Updated documentation and HTML guide.** The parameter guide, design baseline, compatibility notes and offline showcase reflect this release.

Enemy Cocoon still requires all ten Lv1, five Lv2 and eight Lv3 items, five spray-slow stacks before impact, and a subsequent eligible direct hit.

Package: [Spiderlings_0.92.22.zip](../Spiderlings_0.92.22.zip).
