---
name: implement
description: Implement an authorized spec or ticket through relevant verification.
disable-model-invocation: true
---

Implement the requested behavior using the owning package's rules and acceptance criteria. Resolve routine choices from existing code and the conversation; continue through task-caused failures without a phase-by-phase approval gate.

Use test-first development when requested or when a behavioral regression benefits from it. Run affected checks and the package's required gates. Review the final diff for correctness and scope; a separate review skill or extra agents are not mandatory for every change.

Commit only the task's changes when requested or required by the package rules. Preserve unrelated working and staged edits. Complete the requested scope rather than stopping after the first implementation.
