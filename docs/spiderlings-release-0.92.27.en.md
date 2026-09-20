# Spiderlings 0.92.27

Spiderling attacks now combine light damage and binding against both players and hostile NPCs, using shared damage profiles.

| Attack | Base tickle damage | Base NPC binding |
|---|---:|---:|
| Melee | 0.05 | 1.5 |
| Dash | 0.10 | 3 |
| Direct spray | 0.05 | 3 |
| Spray trail | 0.01 | 0.5 |

Players receive eligible Webbing equipment; NPCs receive native Slime binding. Native resistance and shields can prevent either effect. Melee and Dash consume the attacking spiderling only when binding progresses.

NPC contact amplification is capped at twice its scaled input, preventing native flat weakness bonuses from overwhelming tiny damage amounts. Trail rate limits cover both damage and binding, crossfire bonuses add no extra damage, and spray damage retains the actual caster's attribution.

Validation: 228 automated tests passed, with native KD 5.4.92 and 5.5 checks for player hits, NPC melee, spray, delayed Dash, resistance, shields, a 25-turn battle and save/load preservation.

Package: [Spiderlings_0.92.27.zip](../Spiderlings_0.92.27.zip). [Review and evidence](../.scratch/spiderlings-shared-combat-0927/REVIEW.md).
