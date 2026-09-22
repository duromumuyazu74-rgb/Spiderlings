# Spiderlings 仓库审查，2026-09-22

后续建议 2、4、6 与私有画师资料处理的执行记录见[同日维护记录](MAINTENANCE-FOLLOWUP-2026-09-22.zh-CN.md)。下文保留审查时的基线和验证结果。

本次审查覆盖远端维护分支、CI 与保护规则、运行时契约、安装包、依赖、文档和目录组织。发现并修复的问题集中在交付检查与维护依赖。没有修改玩法、素材、manifest 或版本号。任务跟踪为 [Issue #43](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/43)。

## 基线与方法

| 对象         | 审查基线                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------ |
| 仓库         | `duromumuyazu74-rgb/Spiderlings`                                                                 |
| 正式分支     | `main`，`9fd1e5b205cb245aa35dc53edd69d789fefd8412`，`0.92.38`                                    |
| 开发分支     | `test`，`122b325969f6a7ee62a8b1a258c61b975b79bd36`，`0.92.36-test.13`                            |
| 正式 Release | `v0.92.38`，附件 20,071,527 字节                                                                 |
| 远端观测     | 2026-09-22，GitHub REST API 与 CLI 读取分支保护、仓库设置、运行记录、artifacts、Issue 和 Release |
| 本地工具     | Node.js 24.14.1、Python 3.12.3、Windows PowerShell；两个 checkout 分别安装维护依赖               |

运行完整注册测试，并追踪共享 hook、Spinner 分发、地图 rollout、玩家与 NPC 回收、Webbing 规则及纹理加载的调用和状态归属。另扫描运行时与维护入口的 ESLint 结果、当前文档相对链接、受跟踪文件组成，并逐项比较下载的正式 ZIP。审查不等于逐帧图形验收，也不能证明任意游戏版本和 Mod 组合都兼容。

## 已修复的问题

| 级别 | 触发与影响                                                                                                                                      | 修复及证据                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | `test` 的 Windows 安全作业失败后，唯一必需的 `Repository checks` 作业被跳过。GitHub 将 skipped 视为可接受的必需检查结果，因而不能可靠阻止合并。 | 将 Windows 与交付验证作为独立前置作业，保留同名最终门禁，以 `always()` 执行并仅接受所有前置结果为 success。回归覆盖 failure、skipped、cancelled 和缺失结果。[1][2]         |
| P1   | 两条分支的本地 ZIP checker 跳过 PNG 内容，且自写解析器用 Map 覆盖重复名称。带旧图片或重复项的包可能通过本地 watcher。                           | 删除重复 ZIP 解析，复用发布脚本的 `-VerifyOnly`。回归使用真实 ZIP，检查旧 PNG、重复项、缺项和额外开发文件。                                                                |
| P2   | 独立 builder 直接将未校验的 `modbuild` 用于文件名。非版本字符串、非法测试序号和路径片段可能进入构建。                                           | 在生成图集、派生输出路径之前校验正式／测试版本与安全整数范围；非法输入不产生构建输出。                                                                                     |
| P2   | builder 拒绝覆盖已有包之前仍会重建图集；`-RunCheck` 在最终 ZIP 写入前执行，并硬编码 Windows PowerShell。                                        | 提前拒绝冲突包；完成 ZIP 校验和写入后执行 watcher，并选择当前 PowerShell 版本。检查失败继续返回非零。`-NoPackage` 保留源文件检查用途。                                     |
| P2   | 两条分支固定 Pillow 10.4.0，落在上游公开安全公告的受影响范围内，包括 PSD 越界写问题。                                                           | 升级至 12.3.0。两个 checkout 使用独立 Python 环境构建，原色／粉色 atlas 均与既有提交逐字节一致。当前构建使用受版本控制的 PNG，不能据此声称存在已被利用的运行时漏洞。[3][4] |

为验证正式分支的维护回补，将其旧测试的硬编码游戏／原画路径改为开发分支已使用的外部输入解析器。`spiderlings.referenceRoot` 与进程环境变量在两条分支上含义一致，仓库检查拒绝共享输入链接。正式版运行文件没有随之改变。旧正式验证脚本的格式整理保留为独立 `style:` 提交，便于单独审阅行为修改。

开发与发布说明已同步 `-RunCheck`、完整 PNG 校验、版本校验和外部参考配置。历史发行记录保持原状。

## 验证结果

本地只读游戏参考的 `KDVersionStr` 为 `5.5.0`。测试还包含已保存的 5.5.3 回归片段；这不代表本次运行了完整 5.5.3 游戏。

| 检查             | `test` 修复候选                         | `main` 修复候选                        |
| ---------------- | --------------------------------------- | -------------------------------------- |
| 仓库检查         | 通过                                    | 通过                                   |
| 仓库策略测试     | 9 项通过                                | 8 项通过                               |
| 公共测试         | 213 项通过                              | 68 项通过                              |
| 完整本地 watcher | 424 项通过，checker 无错误／警告        | 281 项通过，checker 无错误／警告       |
| 图集重建         | 无受跟踪字节变化                        | 无受跟踪字节变化                       |
| 安装包校验       | 118 个 allowlist 条目全部比较，包括 PNG | 93 个 allowlist 条目全部比较，包括 PNG |
| npm 依赖审计     | 未报告已知漏洞                          | `npm ci` 未报告已知漏洞                |

新增打包测试修复前复现了非法版本、覆盖拒绝前重建、最终 ZIP 检查时机三个失败；修复后四组打包测试通过。公共测试是完整本地测试的子集，表中数量不可相加作为独立覆盖数。

重新下载的正式 Release 附件通过源文件逐项校验，SHA-256 与 GitHub 公布值一致：

```text
7e947c8c93d762703753339a9a2e77485c3ee24cddc4d5601f8617e950737162
```

本次本地工具验证候选保留现有版本号，ZIP 哈希如下。归档时间戳可使重新构建的 ZIP 哈希不同；逐项内容校验确认 payload 一致。这些候选不构成新正式发行。

```text
Spiderlings_0.92.36-test.13.zip
e29f6b3dbcbd8c83d5116533eaf451e24a77f09ef789702df28c128aede1254f

Spiderlings_0.92.38.zip
9484de67eb03e201c41739d9fbf6c7665718f4e0380a6b73a870b325cdfbb0c6
```

图形实机、长时平衡和 KD 5.4.92 存读档的扩展验收没有在本次自动检查中补齐，仍由 [Issue #40](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/40) 跟踪。本次没有把现有 smoke 证据升级为正式玩法验收。

## 远端与结构审查

两条分支均要求最新基线上的 PR、`Repository checks`、线性历史与会话解决；管理员同样受约束，禁止强推和删除，外部审批数量为零。读取结果与 `.github/branch-protection.json` 一致。只允许 rebase merge，合并后删除分支，与 `.github/repository-settings.json` 一致。没有改动这些远端规则。

审查基线的 [test CI](https://github.com/duromumuyazu74-rgb/Spiderlings/actions/runs/35701576013) 与 [main CI](https://github.com/duromumuyazu74-rgb/Spiderlings/actions/runs/35701537349) 均成功。test 的安装包和 evidence artifacts 当时可用，过期时间为 2026-10-06。修复候选的 CI 结果以对应 PR 当前提交上的状态为准。

仓库已启用 secret scanning 与 push protection，Dependabot security updates 未启用。受跟踪文件中的常见 GitHub token 和私钥头模式扫描没有命中；这不是完整凭据审计。没有发现当前 Markdown 文档的缺失相对文件链接，扫描不包含历史 archive、skills、scratch 引用及锚点。

test 基线有 389 个受跟踪文件，合计约 77.4 MB。最大的四份画师 HTML 约 33 MB，分别位于 Mod 模型目录与 `docs/spiderlings-spinner-capture/`，内嵌相同用途的图像。它们没有进入安装包。游戏、原画输入、依赖和安装 ZIP 均未进入受跟踪文件集。

全量入口 ESLint 扫描覆盖 32 个运行时／维护入口文件，发现 36 条历史规则问题，集中于 `Spiderlings.js`、`SpiderlingsJumperDash.js`、`SpiderlingsModelRuntime.js` 的宽松比较和一个未使用参数。未发现未定义标识符；本次改动文件通过零警告检查。未将这些历史风格问题当作已证实的玩法故障批量改写。

## 后续改进顺序

1. 完成 #40 的真实游戏行动矩阵。优先记录 2／4／8 施工者、敌对 NPC 主动攻击蛛网、多人牵引成本和旧版本存读档。每份记录绑定 commit、实际游戏补丁与 ZIP 哈希。
2. 为 npm、Python 和 GitHub Actions 制定依赖更新流程。Dependabot 支持这些生态，但应先明确目标分支与维护回补方式；仅设 `target-branch: test` 不会把非默认分支变成 security updates 的目标。本次先修复已确认受影响的 Pillow pin，没有启用定时或无人值守更新。[5]
3. 将重复的内嵌画师 HTML 作为构建交付保存，仓库保留一份生成源、运行 PNG 与较轻的索引页。迁移前核对离线打开和画师下载用途。不要为减少体积删除 PNG fallback，也不要重写历史 Git 对象。
4. 保留现有运行时模块拆分。纯 Webbing 规则、共享 recovery core、统一 Spinner dispatcher 已提供可测试接口；本次 ZIP 校验也已归为一个实现。后续优先消除有实际调用者重复的逻辑。对 rollout 的逐组地图快照／物理图重建先测量，再决定缓存或批处理，尚无性能回归证据支持重写。
5. 明确源码与美术的授权清单。GitHub 当前未识别仓库 LICENSE，README 已说明不重新授予第三方美术或游戏许可。应由权利人确认授权后补充，不能用通用开源许可证覆盖现有资产。
6. 渐进清理历史比较运算和过期版本说明。运行文件改动仍需新版本 ZIP 与相关原生验收；不要为了通过一次全量 lint，顺带改写正式玩法。`Spiderlings_0.91/` 目前是约定的源目录，保留它可避免无实际收益的路径迁移。

## 一手资料

1. GitHub，[Troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)，尤其是成功状态与失败依赖章节。
2. GitHub，[Workflow syntax: jobs.needs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds)。
3. Pillow，[12.3.0 release notes](https://github.com/python-pillow/Pillow/blob/12.3.0/docs/releasenotes/12.3.0.rst)，通过 Context7 查询版本化文档，并与维护者公告交叉核对。
4. Pillow，[维护者安全公告](https://github.com/python-pillow/Pillow/security/advisories)，包括 [CVE-2026-25990](https://github.com/python-pillow/Pillow/security/advisories/GHSA-cfh3-3jmp-rvhc) 与 [CVE-2026-59199](https://github.com/python-pillow/Pillow/security/advisories/GHSA-6r8x-57c9-28j4)。
5. GitHub，[Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)，`package-ecosystem`、`target-branch` 与 security updates 的适用范围。

资料查阅日期均为 2026-09-22。首次 Context7 请求因连接失败而改读 GitHub 官方正文；后续 Pillow 文档查询成功。结论区分实际远端观测、已执行验证及尚待测量的建议。
