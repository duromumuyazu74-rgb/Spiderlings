# Issue tracker

New Spiderlings requests, specs, implementation tickets and triage live in [GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues). Always pass `--repo duromumuyazu74-rgb/Spiderlings`, including when working from the original KD workspace.

Player reports have no language restriction. Implementation briefs and development records use English primarily. Read `CONTRIBUTING.md` for the language policy and the single-maintainer PR/check requirements; an accepted Issue does not bypass branch checks.

Independent authoring tools retain their own tracker configuration. Use `CONTEXT-MAP.md` to identify ownership before opening a Mod issue.

## GitHub operations

- Create a spec or ticket: write the complete body to a UTF-8 file, then run `gh issue create --repo duromumuyazu74-rgb/Spiderlings --title "..." --body-file <file> --label <state>`. Each ticket gets one Issue with scope, acceptance criteria and dependencies.
- Read: `gh issue view <number> --repo duromumuyazu74-rgb/Spiderlings --comments`. Read the body, labels and subsequent discussion before implementation.
- List open work: `gh issue list --repo duromumuyazu74-rgb/Spiderlings --state open --limit 100 --json number,title,labels,assignees`. Paginate when more results exist.
- Update: `gh issue edit <number> --repo duromumuyazu74-rgb/Spiderlings --body-file <file>`. Discussion uses `gh issue comment` with `--body-file`. Change state with `--add-label` / `--remove-label`; see `triage-labels.md`.
- Complete: record the commit, version and verification results. Close the Issue when its acceptance criteria and the user's authorization support completion. Read back every write to verify its body, labels or state before the next action.

When a skill says "publish to the issue tracker", create or update a GitHub Issue. "Fetch the relevant ticket" means reading that Issue. PRs as a request surface: no. PRs submit code. A bare `#N` may identify an Issue or PR; resolve its type before reading it.

Historical `.scratch/<feature>/PRD.md`, specs and `issues/*.md` retain their original versions and conclusions in the KD workspace. When resuming old unfinished work, first search GitHub for an existing Issue. If none exists, migrate the current unfinished scope, historical source reference and acceptance criteria into one Issue, then track its state there. Completed historical tickets remain closed history. Scratch stores drafts, logs and local verification evidence.

## Branches and delivery

`main` holds formal releases; `test` holds test development. Test deliveries retain their formal baseline and increment `-test.N`. A formal promotion uses the next version after the latest formal release, rather than reverting to the older test baseline. Promote test gameplay only when explicitly requested and accepted.

Formal versions use `v<modbuild>` tags and GitHub Releases, attaching `Spiderlings_<modbuild>.zip` built from the explicit allowlist. Currently only formal Releases are published. Test source stays on `test`; successful CI runs retain test ZIPs as temporary workflow artifacts, and maintainers may also build them locally. GitHub's automatic Source code ZIP is not an installable Mod.

## Wayfinding operations

- A map is an Issue labelled `wayfinder:map`. Children use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`.
- Link children through GitHub sub-issues and blockers through native issue dependencies. An API `issue_id` is a database ID, not an Issue number. Consult current official documentation before calling the API. If those features are unavailable, maintain child links in the map body and put `Part of #N` and `Blocked by: #N` at the top of each child.
- The frontier consists of open children without open blockers or an assignee, in map order. Claim by assigning the executor. Resolve by recording the answer and verification, closing the child, and adding a context link to the map's Decisions-so-far.

## Other products in the original workspace

Other products retain local Markdown under `.scratch/<feature-slug>/`. Their PRD is `PRD.md`; implementation tickets are `issues/<NN>-<slug>.md`, numbered from `01` in dependency order. `Status:` records state and `## Comments` holds discussion. Their tracker operations still create or read the corresponding local file.
