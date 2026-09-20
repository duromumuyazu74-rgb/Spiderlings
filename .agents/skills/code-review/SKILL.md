---
name: code-review
description: Review requested files, working changes, or a branch diff for actionable defects and requirement gaps.
---

# Code review

Review only the requested change. If no comparison is supplied, use the current working and staged diff for a work-in-progress review; use the branch merge-base for a branch review. State the chosen comparison. Resolve invalid references before continuing.

Read relevant package rules and the available user request, ticket or spec. Missing formal specs do not block a correctness review; state that requirement coverage is limited by available evidence.

Trace changed behavior through its real callers and tests. Report actionable defects and requirement gaps with file/line, trigger, impact and a concrete correction. Treat style preferences as optional and omit them unless requested. Prioritize findings by practical impact.

Use separate reviewers only when authorized and independently useful; a small diff can be reviewed directly. Keep reviews read-only unless the user also requested fixes. Finish with findings and verification limits, or state that no actionable defect was found.
