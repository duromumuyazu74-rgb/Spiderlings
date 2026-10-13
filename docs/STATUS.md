# 当前开发进度

核对日期：2026-10-13。本页汇总普通测试开发与独立监狱实验，任务状态以 GitHub Issues 和 PR 为准。

## 源码、安装包与合并

| 项目         | 当前状态                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正式 Release | [v0.92.39fix1](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.39fix1)，可安装包已发布                                           |
| 普通测试包   | `Spiderlings_0.92.36-test.152.zip`，双版本原生与完整交付验收通过；[PR #149](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/149) 已合入 `test` |
| 监狱实验包   | `Spiderlings_0.92.39-prison.alpha.15.zip`，源码 `29fa5f98ac8dcc00dabd62e933fbcfd315fbacc0`，实验安装包已验证                                          |
| 监狱集成     | [PR #77](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/77) 开放，目标 `test`；尚未合入 `test` 或 `main`                                      |

普通测试包与正式版不包含监狱实验。监狱实验沿用 v0.92.39fix1 的行为基线和当前共享模块；代码完成、安装包验收和目标分支集成分别记录。

## 巢穴监狱实验

#69–75 七张实现票已关闭，完成持久监狱与返回、实体外层扩建、竞争押送战斗、Cocoon 运输、主巢巡逻增援、区域警报和 50 回合囚室扩建。[#68 总任务](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/68) 与 [#76 最终验收](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/76) 保持开放，均为 `ready-for-human`。

alpha.15 已通过 1,158 项完整回归、仓库与策略检查、安装包与源码一致性核对；[源码 CI](https://github.com/duromumuyazu74-rgb/Spiderlings/actions/runs/38409860165) 通过。同一 ZIP 在 KD 5.4.92 与当次新拉取的官方 KD 5.5.4 各通过全部 68 个原生场景及七种语言检查。两版完成四层实体施工，cap=0 分别达到 66、64 个存活演员，准备后的早期逃脱路线均返回原楼层。

成熟四层场地中，两版的 50 次 Cut 尝试均失败，准备后的 Mage 尝试也未移除 Cocoon。这些失败与历史受控成功一并保留，不能据早期路线成功认定所有配置的逃脱难度已验收。剩余条件为明确逃脱、人口与平衡结论，并决定是否整合进普通 `test`；详情见 [实验规则](PRISON-EXPERIMENT.md#acceptance) 与 [alpha.15 兼容证据](COMPATIBILITY.md#prison-alpha15-2026-10-13)。

## 已完成实现

- FieldCustody 保存场地猎物归属；FieldCommand 统一附近空闲 Spinner 的指挥。场地安排回收接触或小队攻击竞争牵引 NPC，保留正在执行的捕获、牵引及冲刺。重度受缚玩家的回收接触通过原生付费攻击完成；援助者避让中心与运输路线。

- 场地待备与增援按需求及急度分配，区分承诺、在途、到场和可执行人数。新部署同时受 `floor(n / 4)` 人口许可及配置上限限制。
- 多层场地最低常驻按 `L*(L+1)/2` 累计，一至四层为 1、3、6、10。总控先补最低分配，再安排可选支援；出借保留供给场地最低配额，本场地任务外出与在途、到场分别统计。最低分配有缺口时暂停新增独立工程，多场地存档逐座接管。
- FieldProjects、FieldCommand、SpinnerDuties、Topology 和 NativeField 分别管理工程、指挥、单次行动、结构和原生事务。共用原生阶段集中于 NativeActions；物种登记自己的策略。
- 独立原生测试组使用新环境，`helpers` 只表示代码依赖，`continues` 表示必须共享前置场景状态。
- 运行时脚本均有测试映射。已识别函数改动可缩小范围，混合改动合并覆盖，共用代码包含实际消费者，未知输入以 `needs-mapping` 停止。

具体职责和验证入口由 [MODULES.md](MODULES.md)、[RUNTIME.md](RUNTIME.md) 与 [DEVELOPMENT.md](DEVELOPMENT.md) 维护。

## 正式发布

[Issue #150](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/150) 的 0.92.39 发布已完成，后续场地角点及坍塌连接修复由 [Issue #154](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/154) 交付为 v0.92.39fix1。test.152 的原始审查与验证范围保留在[审查记录](archive/validation/spiderlings-0.92.39-review.zh-CN.md)。监狱实验没有正式晋升或 Release。

## 场地修正

test.151 保留 Jumper 对竞争牵引者已批准冲刺的敌意与小队名额，修复冷却已消耗却立即自行取消的情况。玩家在部分 Capture 期间穿腿套真实越界会保留待回收记录，Capture 结束前仍不启动重叠 Recovery。最终同包在 KD 5.4.92 与新拉取的官方 5.5.3 各通过全部 62 项原生检查及七种语言加载；12 项策略测试、782 项公共测试、1,111 项完整本地回归和逐字节包核对通过。详见 [test.151 验证记录](archive/validation/spiderlings-test151-residency.zh-CN.md)。

Review 及完整回归发现并修复多场地漏接管、在途常驻接触时丢失指挥、运输途中近场地被未施工重选规则退役。重复越界回收的原生场景在两个版本均已通过，断言继续要求两次返回最近中心。

最新存档副本 `save_15` 有 12 名存活 Spinner，三座有效场地最低需求为 6、6、1，共 13。第一轮分配为 5、6、1，保留一名分配缺口。30 回合正常等待中可观察成员付费移动和陆续到场，尚未全员到场；原始存档与安装未改写。细节由最终验证记录维护。

## test.146 历史验收

用户已澄清回收必须由穿腿套的真实场内到场外越界触发。test.145 的场内自动回中心行为已被取代；本次同时修复回收接触补位、远程拦截站位和两种 Adventurer 派系女仆骑士的敌对识别。修正及完成记录由 Issue #148 和 PR #149 维护。

test.146 在 KD 5.4.92 和新拉取的官方 5.5.3 各通过 60 项原生检查及七种语言加载；12 项策略测试、774 项公共测试、1,102 项完整本地回归与同包逐字节核对通过。存档副本在场内 `(18,15)` 等待 12 回合没有启动回收，实际越界后的回收由原生场景验证。详见 [test.146 验证记录](archive/validation/spiderlings-test146-boundary-recovery.zh-CN.md)。

## test.145 历史验收

test.145 同包在 KD 5.4.92 和新拉取的官方 5.5.3 各通过 60 项原生检查及七种语言加载；12 项策略检查、767 项公共测试、1,094 项完整本地回归与逐字节包核对通过。安装包 SHA-256、上游提交及报告见 [COMPATIBILITY.md](COMPATIBILITY.md#test145-field-custody-and-recovery-2026-10-08)。

实际存档副本记录到主动向冰元素施放 WebSpray。该短回放中冰元素仍持有牵引，不能认定已经夺回猎物；移除竞争者的独立副本在第 2 回合自行开始回收，第 5 回合回到最近中心。顺序对照的平均等待处理时间由 581.6 ms 降至 82.9 ms，详见 [存档回放记录](archive/validation/spiderlings-test145-field-custody.zh-CN.md)。

## 此前已完成的验收

test.135 包的 SHA-256 为 `0ce796dd5e7a8a1213f10fd41f948155d405c5655334eb9a4dd0aa5f8bef6a82`。同一包于 2026-10-08 在 KD 5.4.92 和官方 5.5.3 各通过 59 项原生场景及七种语言加载；当时拉取的官方提交是 `04ded07e619c31424b8074b336b6c3c70121cebd`。详见 [COMPATIBILITY.md](COMPATIBILITY.md#test135-module-ownership-and-isolated-native-environments-2026-10-08)。这是该次验收快照，不是对未来上游版本的保证。

随后测试映射提交通过 12 项策略检查、754 项公共测试、1,081 项完整本地回归及同包逐字节核对；PR #147 的 Repository checks、Windows worktree safety、Delivery checks 均通过。报告为该工作树的 `.scratch/delivery/2026-10-08T09-04-22-596Z-9hEuwc/REPORT.md`，远程证据见 [CI run 37754769069](https://github.com/duromumuyazu74-rgb/Spiderlings/actions/runs/37754769069)。此工具改动复用了未变安装包的原生验收，没有重跑游戏或重新构建玩家包。

## 尚未完成

- [巢穴监狱 #68](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/68) 与 [#76](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/76) 等待逃脱与平衡验收、实验集成决定。[PR #77](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/77) 仍开放。

Archify 3.0.1 已作为维护者全局 skill 安装，并生成基于 `a5a17d6` 的本地运行时、场地职责和测试选择图。源码引用与产物检查通过，但其 Windows Chrome 管道连接失败，浏览器及视觉验收未完成。这些本地 HTML 不进入 Mod 包，仓库维护入口仍是上面的 Markdown 契约。
