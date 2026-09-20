# Issue tracker

Spiderlings 的新需求、spec、实施 ticket 和 triage 使用 [GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues)。目标仓库为 `duromumuyazu74-rgb/Spiderlings`。即使从旧 KD 工作区运行，也显式传入 `--repo duromumuyazu74-rgb/Spiderlings`，避免误操作其他远端。

其他独立产品继续使用本地 Markdown。按 `CONTEXT-MAP.md` 判断所属产品；不把工具任务发到 Mod 仓库。

## Spiderlings GitHub operations

- 创建 spec 或 ticket：先将完整正文写入 UTF-8 文件，再执行 `gh issue create --repo duromumuyazu74-rgb/Spiderlings --title "..." --body-file <file> --label <state>`。一项 ticket 对应一个 Issue，正文包括范围、验收和依赖。
- 读取：`gh issue view <number> --repo duromumuyazu74-rgb/Spiderlings --comments`。读取正文、标签和后续讨论后再实施。
- 列出待办：`gh issue list --repo duromumuyazu74-rgb/Spiderlings --state open --limit 100 --json number,title,labels,assignees`。更多结果继续分页。
- 更新：`gh issue edit <number> --repo duromumuyazu74-rgb/Spiderlings --body-file <file>`；讨论使用 `gh issue comment` 的 `--body-file`。状态通过 `--add-label` / `--remove-label` 更新，角色见 `triage-labels.md`。
- 完成：记录对应提交、版本和验收结果；符合 ticket 验收及用户授权后使用 `gh issue close`。发布后读回 Issue，核对正文、标签及状态。

技能中的 “publish to the issue tracker” 对 Spiderlings 表示创建或更新 GitHub Issue；“fetch the relevant ticket” 表示读取指定 Issue。PRs as a request surface: no。PR 用于提交代码；裸 `#N` 先解析是否为 PR，再按实际对象读取。

历史 `.scratch/<feature>/PRD.md`、spec 和 `issues/*.md` 保留原版本与结论。它们不是新的任务状态来源。恢复某项旧任务时，先搜索 GitHub 是否已有对应 Issue；没有则将当前未完成范围、旧记录出处和验收条件迁入一个 Issue，随后以 Issue 为准。已完成历史任务不批量重开。Scratch 继续存放草稿、日志和本地验证材料。

## Branches and delivery

`main` 保存正式版，`test` 保存测试开发版。修改测试版时沿用其正式基线和递增的 `-test.N`；正式发布取最新正式版本的下一个版本，不能从旧测试基线回退。新测试玩法经明确晋级后才进入 `main`。

正式版本使用 `v<modbuild>` 标签及 GitHub Release，上传显式 allowlist 构建的 `Spiderlings_<modbuild>.zip`。当前只发布正式 Release；测试版保留在 `test` 分支，测试包本地构建，不创建测试 Release。GitHub 自动提供的 Source code ZIP 不是可安装 Mod 包。

## Wayfinding operations

- Map 是带 `wayfinder:map` 的 Issue；子 Issue 使用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。
- 子任务通过 GitHub sub-issues 关联 map；依赖使用原生 issue dependencies。API 参数中的 `issue_id` 是数据库 ID，不是 `#number`。调用前查询当前 GitHub 官方文档。服务不支持时，在 map 正文维护任务链接，并在子任务顶部写 `Part of #N`、`Blocked by: #N`。
- Frontier 是 map 中仍 open、无未完成 blocker、无 assignee 的子任务，按 map 顺序选择。领取时分配给执行者；完成时记录答案和验证、关闭子任务，并向 map 的 Decisions-so-far 补充链接。

## Other products: local Markdown

每个功能使用 `.scratch/<feature-slug>/`。PRD 放 `PRD.md`，实施 ticket 放 `issues/<NN>-<slug>.md`，从 `01` 按依赖编号。`Status:` 记录状态，`## Comments` 追加讨论。对这些产品，技能中的发布／读取 tracker 操作仍表示创建／读取对应 Markdown 文件。
