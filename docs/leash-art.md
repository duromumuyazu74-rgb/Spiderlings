# Silk Leash artwork

The prison test package uses T_Swizzle's authored white and pink Leash artwork. `SpiderlingsSilkLeash` now wears `SpiderlingsSilkLeashModel`. The existing Pink silk setting selects both the cord and its collar artwork, including equipped and restored model copies.

## Source and runtime mapping

The artist supplied `T's NEW Webbing (1).clip`. Its SHA-256 is `a57357d8eea9968523b5fe41a7abee09905553c79708284f21494f60101cc7c3`. Both colors were exported on October 25, 2026 through CSP's native folder-color rendering and CSP Paperback. Runtime PNGs are byte-identical copies of those exports on their original 2480×3508 transparent canvas. No scaling, rotation, recoloring or recentering is applied during adoption.

| Exported Leash component | Runtime PNG             |
| ------------------------ | ----------------------- |
| `Leash.png`              | `Leash.png`             |
| `Free.png`               | `LeashFree.png`         |
| `Crossed.png`            | `LeashCrossed.png`      |
| `InFront.png`            | `LeashFront.png`        |
| `Pulled.png`             | `LeashPulled.png`       |
| `Kneel.png`              | `LeashKneel.png`        |
| `KneelPulled.png`        | `LeashKneelPulled.png`  |
| `Hogtie.png`             | `LeashHogtie.png`       |
| `HogtiePulled.png`       | `LeashHogtiePulled.png` |
| `Collar.png`             | `LeashCollar.png`       |

The two runtime folders are `Models/SpiderlingsSilkLeash/` and `Models/SpiderlingsSilkLeashPink/`. Each color has a separate losslessly trimmed 4096×4096 atlas with ten aliases. Both sheets load at startup; failure of either sheet retains independent direct-PNG fallback for all its poses.

## Native pose and equipment behavior

The cord retains native Leash pose precedence: Kneel and KneelClosed, Hogtie, bound/behind hands, Pulled, then Free/Crossed/Front. Pulled appends its suffix after that selection. This deliberately resolves a standing Free+Pulled pose to `LeashPulled.png`, not an undelivered `LeashFreePulled.png`. The supplied collar replaces the native fallback collar; there is no borrowed metal-hardware layer. Existing higher-priority collars remain visible.

Prison escort still uses native `KDTryToLeash` to pay its warning/equip steps. When that action newly adds a `BasicCollar` or `BasicLeash`, PrisonEscort asks ModelRuntime to mark that item with `data.SpiderlingsSilkLeashArtwork`. The native `KDAddModel` dressing boundary substitutes the corresponding owned silk model for that marked instance. Names, IDs, locks, escape progress, native restraint definitions and tether rules remain unchanged. Pre-existing collars/leashes and other factions' equipment are not marked. The saved marker restores the same appearance after loading.

The pose/atlas regressions cover both colors and direct fallback. The native `leash-art` scene checks all nine cord variants through the real pose resolver and character renderer, plus marked-carrier save/load. The prison transport scene checks that real native escort equipment receives the marker. Package-specific game versions, hashes and final results belong in `COMPATIBILITY.md` and the delivery report.
