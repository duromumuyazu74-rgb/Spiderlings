# Spinner capture stage artwork

Test.58 adopts T_Swizzle's `Spinner Leg Binder Webbing` group from the maintainer's `T's NEW Webbing.clip`. The source SHA-256 is `f94c68dbd623deb20eafa85ab3d2f0cfa579b336e4ad5c72b201f42f9026b47b`. The CLIP remains unchanged outside the repository. Extraction records and the reviewed mapping are retained in the parent workspace at `.scratch/spinner-art-feedback-20260928/`.

| Source inside the group     | Runtime part | Role                        |
| --------------------------- | ------------ | --------------------------- |
| `Webbing/Web 1 -->`         | Stage1       | First ankle wrap            |
| `Webbing/--> Web 2 -->`     | Stage2       | Growing lower-leg coverage  |
| `Webbing/--> Web 3 -->`     | Stage3       | Lower-leg coverage          |
| `Webbing/--> Web 4 -->`     | Stage4       | Middle coverage             |
| `Webbing/--> Web 5 -->`     | Stage5       | Knee coverage               |
| `Webbing/--> Web 6 -->`     | Stage6       | Sloping upper-thigh edge    |
| `Webbing/--> Web 7 (Final)` | Stage7       | Completed bag, feet exposed |
| `Webbing Tail/Layer 16`     | Tail         | Moving loose end            |

Every part has a Normal PNG in `Models/SpiderlingsSpinnerLegbinder/` and a Pink PNG in `Models/SpiderlingsSpinnerLegbinderPink/`. All sixteen retain their 2480×3508 canvas, without resizing, rotating or recentering. Normal disables the parent group's color effect while retaining internal line/shadow effects; Pink reproduces the parent color effect. The renderer uses white tint for both colors. Stages share a bottom at source y=2942; Stage7's alpha bounds are `[906,1922,1471,2942)`. The tail is authored separately at `[338,2699,692,2928)` and attaches by its right edge to the interpolated upper rim.

The extractor reconstructs original raster placement, layer order, visibility and opacity, excluding sketches, the reference body and paper. The existing CLIP converter flattens some color-effect groups incorrectly, so their colors were reconstructed from the source database and raw layer pixels. In the source preview comparison, 91,461 selected opaque pixels had mean channel error 0.483/255 and maximum error 8/255. This supports the extraction's fidelity within that sample; it is not a claim of pixel-identical native CSP export. The sixteen adopted PNGs match the reviewed extracted files byte for byte.

`build-spiderlings-atlas.py` explicitly packs eight parts per color into `TextureAtlas/spiderlings-spinner-0.{png,json}` and `spiderlings-spinner-pink-0.{png,json}`, each 2048×2048. It copies cropped RGBA pixels losslessly with transparent padding and records the original canvas offsets. The existing two Webbing pages keep their original inputs and bytes. `SpiderlingsSpinnerArt.js` loads these sheets through the native Mod blob map and the logical image path; loading failure falls back to the full PNGs. Sprite scale is the character's normal `Zoom * MODEL_SCALE`, with no per-stage placement adjustment.

Game progress remains five paid deposits of 0.2. Seven complete images represent visual progression, with only adjacent stages shown during a transition. The existing deposited image stays opaque while the next fades in. The tail follows the upper edge and passes between front/back overlays, then shrinks and fades into the final stage. At zero progress there is no bag; at full progress only Stage7 remains. There is no independent Closure image. Field borders, map tethers and NPC sprites are separate assets.

The final 500 ms tween is tied to the equipped item's ID and survives completion of temporary capture state. Input control returns on the fifth paid action. Interruption hides the tail, and native load restores saved progress without replaying the animation. Public regressions cover this timing, stage selection, color routing, direct fallback, redress cleanup and lossless atlas pixels. The dual-version `spinner-art` scenario uses the final ZIP, real native capture and character rendering to check five deposits, the final 0/250/500 ms samples, all fourteen color/stage combinations and completed-item reload.
