# KD 机制地图

这是按任务检索的入口，覆盖面表示“能定位调查”，不是“所有机制均已验证”。下面的路径相对 **5.5.0 源码根**；5.4.92 安装版以同名符号搜索 `out/main.js`，参数与行为分别核实。选当前领域及直接依赖即可。

| 领域 | 5.5 源码入口/搜索词 | 调查时要解决的问题 |
| --- | --- | --- |
| 主循环、回合与输入 | `Game/src/base/game/KinkyDungeonGame.ts`：`KinkyDungeonAdvanceTime`；`Game/src/base/KinkyDungeon.ts` | 输入是否消耗时间，`delta` 单位，敌我更新、tick/tickAfter、延迟动作顺序。绘制帧不等于游戏回合。 |
| 全局状态、类型与存档 | `Game/src/base/KDTypeDefs.ts`；`KinkyDungeon.ts`：`KDGameData`、`KDMapData`、`afterLoadGame` | 定义对象、运行实体、跨层状态、存档序列化各归谁；缓存或函数是否需要加载后重建。 |
| Mod 加载与资源 | `Scripts/KDMods.ts`、`Scripts/KDModsUtils.ts`；`KDLoadMod`、`KDExecuteMods`、`KDModFiles`、`fileorder` | ZIP 根、脚本先后、路径大小写、注册与异步解码、重载覆盖。 |
| 事件与 Buff | `Game/src/effect/KinkyDungeonEvents.ts`、`KinkyDungeonBuffs.ts`；`KDAddEvent`、`KDApplyBuff`、`KinkyDungeonSendEvent` | 发送者、事件处理表、payload 的可变字段、施加/刷新/过期、同 ID 与同 type、缓存失效。 |
| 战斗与命中 | `Game/src/fight/KinkyDungeonFight.ts`：`KinkyDungeonDamageEnemy`；`Game/src/player/KinkyDungeonStats.ts`：`KinkyDungeonDealDamage` | 命中、闪避、护甲、抗性、暴击、护盾、伤害与控制应用的实际顺序；玩家与 NPC 入口分别追踪。 |
| 法术、弹体与 AoE | `Game/src/magic/KinkyDungeonMagic.ts`：`KinkyDungeonCastSpell`；`Game/src/fight/KinkyDungeonFight.ts`：`KinkyDungeonUpdateBullets` | 施法成本、组件失败、预警、弹体步进、碰撞、重复命中、AoE 目标过滤和事件次数。 |
| 敌人 AI、感知与移动 | `Game/src/enemy/KinkyDungeonEnemies.ts`、`KinkyDungeonPathfinding.ts`；`KinkyDungeonUpdateEnemies` | `movePoints/attackPoints` 消耗，视线、寻路、警戒、追踪、特殊攻击、冷却；AI 决策与表现分开。 |
| NPC 战斗绑定与挣脱 | `KinkyDungeonEnemies.ts`：`KDBoundEffects`、`KDGetEnemyStruggleMod`、`specialBoundLevel` | 绑定类别与总量同步、阈值、伤势、抗性、协助、衰减、俘获资格。不要把渲染进度当权威状态。 |
| NPC 实物束缚、收集与押送 | `Game/src/collection/`、`Game/src/dialogue/`；全局搜 `KDGetNPCRestraints`、`NPCRestraint`、`KDIsImprisoned` | 战斗控制量、穿戴记录、监禁/队伍/收藏状态不同；找到转换和持久化路径。 |
| 玩家束缚与逃脱 | `Game/src/restraint/KinkyDungeonRestraints.ts`、`KDRestraintUtility.ts`、`KDLocks.ts`、`KDStruggleGroups.ts` | 候选资格、权重、Group/link、替换、诅咒、锁、工具、累积逃脱进度与失败成本。`power` 不能直接当逃脱概率。 |
| 玩家资源、Perk 与训练 | `Game/src/player/KinkyDungeonStats.ts`、`KinkyDungeonPerks.ts`、`KDClasses.ts`、`KDTraining.ts` | stamina/mana/will 等值的单位、上限、恢复、成本与 Buff/难度修正；相关训练对玩法的消费处。 |
| 派系、敌意、声望与任务 | `Game/src/faction/KinkyDungeonFactions.ts`、`KinkyDungeonReputation.ts`、`KinkyDungeonQuest.ts`；`KDHostile` | 实体派系、临时敌意、同盟、声望、地图主派系各自决定什么；同类外观不代表同一关系。 |
| 地图、旅程、楼层与生成 | `Game/src/map/KDJourney.ts`、`KDMapGen.ts`、`KinkyDungeonMapMods.ts`、`KinkyDungeonEditorGen.ts`；`KinkyDungeonCreateMap` | 主派系/MapMod/目标的所有权，过滤和抽签，缓存候选、初始生成/游荡生成、层间迁移。 |
| 出生、掉落与经济 | `Game/src/enemy/KinkyDungeonSpawns.ts`、`KinkyDungeonEnemiesList.ts`；`Game/src/item/KinkyDungeonLoot*.ts`；`Game/src/map/KDShop.ts` | 资格条件与归一化权重、预算/人口上限、物品来源与消耗、商店价格修正、跨层供给。 |
| 物品、变体与附魔 | `Game/src/item/KinkyDungeonInventory.ts`、`KDInventoryActions.ts`、`KDCurse.ts`；`KDGiveInventoryVariant` | 原型、实例、变体数据和缓存的区别，生成→获得→装备→卸下→加载的生命周期。 |
| 模型、姿势与贴图 | `Data/Models.ts`、`Data/ModelTypes.ts`、`Data/Preload.ts`、`Data/ModelList_*.ts` | gameplay restraint 与 Model/Layer 的映射；注册、资源就绪和 redress 时机。美术工具工作遵循工具自己的规则。 |

机制链的收尾是找出真正控制结果的写入点与后续读取点。例如事件注册成功后仍需确认发送者会触发该表；修改定义表后需确认实例和缓存何时采用新值。不要用临时 Console 改值的成功代替 Mod 加载验证。

当问题是算法选择，先确定原生方法能否满足需求，再比较候选的前提、复杂度和玩法影响；原生入口调查由这里完成，深入算法取舍可用现有 `algorithm-research`。图库、DOM、CLI 等第三方 API 问题走工作区的文档查询规则，KD 自身以版本源码为证据。
