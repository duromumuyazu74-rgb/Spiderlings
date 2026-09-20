---
name: ask-matt
description: Choose an engineering skill or workflow for the task.
disable-model-invocation: true
---

# Choose a workflow

Route by the user's requested outcome. A concrete implementation request can proceed directly; an interview, prototype, ticket breakdown or extra review is not a universal prerequisite.

- Unclear product decisions the user wants to discuss: `/grill-me` or `/grill-with-docs`.
- A design question that needs a runnable example: `/prototype`.
- Primary-source investigation: `/research`.
- A spec from established decisions: `/to-spec`; local implementation tickets: `/to-tickets`.
- Implementation: `/implement`; explicitly test-first work: `/tdd`.
- An unclear failure: `/diagnosing-bugs`; review: `/code-review`.
- A large planning effort: `/wayfinder`; incoming issue evaluation: `/triage`.
- Domain vocabulary: `/domain-modeling`; interface design: `/codebase-design`.
- Agent documents: `/writing-for-agents`; a new session handoff: `/handoff`.
- Human-only setup steps: `/wizard`; learning: `/teach`; rephrasing: `/wait-what`.

Read only the selected workflow. Continue within the current session when its context is useful; use the harness's compaction and delegation behavior rather than a fixed token threshold or compulsory fresh session.
