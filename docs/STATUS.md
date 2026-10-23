# 当前开发进度

核对日期：2026-10-23。本页汇总测试开发与监狱玩法的集成，任务状态以 GitHub Issues 和 PR 为准。

## 当前开发候选

`0.92.39-test.3` 允许仍被拘束的玩家在连续十个世界回合无合格蛛丝命中后恢复密度衰减。普通拘束、链接内层、腿袋、丝绳与丝茧不再重置计时；自己的挣扎和换装也不重置。现有衰减曲线、命中增长、结茧门槛与存读档数值保留。

监牢试玩反馈认可当前人口压力，待改善的是移动或等待后的处理停顿。此候选让普通敌我关系查询先排除与实际牵引者无关的单位对，再检查争夺资格，保留真实押送争夺与人口、增援规则。新的回归覆盖无关单位不扫描装备或场地、真实牵引切换、装备解除和已承诺 Jumper 冲刺。预发布入口为 [test.3](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.39-test.3)，验收证据记录在 [COMPATIBILITY.md](COMPATIBILITY.md)。

KD 5.5.6 的兼容验收还发现原生延迟布置会挤走已出生的 Nurse，使其落在巢穴五格内；旧 alpha.19 同样复现。Population 保留原生创建和移位副作用，并为这类出生冲突恢复六格巢穴间距，同时保留与其他猎物的六格距离，计入商店 NPC。普通移动保持原规则。

最终 test.3 同包在 KD 5.4.92 与新拉取的官方 KD 5.5.6 提交 `1b5af79c17d91868232f4bdbf197e822ee21269f` 各通过全部 69 项原生检查和七种语言加载。保留的监牢存档进行同种子、四十回合对照，回合计算均值由 100.34 ms 降至 59.30 ms，约减少 40.90%；逐回合位置与单位数量一致。共享敌我判断的优化在各类地图生效，该耗时结果只对应这次监牢样本。

[PR #166](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/166) 已合入 `test`，发布源为 `cc2db9c1c1e8a5b17fcf313b74ab9de7a318bb8f`。[test.3 Pre-release](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.39-test.3) 的实际下载附件已核对，与本地验收包的大小和 SHA-256 一致；正式 Latest 保持 v0.92.39fix1。

## 源码、安装包与合并

| 项目         | 当前状态                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正式 Release | [v0.92.39fix1](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.39fix1)，可安装包已发布                                        |
| 当前测试包   | [test.3 Pre-release](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.39-test.3)，含巢穴监牢、安静密度衰减及全地图共享判断优化 |
| 监狱集成     | [PR #164](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/164) 将监狱玩法整合进 `test`；正式版仍为 v0.92.39fix1                             |

`test` 包含监狱玩法，当前安装包为 `Spiderlings_0.92.39-test.3.zip`。alpha.19 的历史 Release 和安装包保留，test.152 的验收记录保留在兼容文档。正式版的行为与 Latest 标记仍保持 v0.92.39fix1。

## 织巢主母设计

[织巢主母草案](spiderlings-boss-design.zh-CN.md)及其 [HTML 展示页](spiderlings-boss-design.html)记录两阶段战斗、四巢转场、魔织丝茧与实际多格占位要求，后续工作由 [#165](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/165) 跟踪。主母应以类似原生龙的体量参与移动、碰撞和攻击判定，具体占格尺寸待原型确认。Boss 本体尚未实现，当前安装包只包含已完成的基础密度规则。

## 巢穴监狱实验

#69–75 七张实现票已关闭，完成持久监狱与返回、实体外层扩建、竞争押送战斗、Cocoon 运输、主巢巡逻增援、区域警报和 50 回合囚室扩建。[#68 总任务](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/68) 与 [#76 最终验收](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/76) 保持开放，均为 `ready-for-human`。

alpha.19 新增无上限蛛丝密度，按密度增加幼蛛拘束的摆脱工作量，并替代结茧对减速层数的依赖。穿着任何幼蛛拘束时不衰减，全部脱下十个世界回合后才逐渐加快消散。监狱闲置移动蜘蛛休眠，玩家声响和实际巡逻、施工、维修、回收任务可唤醒限定成员；修复囚室施工队与共同回收逻辑的衔接。入狱、押送期限、50 回合扩建、人口和增援参数不变。

完整 1,174 项本地回归通过，包含 Prison alpha 的预发布类型与正式 Latest 保留检查；同一 ZIP 在 KD 5.4.92 与当次新拉取的官方 KD 5.5.4 各通过全部 69 项原生检查及七种语言加载。最新存档副本在 16 回合内由原生动作拖回囚室中心，原存档未改写。受控短回放平均回合处理时间由 218.66 ms 降至 143.70 ms，约减少 34.28%；这是同一位置的短时对照，不是桌面帧率。详见 [alpha.19 兼容证据](COMPATIBILITY.md#prison-alpha19-2026-10-14)。

成熟四层场地的 50 次 Cut 尝试在两版均未脱茧。准备后的 Mage 路线在 5.4.92 未脱茧，在 5.5.4 脱茧后未找到穿越场地的路线；两版早期准备路线均成功返回原楼层。维护者已批准集成进 `test` 并发布预发布版，后续逃脱与平衡试玩继续由 #76 跟踪。

### alpha.15 历史验收

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

[Issue #150](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/150) 的 0.92.39 发布已完成，后续场地角点及坍塌连接修复由 [Issue #154](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/154) 交付为 v0.92.39fix1。test.152 的原始审查与验证范围保留在[审查记录](archive/validation/spiderlings-0.92.39-review.zh-CN.md)。监狱以 alpha.19 预发布版提供，尚未晋升正式版。

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

- [巢穴监狱 #68](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/68) 与 [#76](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/76) 保持开放。2026-10-23 的试玩反馈认可整体体验和大量幼蛛的难度；回合计算优化与安静衰减规则已随 test.3 整合并发布。剩余为新规则下成熟四层围场的脱困试玩记录，需包含构筑、资源和实际路线结果。旧版失败路线继续保留在兼容记录中。

Archify 3.0.1 已作为维护者全局 skill 安装，并生成基于 `a5a17d6` 的本地运行时、场地职责和测试选择图。源码引用与产物检查通过，但其 Windows Chrome 管道连接失败，浏览器及视觉验收未完成。这些本地 HTML 不进入 Mod 包，仓库维护入口仍是上面的 Markdown 契约。
