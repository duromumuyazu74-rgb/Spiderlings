# Compatibility target scheduling

This experiment compares the existing serial target schedule with opt-in `--jobs 2`. Each run uses the same accepted test.3 ZIP, prepared KD 5.4.92 build, freshly fetched official `5.5` commit, and the `basic,native-locales` selection. Independent scenario and locale runtimes retain their existing isolation and cleanup.

The acceptance records distinguish target duration from elapsed completion time after fetch/build. Selected runs remain partial evidence; they do not establish full delivery acceptance or a full-suite speedup. Serial execution remains the default.

## Inputs and environment

- Source baseline: `729294c81e2a97952cf5ec6a0d88972893c95ba2`, with this scheduling change applied; runtime payloads unchanged.
- Local Windows runner, Node.js 24.14.1, Google Chrome 156.0.8078.48, warm exact-commit game build cache.
- Package: `Spiderlings_0.92.39-test.3.zip`, SHA-256 `67fa70a09373a27403a594b6c0149d9e6888159d73b963a78dc2fcdfe909b864`.
- Games: fixed KD 5.4.92 and official `5.5` commit `e2d37266edb6a1a8e30dde4a80fd94dc04583d5a` (KD 5.5.6). Every run fetched upstream; both prepared game hashes matched across all runs.
- Workload per target: `basic`, then fresh CN/DE/ES/JP/KR/PL/RU runtimes through `native-locales`. No competing build or test suite ran during measurement.

## Results

| Schedule                    | Elapsed after preparation | KD 5.4.92 target | KD 5.5.6 target | Outcome     |
| --------------------------- | ------------------------: | ---------------: | --------------: | ----------- |
| Serial, jobs 1              |                 117.512 s |         57.750 s |        59.750 s | Both passed |
| Parallel, jobs 2, first run |                  62.970 s |         60.173 s |        62.949 s | Both passed |
| Parallel, jobs 2, repeat    |                  62.974 s |         61.675 s |        62.952 s | Both passed |

Mean parallel completion time was 46.4% lower than serial. Each target took slightly longer under concurrency; elapsed completion time is the measured benefit, not reduced total processing work. Neither parallel run failed. Two successful repetitions establish this short workload's observed stability on this machine, not full-suite reliability or CI performance.

Run `npm run test:compatibility -- --package <same-ZIP> --scenario basic,native-locales --jobs 1`, then the same command with `--jobs 2`. Preparation remains sequential and excluded from the table. Use `check:preflight` with the starting commit before long acceptance runs, as described in [Contributing](../../CONTRIBUTING.md#verification).

The original acceptance files, results, screenshots and locale records remain under the configured compatibility cache:

- `runs/2026-10-26T11-48-58-577Z-0.92.39-test.3/acceptance.json`
- `runs/2026-10-26T11-51-00-763Z-0.92.39-test.3/acceptance.json`
- `runs/2026-10-26T11-52-06-770Z-0.92.39-test.3/acceptance.json`

All three retain `verification.mode: partial`. These results support an opt-in parallel entry, while default execution stays serial pending a representative full-suite comparison.
