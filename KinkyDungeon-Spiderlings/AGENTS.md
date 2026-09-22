# Spiderlings Mod

Scope: this package and Spiderlings-specific docs/issues. Own gameplay, restraints, models, localization and runtime assets here. The game and reference Mods remain read-only under the root rules.

Before changing restraints, models, pose/layer metadata, enemy application or packaging, consult the relevant sections of `../docs/spiderlings-official-modding-guidance.md`. Record newly established KD compatibility rules there and add a checker assertion when it protects a real contract.

Use `CONTEXT.md` for Spiderlings terminology and `MAINTENANCE.md` for maintenance. `tools/` holds this Mod's private build/check scripts, governed by `tools/AGENTS.md`; standalone authoring products live in the workspace's `tools/` directory and have independent releases.

For every change, use the [verification matrix](../CONTRIBUTING.md#verification) and [version rules](../CONTRIBUTING.md#formal-promotion-and-releases). They govern package docs, maintenance tools and runtime delivery. Commands in [development and publishing](../docs/DEVELOPMENT.md) run from the Spiderlings repository root, not the parent KD workspace or preserved snapshot.

For formal or test delivery, atlas inputs, aliases, loaders, manifests or release ZIP work, use the workspace skill `.agents/skills/build-spiderlings-atlas/SKILL.md`. Keep runtime source PNGs authoritative and retain direct fallback assets.
