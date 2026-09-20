---
name: build-spiderlings-atlas
description: Build or validate the Spiderlings Webbing atlas and installable release after asset, loader or packaging changes.
---

# Spiderlings atlas and release

Run from the workspace root. Read `Spiderlings_0.91/AGENTS.md` and the relevant packaging/atlas sections of `docs/spiderlings-official-modding-guidance.md`. Use existing scripts as the implementation authority.

## Contract

Source PNGs are authoritative direct fallbacks. Keep the explicit input and alias allowlists, lossless trimming, the original `spiderlings-webbing-0` and pink `spiderlings-webbing-pink-0` atlas pairs (one 4096×4096 page per color), eager loading of both colors into independent aliases, and all-or-nothing direct-PNG fallback per color. The ZIP contains the manifest's explicit files and seven locale CSVs, not a recursive directory snapshot. Atlas building does not resample, recolor or rewrite source artwork.

When changing membership, aliases or versions, synchronize the affected builder, runtime loader, manifest, checker and behavioral tests. Update current maintenance/release facts, preserving historical issue outcomes. Use test-first work when it materially verifies the contract; no separate seam-approval round is required.

Inspect overlapping dirty changes and preserve them. Resolve compatible overlaps directly; ask only when their intents conflict. A failed check prevents declaring a release ready, but permits fixing task-caused failures and rerunning the affected gate.

## Build

For a requested rebuild/check without a ZIP:

```powershell
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\build-spiderlings-release.ps1 -NoPackage -RunCheck
```

For a requested installable release:

```powershell
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\build-spiderlings-release.ps1 -RunCheck
```

Confirm the intended version from the request and manifest. Replace an existing same-version ZIP only when that replacement is authorized; do not use `-Force` to conceal a conflict.

After packaging, run the parent Mod's watcher so it checks the final ZIP. Completion requires passing checks, the expected manifest/atlas/fallback entries, and the parent package's focused commit for changed Mod files. Report the version, package path if built and gate result. When artwork changed, distinguish automated packaging checks from the actual in-game visual inspection requested for that art.
