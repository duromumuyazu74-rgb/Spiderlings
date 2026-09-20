# 已核实机制卡

核对日期：2026-09-13。基线为安装版 **5.4.92** 的 `out/main.js`，对照为本地 **5.5.0** TS；文件身份见 [baseline.json](baseline.json)。下面只覆盖列出的函数与前提。源码入口的行号可用 [版本探针](../scripts/probe.py) 重新定位。

## 线性 Buff 与倍率

两版 `KinkyDungeonMultiplicativeStat(s)` 实现一致：正值返回 `1/(1+s)`，负值返回 `1-s`，零返回 1。输入 `[-0.5,0,0.5,1]` 对应 `[1.5,1,2/3,0.5]`。

`KinkyDungeonGetBuffedStat` 对通过 `KDBuffEnabled` 的同 type Buff 加总 power，再由调用者决定如何使用。`onlyPositiveDuration` 是可选条件，不能概括为“duration=0 的 Buff 永远不参与”。`disableTypes` 检查 list 中对应键是否存在，不是遍历所有 Buff 的 type。

`KinkyDungeonMultiplicativeStat(-KDEntityBuffedStat(...))` 带负号的消费者与直接传入相反；比如 `KDGetEnemyStruggleMod` 的 `StrugglePower` 消费处。策划表必须标明符号方向与消费点，不能把每个 power 解释成百分比。

5.5 路径：`Game/src/enemy/KinkyDungeonEnemies.ts`、`Game/src/effect/KinkyDungeonBuffs.ts`。倍率函数做过两版原生函数边界探针；Buff 聚合相关结论为源码核对。

## 同 ID 重施加与不同 ID 累加

两版 `KDApplyBuff` 实现一致：以 id（回退 name）作为 list 键。相同 ID 按已有/新 power 的正负与比较条件选择是否替换；`cancelOnReapply` 可直接过期。它不是通用加层计数器。

同 ID 且正 power 相等的新 Buff 会进入替换分支，所以更短的 duration 也能替换旧长 duration；不能假定所有重施加都是“取较长持续时间”。不同 ID、相同 type 才可能在聚合器中共同贡献，仍受启用条件约束。需要独立层数时先明确项目玩法，再选择多个 ID 或显式层数，不从名称臆造原生堆叠规则。

探针覆盖：同 ID 等强短时重施加、弱值拒绝、负值更强替换及取消。事件/音效以显式替身隔离，未证明完整游戏所有 Buff 行为。

## Buff 时长不是固定帧数

`KinkyDungeonTickBuffs(entity, delta, endFloor)` 先判断到期条件，再执行内建效果，再对非 infinite 的 duration 减 delta。`endFloor`、`endSleep`、`resetDurationTime` 改变生命周期。调用次数、delta 和注册/消费顺序决定实际作用窗口。

两版周期重置差异及实际输入输出见 [迁移实例](migration.md)。涉及持续控制或周期恢复时按这个调用顺序做时间线，不能只用 duration 乘单次 power。

## NPC 战斗绑定

两版 `KDBoundEffects` 与 `KDGetBindEffectMult` 实现一致：目标原型需有 `Enemy.bound`，监禁分支可直接返回 4。普通分支使用 `boundLevel` 对比 `Enemy.maxhp * mult`，`unstoppable` 的 mult=3，`unflinching` 的 mult=2，其余为 1。

普通满血目标的 1/2/3 级阈值为严格大于 25%/50%/75%；4 级是大于等于 100%。低血量另有提前返回 4 的条件。以 maxhp=100、普通标签、未监禁为例，boundLevel=25 时等级仍是 0，25.01 才是 1；不能把阈值写成全都 ≥。

`KDGetEnemyStruggleMod` 还依赖血量、状态、绑定比例、distraction、协助和 Buff；它返回修正量，不是完整的每回合挣脱量。调参需继续追踪调用方的 delta、材料/类别与写回。`boundLevel` 与 `specialBoundLevel`、NPC 实物束缚记录是不同层面；要找到同步函数和转换行为。

边界探针覆盖 25/50/75/100%、高抗性标签、原型不支持绑定、监禁及低血量分支。只把 `KDIsImprisoned` 替换为测试输入；未模拟完整 AI 或捕获过程。

## 事件注册与生命周期

两版 `KDAddEvent(map,trigger,type,code)` 都把处理器写入 `map[trigger][type]`；同一键后注册覆盖前注册，不是自动追加监听器。用 Mod 命名空间区分自有 type，核对选择的处理表、发送者、payload 和调用次数。直接注册处理器不会使未发送的 trigger 自动发生。

函数探针覆盖同键覆盖和独立键共存。有关加载、重新注册、存档恢复时机，要在实际 Mod 入口验证。

## 扩充机制卡

新卡给出“精确版本 + 符号/文件身份 + 前提 + 行为 + 验证方式/限度”。只为会影响未来决策的发现建卡；大量物品数值和类型定义留在源码，以检索入口访问。发现改动时修订受影响卡并保留旧补丁事实，不把猜测写成知识库。
