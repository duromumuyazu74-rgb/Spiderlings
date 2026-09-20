# Spiderlings 0.92.26

Spiderlings now use silk to temporarily subdue hostile NPCs, with lighter direct damage against the player.

- Ordinary player contacts deal 0.05 base tickle damage even when binding succeeds. Dash impacts deal 0.10 base tickle damage, with no failed-binding bonus.
- NPC melee adds 1.5 base binding; Dash and direct spray add 3; spray trails add 0.5. Direct HP damage is zero. Native resistance, shields and struggling remain active, without generating NPC restraint equipment.
- Melee and Dash consume the Spiderling only when binding actually increases. Trails can successfully bind each NPC once per source per turn; different casters can contribute.
- NPC Dash locks the original target and tile. Moving evades it; death, lost hostility or loading clears its warning. Cast messages distinguish player and NPC targets.
- Pure binding counts as a successful NPC melee effect. Owned spray collision now follows entity hostility toward maids while retaining native collision checks.

Subdual remains temporary. Maids can struggle free, and elite binding thresholds remain unchanged.

Validation: 227 automated tests passed, plus native melee, spray casting, delayed Dash, 25-turn combat and save/load checks in KD 5.4.92 and 5.5.

Package: [Spiderlings_0.92.26.zip](../Spiderlings_0.92.26.zip). [Verification record](../.scratch/spiderlings-npc-combat-0926/REVIEW.md).
