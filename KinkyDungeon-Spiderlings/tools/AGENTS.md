# Spiderlings maintenance tools

These scripts serve only the parent Mod. Read inputs from the pinned game when necessary; write only Spiderlings-owned generated assets, its release ZIP and its scoped scratch/log output. Preserve the explicit packaging allowlist so maintenance scripts, rules and docs stay outside the installable ZIP.

Use the existing builder, release script, checker and watcher as the implementation authority. Changes to their behavior require the affected tests plus the parent package's watcher and focused commit. Do not import code from the independent authoring tools or make their test suites a prerequisite for a Mod release.
