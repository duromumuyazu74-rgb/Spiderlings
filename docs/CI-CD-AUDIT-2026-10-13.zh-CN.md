# Spiderlings CI 性能与 CD 核查

核对日期：2026-10-13，Asia/Shanghai。仓库为 `duromumuyazu74-rgb/Spiderlings`。本次终点是本地实现与验证，没有推送、触发远端工作流或发布版本。

## 当前证据

主工作目录停在 `f19b144`，并有未提交文档，因此在独立、锁定的 worktree `../.scratch/ci-delivery-audit-20261013` 中从当前 `origin/test` 开始工作，保留原目录的所有改动。

| 分支 | 当前提交                                   | 最近一次维护分支 CI                                                                                   | 结果    |
| ---- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------- |
| test | `d1358b1c95c7a8505be1794648ad724bf443e321` | [37904746147](https://github.com/duromumuyazu74-rgb/Spiderlings/actions/runs/37904746147)，2026-10-09 | success |
| main | `c73aecf8b4fafeff479f30703634a385a5a2dd31` | [37947190715](https://github.com/duromumuyazu74-rgb/Spiderlings/actions/runs/37947190715)，2026-10-09 | success |

两分支的工作流相同。实际 branch protection 均要求 `Repository checks`、严格更新基线、PR 和解决 review conversation，外部审批人数为 0，规则约束管理员。聚合 job 对两个前置 job 的失败、取消和跳过均拒绝通过。此项通过 GitHub API 回读确认，不是仅根据仓库配置推断。

最近的依赖 PR 运行不能代表维护分支状态。[38203896683](https://github.com/duromumuyazu74-rgb/Spiderlings/actions/runs/38203896683) 在 `dd41af29a91b6a81d1446ea53c9cad9afc65c474` 失败：repository check 和文本审计测试报告 `Cannot read properties of undefined (reading 'Latest')`，构建、策略测试、包校验和 atlas 一致性通过。该依赖更新尚未集成；本次不更改其依赖或弱化失败检查。

## 托管 CI 耗时

以下是上述两个运行的实际 job/step 时间和下载的 `report.json` 时间戳。Linux runner 为 Ubuntu 24.04，Node 24.21.0、Python 3.12.15；Windows 安全检查独立并行。

| 阶段，秒                             |   test |   main |
| ------------------------------------ | -----: | -----: |
| npm 安装                             |      3 |      2 |
| pip 安装                             |      3 |      2 |
| atlas 生成、ZIP 写入及构建器内部校验 | 51.515 | 49.208 |
| repository check                     |  9.931 |  1.290 |
| policy tests                         |  0.621 |  0.584 |
| public tests                         | 53.713 | 54.000 |
| 最终 ZIP 独立校验                    |  0.836 |  0.778 |
| atlas 与提交比较                     |  0.004 |  0.003 |
| Delivery checks job                  |    145 |    120 |
| Windows worktree safety job          |     31 |     30 |
| 聚合 Repository checks job           |      7 |      6 |
| 总历时，含排队与 job 间调度          |    159 |    132 |
| 三个 job 的 runner 时间合计          |    183 |    156 |

两个运行的 workflow 开始时间均与创建时间相同；总历时还包含 runner 分配、job 间调度与收尾，不应把它全算成测试时间。checkout 约 2–3 秒，Node/Python 准备各约 1–3 秒。当前日志没有进一步拆分 atlas 与 ZIP 压缩的内部耗时，也没有把每个测试的准备、调用和清理分别计时。

npm 两次均命中基于 lockfile 的缓存；pip 在 test 运行未命中，在 main 命中。即使 pip 冷缓存安装也只有 3 秒。依赖准备不是当前瓶颈。全新本地 worktree 的 `npm ci` 成功，83 个包，但本地网络安装约四分钟，不能据此推断 GitHub runner 的成本。

公共测试中较慢的是实际多场地行为，例如 `independent fields are limited without counting their individual rings` 8.68 秒、`separate Spinner groups perform paid work on their own enclosures` 5.38 秒，以及进程级构建/错误包回归。未测出可以安全跳过的等价准备。维持 public/local 分组和 Node 进程隔离；Windows 安全用例在 Linux 公共组与 Windows job 的重复是跨平台验证，Windows 特有的 junction 路径仍由 Windows job 执行。

本次没有更改托管 job 数量、超时、测试选择、依赖缓存或 atlas 生成。当前维护分支在 132–159 秒内完成，构建与测试各约 50 秒，尚无证据支持增加 job 或缓存已验收结果。每次重新生成 atlas 并与提交比较，继续验证锁定依赖和资源生成的一致性。

## 重复执行的本地优化

full delivery collector 原先先跑 public，再由完整 watcher 跑 public + local。移除了前一个独立 public 调用；public 模式仍执行原来的完整公共组，full 模式的报告明确记载公共测试由 watcher 执行。watcher 失败仍使报告失败。

同一 Windows worktree、Node 24.14.1、同一套修改后的测试和同一个 ZIP，顺序执行冻结的旧 collector 与新 collector。两者都完成 repository/policy/package 检查和完整 watcher；没有并行 benchmark。两个 watcher 日志的 1,118 个成功测试名称完全一致，旧 collector 额外重复了 789 项公共测试。suite 注册和选择未改变。

| 本地阶段，秒 | 旧 collector |        新 collector |
| ------------ | -----------: | ------------------: |
| 独立公共测试 |       22.172 | 由完整 watcher 覆盖 |
| 完整 watcher |       25.869 |              23.516 |
| 完整报告     |       54.575 |              26.196 |

单次配对测量减少 28.379 秒，约 52%。其中可以直接归因于删除重复执行的是原来 22.172 秒的公共调用，其余差值含普通运行波动与热缓存影响。这不是托管 CI 加速结论。新回归同时验证 full 模式仅执行一次公共测试、公共失败经 watcher 传播为失败。

原始比较保存在本 worktree 的 `.scratch/ci-audit/comparison.json`，复现脚本为同目录 `compare-delivery.js`。对应报告目录为 `.scratch/delivery/2026-10-13T03-27-30-265Z-ipQxOm` 和 `.scratch/delivery/2026-10-13T03-28-24-841Z-cj0mOK`。

参考 BP 的固定提交 `4bde2e2b43aa8099e327de6c8ffdf7927735e39f`，读取了其 CI 三组实际命令，以及 `tests/test_contracts.py` 中缓存不变 OpenAPI/schema、继续每次验证实际输入的实现。保留了 skill 中 26 项同负载对比和 875 项无遗漏分组的历史数据边界。Spiderlings 不照搬其分组数或账号夹具方案，本次采用的是先识别重复工作、再保持完整覆盖的做法。BP 远端 API 此账户返回 404，固定提交实现通过现有本地 Git 对象核对；历史 BP 云端时间没有在本次重新验证。

## CD 阶段与补齐内容

| 阶段                          | 当前状态            | 依据和边界                                                                                                           |
| ----------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 自动源码检查                  | 自动                | PR、main/test push、workflow_dispatch；真实 required gate 已回读                                                     |
| 生成玩家安装包                | 自动                | CI 调用现有构建器；manifest allowlist + 七个 locale，不包含维护工具或游戏                                            |
| 最终包校验                    | 自动                | 已有 verifier 检查根目录、缺失/额外/重复条目、版本 manifest，以及所有 payload 的 SHA-256，包含 PNG                   |
| 保存候选包和报告              | 自动                | `spiderlings-<SHA>` 与 `spiderlings-evidence-<SHA>`，14 天；过期前由维护者下载保留                                   |
| 选取候选包                    | 人工选择，脚本核验  | 新增 `verify:candidate` 关联干净提交、成功构建报告、包名、版本、大小与 SHA-256；成功的完整 CI run 仍需回读           |
| 双版本原生与适用视觉/游戏验收 | 本地自动工具 + 人工 | 按现有政策测试同一最终包的 KD 5.4.92 与新 fetch 的官方 5.5；CI 公共组不能替代                                        |
| 正式发布                      | 人工决定和执行      | main 集成、成功 CI、同包验收后显式发布；默认测试包使用 artifact，显式测试 Release 使用 Pre-release 且保留正式 Latest |
| 发布后实际下载                | 人工触发，自动核验  | 既有 `verify:publication` 检查 tag、双语 notes、channel、Latest、main 集成与下载字节；本次加强源码提交绑定           |
| 服务部署/数据库迁移           | 不适用              | 交付对象是可安装 Mod ZIP                                                                                             |

已有发布核验分别验证 tag 的提交和 ZIP 对当前文件的内容，却没有验证当前 payload 是否属于传入的提交。本次在发布核验前后增加 `verifyPackageCommit`，按 Git blob 比较所有 177 个文件的原始字节，绕过 clean filter 与换行归一化；版本也必须与 tag 一致。无关文档改动可保留。候选包命令复用这项检查和既有 ZIP verifier，不引入第二套归档实现。

托管 CI 所需输入已全部位于 Git：atlas builder、锁定 Python 依赖、66 张明确的 atlas 源 PNG、派生 atlas 以及其余 allowlist payload。原版 KD、基线游戏安装、原始美术来源目录和本地 Chrome 不参与 CI 打包。它们仍用于本地 watcher、原生加载和视觉验收。候选包采用 CI artifact 下载后原样验收、原样上传的衔接；重建需重新核验并取得对应新哈希的验收，不复用不同 ZIP 的验收记录。

## 验证和产物

- 本地构建/public report 通过，atlas 重新生成后与提交无差异；完整 watcher 通过 1,118 项，策略测试通过 12 项；789 项公共测试也单独通过。新增候选/提交关联、PNG 变动、换行差异、未提交清单、错误报告和下载损坏回归通过。`git diff --check` 通过。
- 本地构建测试 ZIP 为 24,887,692 bytes，SHA-256 `13a1d4ac66746bc534c55cebc57c6bb72b89657a648a54f637bcfd69d5647c09`。版本保留 `0.92.36-test.152`，仅是工具维护候选，没有交付新玩法或递增玩家版本。
- 从 test CI run 37904746147 实际下载的 ZIP 为 24,933,803 bytes，SHA-256 `104de5424537451a15a2b775f666a619b1f96bc5ba6682da3095d2d6456b9853`。新 `verify:candidate` 验证其报告、177 项内容及源码提交通过；它与本地 ZIP 是不同归档字节，不能互换其游戏验收。
- 现有正式 [v0.92.39fix1](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.39fix1) 指向 `030038593be73c2f0823b66e53cc59507bbd8a66`，仍为 Latest。重新下载并运行正式 checkout 的 `verify:publication` 通过，附件为 24,933,888 bytes，SHA-256 `76afb32d9d3d08458ebc9a30de5a328b8f1831a4d33f122a970130e6476d33ec`，与已有兼容性记录一致。新增提交关联函数也在该正式源码上通过。结果保留在 `../ci-delivery-formal-readback-20261013/.scratch/publication/0.92.39fix1-TYPWYT/verification.json`。

本次 runtime payload 没有变化，不要求新玩家版本或重做双版本游戏验收；上述包级检查不声称进行了新的游戏或视觉验收。已有正式版的原生验收记录仍属于其当时的官方提交。

没有新增 secret 或远端设置要求。后续提交需要按仓库流程建立 Issue/PR，并在实际提交上运行托管 CI；本地新增代码尚未获托管执行验证。正式发布仍需维护者的 `duromumuyazu74-rgb` GitHub 身份、Release/tag 写权限，以及现有双版本环境和适用人工验收。当前实现位于 test 派生维护分支，向 main 搬运时应使用独立维护 PR，保留 main 已有的 `fixN` 版本支持，不晋升 test 玩法。

相关命令见 [发布流程](DEVELOPMENT.md#releases)与[交付证据](DELIVERY-EVIDENCE.md)。Git 原始字节核验语义参照官方 [ls-tree](https://git-scm.com/docs/git-ls-tree) 和 [hash-object](https://git-scm.com/docs/git-hash-object) 文档；GitHub artifact 下载按[官方说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts?tool=webui)。Context7 的 Git 查询因额度不足回退至官方资料，已在本地 Git 2.52.0.windows.1 验证实际命令。
