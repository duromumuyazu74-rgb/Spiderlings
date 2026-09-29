# Issue tracker

New Spiderlings requests, specs, implementation tickets and triage live in [GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues). Always pass `--repo duromumuyazu74-rgb/Spiderlings`, including when working from the original KD workspace.

Read `CONTRIBUTING.md` for the single-maintainer PR/check requirements; an accepted Issue does not bypass branch checks.

Independent authoring tools retain their own tracker configuration. Use `CONTEXT-MAP.md` to identify ownership before opening a Mod issue.

## GitHub operations

- Create a spec or ticket: write the complete body to a UTF-8 file, then run `gh issue create --repo duromumuyazu74-rgb/Spiderlings --title "..." --body-file <file> --label <state>`. Each ticket gets one Issue with scope, acceptance criteria and dependencies.
- Read: `gh issue view <number> --repo duromumuyazu74-rgb/Spiderlings --comments`. Read the body, labels and subsequent discussion before implementation.
- List open work: `gh issue list --repo duromumuyazu74-rgb/Spiderlings --state open --limit 100 --json number,title,labels,assignees`. Paginate when more results exist.
- Update: `gh issue edit <number> --repo duromumuyazu74-rgb/Spiderlings --body-file <file>`. Discussion uses `gh issue comment` with `--body-file`. Change state with `--add-label` / `--remove-label`; see `triage-labels.md`.
- Complete: record the commit, version and verification results. Close the Issue when its acceptance criteria and the user's authorization support completion. Read back every write to verify its body, labels or state before the next action.

When a skill says "publish to the issue tracker", create or update a GitHub Issue. "Fetch the relevant ticket" means reading that Issue. PRs as a request surface: no. PRs submit code. A bare `#N` may identify an Issue or PR; resolve its type before reading it.

Historical `.scratch/<feature>/PRD.md`, specs and `issues/*.md` retain their original versions and conclusions in the KD workspace. When resuming old unfinished work, first search GitHub for an existing Issue. If none exists, migrate the current unfinished scope, historical source reference and acceptance criteria into one Issue, then track its state there. Completed historical tickets remain closed history. Scratch stores drafts, logs and local verification evidence.

## Scope and completion

Use a finite feature Issue as a parent and native sub-issues for independently implementable or verifiable work. Read the existing parent before adding a relationship; `Part of #N` in the body alone is not a native relationship. Preserve the distinction between the original Mage scope, later Mage features, normal-game Hunting Grounds and the separate prison experiment.

Use milestones to group Issues and PRs for a specific version or bounded delivery target. A long-lived branch such as `test` is not a completion milestone. Reuse existing milestones and record their finish criteria; do not invent release dates or a formal promotion merely to group work.

Each Issue's current summary states:

- Target branch or experiment and the integration state.
- The actual completion boundary: accepted on `test`, an explicitly required formal release, or a named remaining acceptance task.
- Evidence already available and the exact remaining work, including who can perform it.

When later user decisions replace an old specification, record the replacement and its implementation. Keep the original text as history, clearly subordinate to the current summary. Move acceptance to another Issue only with an explicit scope transfer; renaming a ticket does not satisfy its original acceptance.

After integration, check every related Issue against its finish criteria. Record the integrating PR/commit, applicable version and validation before closing as completed; remove pending triage labels while preserving category and relationships. `Refs` does not close Issues, and closing keywords in a PR targeting non-default `test` do not provide automatic closure. Parent/sub-issue and milestone relationships do not change this behavior. Keep a parent open while its own acceptance remains incomplete.

Close an old PR as superseded only after all its intended changes are present or explicitly replaced in the target branch. Compare patch equivalence as well as ancestry because rebase changes SHAs. Link the actual integration PR and retain outstanding acceptance in its Issue. An open replacement PR, newer version number or matching feature name is not evidence that a missing fix has reached `test`.

## Branches and delivery

`main` holds formal releases; `test` holds test development. Test deliveries retain their formal baseline and increment `-test.N`. A formal promotion uses the next version after the latest formal release, rather than reverting to the older test baseline. Promote test gameplay only when explicitly requested and accepted.

Release scope and authorization follow [CONTRIBUTING.md](../../CONTRIBUTING.md#formal-promotion-and-releases). Attach `Spiderlings_<modbuild>.zip` built from the explicit allowlist. Test source stays on `test`; successful CI runs retain test ZIPs as temporary workflow artifacts, and maintainers may also build them locally or explicitly request a test Pre-release. GitHub's automatic Source code ZIP is not an installable Mod.

## Wayfinding operations

- A map is an Issue labelled `wayfinder:map`. Children use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`.
- Link children through GitHub sub-issues and blockers through native issue dependencies. An API `issue_id` is a database ID, not an Issue number. Consult current official documentation before calling the API. If those features are unavailable, maintain child links in the map body and put `Part of #N` and `Blocked by: #N` at the top of each child.
- The frontier consists of open children without open blockers or an assignee, in map order. Claim by assigning the executor. Resolve by recording the answer and verification, closing the child, and adding a context link to the map's Decisions-so-far.

## Other products in the original workspace

Other products retain local Markdown under `.scratch/<feature-slug>/`. Their PRD is `PRD.md`; implementation tickets are `issues/<NN>-<slug>.md`, numbered from `01` in dependency order. `Status:` records state and `## Comments` holds discussion. Their tracker operations still create or read the corresponding local file.
