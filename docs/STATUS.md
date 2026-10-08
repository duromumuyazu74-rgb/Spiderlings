# 当前开发进度

核对日期：2026-10-08。本页汇总开发候选，任务状态以 GitHub Issues 和 PR 为准。

## 源码、安装包与合并

| 项目               | 当前状态                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 正式 Release       | [v0.92.38](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.38)                                   |
| 运行时包           | `Spiderlings_0.92.36-test.145.zip`，双版本原生与完整本地交付检查均通过                                                |
| 最新功能与工具提交 | 基于 `b9431be` 实现 [Issue #148](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/148) 的回收、猎物归属与拦截 |
| 源码候选           | `fix/148-field-custody-recovery`，基于 PR #147；目标 `test`，尚未合并                                                 |

PR #147 包含前序场地修复及模块重构候选。PR #143、#145 和更早的候选仍保留；代码完成、安装包验收和目标分支集成是不同状态。本页不把本地候选写成已进入 `main` 或 `test`。

## 已完成实现

- FieldCustody 保存场地猎物归属；FieldCommand 统一附近空闲 Spinner 的指挥。场地安排回收接触或小队攻击竞争牵引 NPC，保留正在执行的捕获、牵引及冲刺。重度受缚玩家的回收接触通过原生付费攻击完成；援助者避让中心与运输路线。

- 场地待备与增援按需求及急度分配，区分承诺、在途、到场和可执行人数。新部署同时受 `floor(n / 4)` 人口许可及配置上限限制。
- FieldProjects、FieldCommand、SpinnerDuties、Topology 和 NativeField 分别管理工程、指挥、单次行动、结构和原生事务。共用原生阶段集中于 NativeActions；物种登记自己的策略。
- 独立原生测试组使用新环境，`helpers` 只表示代码依赖，`continues` 表示必须共享前置场景状态。
- 47 个运行时脚本均有测试映射。已识别函数改动可缩小范围，混合改动合并覆盖，共用代码包含实际消费者，未知输入以 `needs-mapping` 停止。

具体职责和验证入口由 [MODULES.md](MODULES.md)、[RUNTIME.md](RUNTIME.md) 与 [DEVELOPMENT.md](DEVELOPMENT.md) 维护。

## 本次验收

test.145 同包在 KD 5.4.92 和新拉取的官方 5.5.3 各通过 60 项原生检查及七种语言加载；12 项策略检查、767 项公共测试、1,094 项完整本地回归与逐字节包核对通过。安装包 SHA-256、上游提交及报告见 [COMPATIBILITY.md](COMPATIBILITY.md#test145-field-custody-and-recovery-2026-10-08)。

实际存档副本记录到主动向冰元素施放 WebSpray。该短回放中冰元素仍持有牵引，不能认定已经夺回猎物；移除竞争者的独立副本在第 2 回合自行开始回收，第 5 回合回到最近中心。顺序对照的平均等待处理时间由 581.6 ms 降至 82.9 ms，详见 [存档回放记录](archive/validation/spiderlings-test145-field-custody.zh-CN.md)。

## 此前已完成的验收

test.135 包的 SHA-256 为 `0ce796dd5e7a8a1213f10fd41f948155d405c5655334eb9a4dd0aa5f8bef6a82`。同一包于 2026-10-08 在 KD 5.4.92 和官方 5.5.3 各通过 59 项原生场景及七种语言加载；当时拉取的官方提交是 `04ded07e619c31424b8074b336b6c3c70121cebd`。详见 [COMPATIBILITY.md](COMPATIBILITY.md#test135-module-ownership-and-isolated-native-environments-2026-10-08)。这是该次验收快照，不是对未来上游版本的保证。

随后测试映射提交通过 12 项策略检查、754 项公共测试、1,081 项完整本地回归及同包逐字节核对；PR #147 的 Repository checks、Windows worktree safety、Delivery checks 均通过。报告为该工作树的 `.scratch/delivery/2026-10-08T09-04-22-596Z-9hEuwc/REPORT.md`，远程证据见 [CI run 37754769069](https://github.com/duromumuyazu74-rgb/Spiderlings/actions/runs/37754769069)。此工具改动复用了未变安装包的原生验收，没有重跑游戏或重新构建玩家包。

## 尚未完成

- [Issue #127](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/127) 保持 `needs-info`：仍需将该 Issue 较早的停工截图对应到它自己的存档场景，跟踪实际付费回合。后续其他存档的成功回放不能替代这一条验收。
- 候选 PR 的集成和正式发布尚未执行。
- [巢穴监狱 #68–76](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/68) 属于独立实验；以各 Issue 的剩余条件为准，不并入普通 test 完成清单。

Archify 3.0.1 已作为维护者全局 skill 安装，并生成基于 `a5a17d6` 的本地运行时、场地职责和测试选择图。源码引用与产物检查通过，但其 Windows Chrome 管道连接失败，浏览器及视觉验收未完成。这些本地 HTML 不进入 Mod 包，仓库维护入口仍是上面的 Markdown 契约。
