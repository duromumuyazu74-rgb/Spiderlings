---
name: diagnosing-bugs
description: Diagnose bugs or performance regressions whose cause remains unclear after an initial inspection.
---

# Diagnose an unclear failure

Find the cause of the reported symptom and verify the correction. Use the relevant package context and logs; inspecting code is part of building a reproduction.

Establish a focused feedback loop: an existing failing test, minimal harness, captured trace or measured runtime scenario. Prefer a signal that distinguishes the actual symptom from unrelated failures. For intermittent failures, report attempts and reproduction rate; increase repetitions only while they produce useful evidence.

Test plausible explanations against evidence, using targeted instrumentation or a profiler where appropriate. There is no fixed hypothesis count or required tool sequence. Keep generated diagnostics in the owning scratch directory and keep credentials out of logs.

If runtime access is missing, continue useful source analysis and report which conclusions remain unverified. Ask for the specific unavailable artifact or decision only when it is needed for the next dependent action.

Implement the cause-specific fix and add a regression test when a real behavioral boundary can reproduce the failure. Run the original scenario and affected checks, remove task-created temporary instrumentation, and report the cause, result and any actual remaining uncertainty. Broader architecture work requires its own scope.
