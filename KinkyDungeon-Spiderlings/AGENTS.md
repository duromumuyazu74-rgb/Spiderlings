# Spiderlings Mod

Scope: this package and Spiderlings-specific docs/issues. Own gameplay, restraints, models, localization and runtime assets here. The game and reference Mods remain read-only under the root rules.

Before changing restraints, models, pose/layer metadata, enemy application or packaging, consult the relevant sections of `../docs/spiderlings-official-modding-guidance.md`. Record newly established KD compatibility rules there and add a checker assertion when it protects a real contract.

Use `CONTEXT.md` for Spiderlings terminology and `MAINTENANCE.md` for maintenance. `tools/` holds this Mod's private build/check scripts, governed by `tools/AGENTS.md`; standalone authoring products live in the workspace's `tools/` directory and have independent releases.

Every formal or test Spiderlings delivery must include a versioned installable ZIP:

- Formal changes increment the latest formal version, normally its final numeric component: `0.91.35` → `0.91.36`. An already prepared formal source version without a ZIP may be packaged as that version.
- Test builds use their formal baseline plus an increasing `-test.N` suffix: tests based on `0.91.35` produce `0.91.35-test.1`, then `0.91.35-test.2`. Each test delivery gets a new ZIP; test iterations leave the formal version sequence unchanged. Promoting tested changes creates the next formal version without the test suffix.
- Keep `mod.json`'s `modbuild`, version checks, and `Spiderlings_<modbuild>.zip` consistent. Build with `tools/build-spiderlings-release.ps1`, preserve previous formal and test ZIPs, and report the package path and, for tests, the formal baseline. Source edits alone do not complete either delivery.

After the final package change and ZIP build, run from the workspace root:

```powershell
powershell -ExecutionPolicy Bypass -File .\KinkyDungeon-Spiderlings\tools\watch-spiderlings-mod.ps1 -Once
```

Fix task-caused failures. After the check passes, create a focused git commit for the authorized package changes, preserving unrelated working and staged edits. Package-only documentation still follows this gate; unrelated tool/docs changes do not.

For formal or test delivery, atlas inputs, aliases, loaders, manifests or release ZIP work, use the workspace skill `.agents/skills/build-spiderlings-atlas/SKILL.md`. Keep runtime source PNGs authoritative and retain direct fallback assets.
