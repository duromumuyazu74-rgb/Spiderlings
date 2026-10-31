# Status icons

Spiderlings uses the prepared 46×46 transparent PNGs for Web slow, Silk density and Weave resonance. These native-style candidates were prepared on October 28, 2026. The runtime copies preserve their supplied bytes and single palette; the Pink silk setting does not recolor them.

| State           | Runtime filename under `Buffs/buff/`                                          | Selection                                                                          |
| --------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Web slow        | `buffSpiderlingsWebSpraySlow1.png` through `buffSpiderlingsWebSpraySlow5.png` | One icon per active slow stack, from 1 to 5                                        |
| Silk density    | `buffSpiderlingsSilkDensity1.png` through `buffSpiderlingsSilkDensity5.png`   | `0 < D < 100`, `100 ≤ D < 300`, `300 ≤ D < 700`, `700 ≤ D < 1500`, then `D ≥ 1500` |
| Weave resonance | `buffSpiderlingsBossResonance.png`                                            | While the Matriarch maintains density                                              |

The numeric HUD counters retain the slow stack count and uncapped density value. Zero density and expired Web slow have no status icon. Resonance follows its existing eligibility and clears during regeneration, disability, escort, victory or departure.

The prepared inputs are `web-slow-stages-v1/png/46/`, `silk-density-stages-v1/png/46/`, and `v8/png/46/weave-resonance.png` in the local `spiderlings-buff-icons-20261028` handoff. Earlier alternate designs remain reference material. These icons are separate from T_Swizzle's delivered restraint artwork.

The manifest registers all eleven direct PNGs before scripts. They use native `buffSprite` and `buffSpriteSpecific` fields and remain outside the character-model atlases. Native HUD acceptance checks tier boundaries, actual texture decoding, slow expiry, saved density and the shared palette. Boss combat acceptance checks the resonance icon and its existing lifecycle.
