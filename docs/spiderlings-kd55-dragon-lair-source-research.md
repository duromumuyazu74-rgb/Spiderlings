# KD 5.5 原版龙巢额外空间源码调查

> 调查范围：`KinkiestDungeon-5.5/` 本地源码，只读。
>
> 调查目标：追踪普通地图中的龙巢入口从资格抽取、生成和交互，到额外空间创建、零深度切换、返回、缓存和存读档的完整链路，并界定 Spiderlings 可复用的 KD 5.5 结构。
>
> 结论标签：
>
> - **【源码确认】**：由已读函数定义及其相关调用点直接确认。
> - **【合理推断】**：由多个源码条件合并得到，但未启动游戏复现。
> - **【待实机验证】**：源码存在边界行为、顺序依赖或缺少现成测试，需在游戏内确认。

## 结论摘要

1. **【源码确认】龙巢不是 POI、paste tile 或独立的地图修改器入口对象。**普通地图先随机取得 `Dragon` MapMod；该 MapMod 的 `worldGenScript` 生成一只带 `creationScript: "DragonLair"` 的龙，创建脚本再用 `KDAddLair(...)` 在当前世界槽位注册个体化 lair。地图生成末段的 `KDBuildLairs()` 从 `KDMapData.PotentialEntrances` 选择一个 `Cave` 候选并改造成入口。证据：`Game/src/map/KDJourney.ts:53-72`、`Game/src/map/KinkyDungeonMapMods.ts:65-105`、`Game/src/enemy/KDCreationScripts.ts:1-18`、`Game/src/map/KDLairs.ts:90-179`、`Game/src/map/KDMapGen.ts:644-658`。
2. **【源码确认】入口是地图字符 `H`，目标信息存在普通 tile 元数据中。**`KDMakeShortcutStairs(...)` 写入 `tile.RoomType = <个体化 lair ID>`、`ShortcutIndex`、`MapMod = "None"`、`Faction` 和 `EscapeMethod = "None"`，并把坐标登记进 `KDMapData.ShortcutPositions`；它不是 effect tile、地面物品或实体。证据：`Game/src/map/KDLairEntrances.ts:136-177`。
3. **【源码确认】额外空间的真实 room key 不是固定的 `DragonLair`。**`KDAddLair(...)` 用 `KDOutpostID(id, alt, slot)` 生成形如 `<dragonId>_DragonLair,<slot.x>,<slot.y>` 的实例 ID；`KDPersonalAlt[实例 ID].RoomType` 才指向基础 alt type `DragonLair`。`KinkyDungeonAltFloor(...)` 在运行时解引用它。证据：`Game/src/map/KDLairs.ts:107-128,182-184`、`Game/src/map/KinkyDungeonAlt.ts:1237-1240`。
4. **【源码确认】“不额外算层级”的根因是入口 `H` 和返回 `S` 均得到 `AdvanceAmount = 0`。**`KDAdvanceLevel(...)` 因此不会增加 `MiniGameKinkyDungeonLevel`；新位置仍是当前 `y`，Journey 坐标也不前进。楼层进度更新只在 `MiniGameKinkyDungeonLevel > HighestLevelCurrent` 时发生，因此这次切换不会调用 `KDAdvanceOneFloor()`。证据：`Game/src/map/KinkyDungeonTiles.ts:828-864,878-964`、`Game/src/map/KDStairActions.ts:98-168`。
5. **【源码确认】主地图不是重建，而是按世界槽位 + `RoomType` 缓存。**`KinkyDungeonCreateMap(...)` 在切换前用 `KDSaveRoom(...)` 保存当前 `KDMapData`，并在目标已经位于 `location.data[RoomType]` 时调用 `KDLoadMapFromWorld(...)` 深拷贝恢复。主地图敌人、掉落物、入口和打开状态随整份 `KDMapData` 保留；龙巢也以自己的实例 room key 独立保存。证据：`Game/src/map/KDMapGen.ts:99-154,747-786`、`Game/src/base/game/KinkyDungeonGame.ts:685-702,787-855`。
6. **【源码确认】返回协议能落回原入口，而不是只能回主地图起点/终点。**进入 `H` 后，`KDGameData.ShortcutIndex` 保存主图入口索引；从龙巢的 `S` 返回时，目标主地图加载期间 `KDPlacePlayerBasedOnDirection(...)` 优先用尚未被覆盖的该索引查询 `KDMapData.ShortcutPositions`，把玩家放到原 `H` 坐标。证据：`Game/src/map/KDStairActions.ts:217-238`、`Game/src/base/game/KinkyDungeonGame.ts:862-887`。
7. **【源码确认】幂等不是单一“visited”布尔值，而是多层结构共同保证。**`entity.created` 防止同一龙重复跑创建脚本；`slot.lairs[lairid]` 防止同一实例重复注册；`UsedEntrances` 和 `LairsToPlace` 防止已放入口重复排队；目标 room 的缓存避免地图、敌人和奖励重新生成；`KDMapData.data.sigilsSpawned` 防止任务 sigil 重放。证据：`Game/src/dialogue/KinkyDungeonDialogue.ts:600-610`、`Game/src/map/KDLairs.ts:117-179,277-400`、`Game/src/map/Lair/DragonLair.ts:72-95`。
8. **【源码确认】原版也保留了“被龙击败后直接进巢”的第二入口，但它不是普通地图随机入口的生成链。**`dragonLairDefeat` 设置 `KDCustomDefeat = "DragonLair"`，最终调用 `KDEnterDragonLair(...)`；该函数复用 `KDCreateDragonLair(...)` 和同一个实例 room，而非创建第二套深度/地图协议。证据：`Game/src/effect/KinkyDungeonEvents.ts:10884-10904`、`Game/src/prison/KinkyDungeonJail.ts:1380-1439,2199-2205`。

## 一、真实对象模型

### 1. 世界槽位、room 与个体化 lair

- **【源码确认】**`KDWorldSlot` 以 `data: Record<string, KDMapDataType>` 在同一个 `(x,y)` 世界槽位保存多张 room 地图，同时保存 `lairs` 和尚待落入口的 `lairsToPlace`。定义见 `Game/src/base/KDTypeDefs.ts:3007-3022`。
- **【源码确认】**一张地图自己的 `KDMapDataType` 保存 `RoomType`、`MapMod`、`LairsToPlace`、`PotentialEntrances`、`UsedEntrances`、`ShortcutPositions`、地图网格、tile、effect tile、实体、地面物品等。初始化见 `Game/src/base/game/KinkyDungeonGame.ts:185-268`；类型字段见 `Game/src/base/KDTypeDefs.ts:3148-3185`。
- **【源码确认】**`KDLair` 保存：实例 `Name`、基础 `RoomType`、`OwnerNPC`/`OwnerFaction`、各来源 room 的入口类型、反向入口类型、`Hidden`、`UpStairsFrom` 及扩展 `data`。定义见 `Game/src/map/KDLairs.ts:3-18`。
- **【源码确认】**基础 lair type `KDLairTypes.DragonLair` 的默认双向入口都是 `Cave`，且不像 `Jail` 那样 `AlwaysHide`。见 `Game/src/map/KDLairs.ts:21-59`。
- **【源码确认】**实例 ID 由 `KDOutpostID(id + "", alt, slot)` 生成，格式是 `id + "_" + alt + "," + slot.x + "," + slot.y`。见 `Game/src/map/KDLairs.ts:107-109,182-184`。

因此原版至少有三种容易混淆的名称：

| 含义 | 示例 | 保存位置 |
|---|---|---|
| 基础 alt type | `DragonLair` | `alts.DragonLair` |
| 个体化 room key / 入口目标 | `123_DragonLair,0,5` | `KDPersonalAlt`、`slot.data`、tile `RoomType` |
| 普通地图主题修改器 | `Dragon` | `KDMapMods.Dragon`、Journey slot `MapMod` |

### 2. 龙巢 alt type

- **【源码确认】**`alts.DragonLair` 是 20×20 的 `DragonLair` 生成类型，使用 cavern 皮肤/光照/参数，`persist: true`、`keepItems: true`、`spawns: false`、`enemies: false`、`chests: false`、`nostairs: true`、`nojail: true`、`nokeys: true`。见 `Game/src/map/Lair/DragonLair.ts:1-44`。
- **【源码确认】**`KinkyDungeonCreateMapGenType.DragonLair` 调用独立的 `KDMapgenCreateCave(...)`，不是预制 paste tile。见 `Game/src/map/Lair/DragonLair.ts:229-233`。
- **【源码确认】**`KinkyDungeonAltFloor(instanceId)` 先检查 `KDPersonalAlt[instanceId]`，再返回 `alts[personal.RoomType]`，所以实例 ID 可透明复用基础 `DragonLair` alt type。见 `Game/src/map/KinkyDungeonAlt.ts:1237-1240`。

## 二、普通地图如何取得 Dragon MapMod

### 1. 哪些 Journey 地图有抽取资格

- **【源码确认】**普通 `basic` Journey slot 初始化为空 `RoomType`，只有非 Hell floor 才考虑 MapMod；新周目 0 时要求 `y > 1`，NG+ 可提前进入这段，但 `Dragon` 自身仍过滤 `y < 2`。见 `Game/src/map/KDJourney.ts:13-72`。
- **【源码确认】**`shop` 和 `boss` slot 使用各自构造函数，MapMod 固定为空，且标为 `protected`；它们不走 basic slot 的 MapMod 抽取。见 `Game/src/map/KDJourney.ts:113-155`。
- **【源码确认】**Hell floor 是 12 和 16，basic slot 在这些层跳过 MapMod 抽取。见 `Game/src/base/game/KinkyDungeonGame.ts:974-977` 与 `Game/src/map/KDJourney.ts:55-66`。
- **【源码确认】**`KDMapMods.Dragon.filter(slot)` 要求 `slot.y >= 2`，并排除 `KDNoDragonLairCheckpoints`；5.5 当前该列表只有 `lib`。见 `Game/src/map/KinkyDungeonMapMods.ts:65-78`、`Game/src/map/Lair/DragonLair.ts:106`。

综合源码，Dragon MapMod 的正常资格是：basic Journey slot、`y >= 2`、非 12/16 Hell floor、checkpoint 不是 `lib`。这也自然排除了商店和 boss slot。源码没有以“安全房”“教程房”这些产品术语单独判断；它是通过 slot 类型、层数、Hell floor 和 checkpoint 过滤实现的。

### 2. 随机算法不是固定百分比

- **【源码确认】**`KDMapMods.Dragon.weight = 50`。同表中 `None` 权重为 800，其余主题也参与竞争。见 `Game/src/map/KinkyDungeonMapMods.ts:3-218`。
- **【源码确认】**`KDGetMapGenList(3, KDMapMods, slot)` 连续做三次“不放回的按权重抽取”，只纳入 `filter(slot) > 0` 的项；随后 basic slot 从这份三项刷新列表中均匀抽一项并删除，直到列表耗尽。见 `Game/src/map/KinkyDungeonMapMods.ts:227-253`、`Game/src/map/KDJourney.ts:57-65`。
- **【源码确认】**刷新列表初始为 `[KDMapMods.None]`，因此重置后的首个符合 basic 代码路径的 slot 会先消费 `None`，之后才生成新的三项列表。见 `Game/src/map/KDJourney.ts:11,55-65`。
- **【源码确认】**Journey slot 一经生成便把结果保存为 `slot.MapMod`，普通地图生成时读取该既定值，不会每次进图重新抽 MapMod。见 `Game/src/map/KDJourney.ts:36-51,71-82`、`Game/src/map/KDStairActions.ts:156-180,217-220`。

**结论：原版没有一个可直接抄成“龙巢入口率 N%”的常量。**入口概率来自：Journey 生成期的 Dragon MapMod 加权抽取 × 实际地图能否生成龙 × 是否有可放 Cave 入口候选。直接把 `50` 解读为 50% 是错误的。

- **【合理推断】**在相同初始 RNG seed、相同 Journey 生成顺序和相同游戏状态下，MapMod 选择可复现，因为所有选择使用 `KDRandom()`，且结果被存进 JourneyMap；但单独给一张地图相同“地图 seed”并不足以保证 Journey 先前的抽取结果相同。

## 三、龙与 lair 的注册调用链

### 1. 地图生成顺序

普通地图生成关键顺序如下：

1. `KinkyDungeonCreateMap(...)` 建立新的 `KDMapData`，初始化 RNG、网格、tile、实体和 `PotentialEntrances`。见 `Game/src/map/KDMapGen.ts:154-183,202-410`。
2. `KinkyDungeonReplaceDoodads(...)` 在墙体生成裂缝/碎石，并登记 Cave 型 `PotentialEntrances`。见 `Game/src/map/KDMapGen.ts:426-440`、`Game/src/base/game/KinkyDungeonGame.ts:1235-1360`。
3. `KinkyDungeonPlaceStairs(...)` 放主起点 `S`、主出口 `s`，并把它们及已有 shortcut 记为 `SpecialAreas`。见 `Game/src/map/KDMapGen.ts:438-440,1600-1696`。
4. `KDPruneEntrances(...)` 删除周边没有 wanderable 邻格的入口候选。见 `Game/src/map/KDMapGen.ts:573-579,2763-2795`。
5. 普通敌人生成；每个成功创建的敌人都会调用 `KDRunCreationScript(...)`。见 `Game/src/map/KDMapGen.ts:619-635,1381-1425`。
6. 执行 `MapParams.worldGenCode`、alt type `worldGenScript`、MapMod `worldGenScript`。见 `Game/src/map/KDMapGen.ts:644-646`。
7. 调用 `KDBuildLairs()` 把本轮注册的 lair 入口实际放到当前地图。见 `Game/src/map/KDMapGen.ts:657`。
8. 之后发送 `postMapgen`，再启动 escape method 的 worldgen。见 `Game/src/map/KDMapGen.ts:680-711`。

这说明 lair 入口属于**地图生成末段的 lair 构建阶段**，不是 POI 阶段，也不是普通 enemy `postMapgen` 之后的补丁。

### 2. Dragon MapMod 保证尝试创建一个 lair owner

- **【源码确认】**`KDMapMods.Dragon.worldGenScript` 用 `KinkyDungeonGetRandomEnemyPoint(true)` 找敌人点，按当前 `MiniGameKinkyDungeonLevel` 过滤 `KDDragonList`，随机创建对应 dragon，设 faction 与永久 `leader` flag，然后调用 `KDRunCreationScript(...)`。见 `Game/src/map/KinkyDungeonMapMods.ts:88-104`。
- **【源码确认】**`KDDragonList` 在低层提供 `DragonGirl*`，较高层加入 `DragonQueen*`，选择条件由各项 `minfloor`/`maxfloor` 控制。见 `Game/src/map/Lair/DragonLair.ts:108-226`。
- **【源码确认】**八种 `DragonGirl*`/`DragonQueen*` 定义均有 `creationScript: "DragonLair"`；例如 Poison 在 `Game/src/enemy/KinkyDungeonEnemiesList.ts:3499-3513,3515-3557`，Crystal 在 `:3624-3671`，Shadow 在 `:3740-3793`，Ice 在 `:3862-3919`。
- **【源码确认】**`KDRunCreationScript(...)` 仅在 `!entity.created` 时调用对应脚本，成功后写 `entity.created = true`。见 `Game/src/dialogue/KinkyDungeonDialogue.ts:600-604`。
- **【源码确认】**`KDCreationScripts.DragonLair` 把 dragon 变为 persistent NPC、设置 wander AI 和 `special`，找到其世界槽位，调用 `KDCreateDragonLair(...)`，成功后把 `entity.homeCoord.room` 改为 lair 实例 ID。见 `Game/src/enemy/KDCreationScripts.ts:1-18`。
- **【源码确认】**`KDCreateDragonLair(...)` 选择来源主 room，调用 `KDAddLair(slot, main, "DragonLair", dragon.id, false, "Cave", ...)`，要求 Cave 入口且非隐藏。见 `Game/src/prison/KinkyDungeonJail.ts:1303-1317`。

普通敌人生成阶段若额外生成了其他带同一 creation script 的 dragon，也会为各自 ID 注册 lair；因此原版数据模型允许一张世界槽位存在多个龙巢，不是硬编码“一图最多一个”。

- **【合理推断】**Dragon MapMod 的 worldGenScript 通常至少提供一个 owner，但并非绝对保证：随机敌人点找不到、dragon 定义选择失败或实体创建失败都会提前返回；源码没有在失败后重试或降级放置入口。

### 3. `KDAddLair` 如何处理“当前地图还没入缓存”

- **【源码确认】**新 lair 先写 `slot.lairs[lairid] = room` 和 `KDPersonalAlt[lairid]`，设置 OwnerNPC、基础 RoomType、入口类型、Hidden、UpStairsFrom。见 `Game/src/map/KDLairs.ts:107-128`。
- **【源码确认】**若来源 room 已存在于 `slot.data`，lair ID 进入该地图的 `LairsToPlace`；若尚不存在，则进入世界槽位的 `slot.lairsToPlace[room]`。当前生成中的新地图尚未在 `location.data` 登记，因此走后者。见 `Game/src/map/KDLairs.ts:138-159`；当前新图直到生成尾部才写入缓存，见 `Game/src/map/KDMapGen.ts:747`。
- **【源码确认】**`KDDoLairOutpostConnections(...)` 同时登记正反向连接，并在加入前检查 `slot.lairsToPlace`、目标地图 `LairsToPlace` 和 `UsedEntrances`，避免同一连接重复排队。见 `Game/src/map/KDLairs.ts:277-341`。
- **【源码确认】**随后地图生成末段的 `KDBuildLairs()` 把 `slot.lairsToPlace[currentRoom]` 转移到当前 `KDMapData.LairsToPlace` 并尝试落点。见 `Game/src/map/KDLairs.ts:344-400`。

## 四、入口候选、合法位置与关键内容保护

### 1. Cave 候选从哪里来

- **【源码确认】**普通地图的 Cave 候选主要由 `KinkyDungeonReplaceDoodads(...)` 生成：墙体按 `MapParams.crackchance` 形成裂缝分支；只有初始墙附近能触达 `RandomPathablePoints`，且最终点不靠地图边界，才加入 `PotentialEntrances`。候选保存 `Excavate` 路径、`PlaceScript: "Cave"`、`Type: "Cave"` 和最终坐标。见 `Game/src/base/game/KinkyDungeonGame.ts:1278-1341`。
- **【源码确认】**`wallRubblechance` 路径也可产生单格 Cave 候选，要求邻近地面且属于可达点。见 `Game/src/base/game/KinkyDungeonGame.ts:1343-1357`。
- **【源码确认】**DragonLair 自己的洞穴生成器会为额外分支生成 Cave 候选，以支持 lair 与其他房间继续连接；第一条分支用于固定 `StartPosition`，其余才是候选。见 `Game/src/map/Lair/DragonLair.ts:265-339`。

这不是 `POI`。候选类型是专门的 `LairEntrance`：`Type`、坐标、待挖格、place script 和可选 priority。见 `Game/src/map/KDLairEntrances.ts:4-11`。

### 2. 可达性和关键区域保护（关键区只是强降权，不是硬拒绝）

- **【源码确认】**`KDPruneEntrances(...)` 检查候选点及所有待挖格，只要其中至少一格的上下左右存在可 wander 且无 `nomapgen` effect tag 的格子才保留候选。见 `Game/src/map/KDMapGen.ts:2763-2795`。
- **【源码确认】**主起点与主出口分别登记 `radius: 2` 的 `SpecialAreas`；普通 side-room shortcut 和 setpiece 也登记特殊区。见 `Game/src/map/KDMapGen.ts:1600-1608,1663-1696`、`Game/src/map/KinkyDungeonSetpiece.ts:779-782`。
- **【源码确认】**`KDLairEntranceFilterScript.Cave` 通过 `KinkyDungeonGetClosestSpecialAreaDist(...)` 检查距已有 special area 的距离。距离小于 3 时返回 `-1000`，否则返回 `1`；这只是强降权，不是 hard reject。距离本身是候选 Chebyshev 距离减该区域 radius。见 `Game/src/map/KDLairEntrances.ts:115-123`、`Game/src/map/KDMapGen.ts:1490-1499`。
- **【源码确认】**`KDFindEntrance(...)` 只看与来源 room 所需入口类型匹配的候选；计算 candidate priority + filter score，取最高分组后用 `KDRandom()` 随机选一个。它没有“score < 0 则丢弃”的条件，所以如果所有 Cave 候选都在关键区附近，`-1000` 候选仍会成为最高分并被选择。见 `Game/src/map/KDLairs.ts:402-425`。
- **【源码确认】**成功放置后，该入口坐标从 `PotentialEntrances` 移除，并写入 `UsedEntrances[lairName]`，所以同一候选不能被第二个 lair 复用。见 `Game/src/map/KDLairs.ts:376-385`。
- **【源码确认】**`KDLairEntrancePlaceScript.Cave` 只把仍为地面/裂墙且无 tile `Type` 的待挖格改为 `r` 并加 `RubbleNoMend`，然后重建 nav map；最终落点仍需是允许的地面/裂墙字符且没有 tile `Type`。见 `Game/src/map/KDLairEntrances.ts:54-76,19-34`。

关于“不会堵主路线”的准确表述：

- **【源码确认】**普通地图生成的 `KDCheckMainPath()` 会验证起点到主出口、前两个 shortcut、任务 shrine 的路径，但该通过条件在 `KDBuildLairs()` 之前执行。见 `Game/src/map/KDMapGen.ts:608-617,657`、`:2725-2761`。
- **【源码确认】**lair 放置只挖开墙并把终点变成可交互 `H`，不会新建墙；只要存在至少一个非关键区候选，`1` 分会压过关键区附近的 `-1000` 分，使入口优先远离起点、出口、setpiece 和已登记 shortcut。但所有候选都被降权时，源码仍会选择其中一个。因此原版采用“只开路 + 关键区强降权”，没有硬性保证入口永不落在关键区，也没有在入口落点后重跑主路径验证。
- **【合理推断】**这足以防止入口本身阻断路线，但它不是 Spiderlings 所需“入口 + 四只实体原子放置”的现成保证。原版入口算法不检查周围四个互异敌人位，也不提供事务回滚。
- **【源码确认】**若 Cave place script 先挖了若干格，最终点检查又失败，函数会返回 `false`，但源码没有恢复已挖格；`KDBuildLairs()` 只把 lair 留在 `LairsToPlace` 以后重试。见 `Game/src/map/KDLairEntrances.ts:54-76`、`Game/src/map/KDLairs.ts:376-399`。

## 五、入口表示与玩家交互

### 1. 写入内容

`KDMakeShortcutStairs(...)` 的确切动作如下：

- 把地图字符设为 `H`；
- 找到当前地图所属 `KDWorldSlot` 和 Journey slot；
- 把目标实例 room 加入 `journeySlot.SideRooms`，按需要维护 HiddenRooms；
- 建立 `tile.ShortcutIndex`，把入口坐标登记到 `data.ShortcutPositions[index]`；
- 写 `tile.MapMod = "None"`、owner faction、`EscapeMethod = "None"`、`tile.RoomType = lair.Name`；
- 清除入口半径 0.5 的 effect tiles。

全部见 `Game/src/map/KDLairEntrances.ts:136-177`。

因此入口是：

- 地图字符：`H`；
- 元数据：普通 `KDMapData.Tiles[x,y]`；
- 目标：个体化 `RoomType`；
- 返回定位 token：`ShortcutIndex` + 来源地图 `ShortcutPositions`；
- 不是：POI、effect tile、ground item、NPC 或专用入口实体。

### 2. 交互触发

- **【源码确认】**玩家移动/等待在 `H` 上时，`KinkyDungeonHandleMoveToTile(...)` 与普通 `s/S` 一样进入楼梯确认流程；确认后调用 `KinkyDungeonHandleStairs(...)`，最终进入 `KDGoThruTile(...)`。见 `Game/src/map/KinkyDungeonTiles.ts:109-126`、`Game/src/map/KDStairActions.ts:276-293`。
- **【源码确认】**`KDGoThruTile(...)` 若字符不在 `KDAdvanceAmount` 中会降级为 `H`，但原版明确注册了 `H`，其 `AdvanceAmount` 固定为 0。见 `Game/src/map/KDStairActions.ts:29-43`、`Game/src/map/KinkyDungeonTiles.ts:950-964`。
- **【源码确认】**目标 `tile.RoomType` 被解析为实例 room ID；`KDGameData.RoomType` 变为该 ID，`MapMod` 清空，随后 `KinkyDungeonCreateMap(...)` 创建或载入目标 room。见 `Game/src/map/KDStairActions.ts:149-202,217-232`。

## 六、DragonLair 空间如何生成内容

### 1. 地图结构与入口/出口

- **【源码确认】**`KDMapgenCreateCave(...)` 把画布扩成约两倍大小，生成中央洞室和多条向外隧道；第一条隧道末端同时作为 `StartPosition` 和 `EndPosition`。见 `Game/src/map/Lair/DragonLair.ts:233-263,265-323`。
- **【源码确认】**生成器把 `StartPosition` 设为 `S`。之后通用 `KinkyDungeonPlaceStairs(...)` 因 `nostairs: true` 不放正常向下出口 `s`，但 `nostartstairs` 没有开启，所以仍保留 `S` 返回梯，并在其 tile 上写 `origMapType`/`UpStairsFrom`。见 `Game/src/map/Lair/DragonLair.ts:345`、`Game/src/map/KDMapGen.ts:438-440,1600-1608`。
- **【源码确认】**`KDPersonalAlt[lairId].UpStairsFrom` 在注册时保存来源主 room；因此 lair 内的 `S` 明确指回来源 room。见 `Game/src/map/KDLairs.ts:119-128`。

### 2. 敌人、owner 与环境

- **【源码确认】**DragonLair alt type 禁止普通 spawn 和普通 enemy placement，因此洞穴生成器本身不生成常规敌人。见 `Game/src/map/Lair/DragonLair.ts:19-31`、`Game/src/map/KDMapGen.ts:619-635`。
- **【源码确认】**lair owner 已在创建脚本中被做成 persistent NPC，且 `homeCoord.room` 指向 lair；进入新 room 后通用 `KDSpawnPersistentNPCs(...)` / `KDRepopulatePersistentNPCs()` 会按当前 room 恢复持久 NPC。调用点见 `Game/src/map/KDMapGen.ts:761-771`；owner 的建立见 `Game/src/enemy/KDCreationScripts.ts:2-17`。
- **【源码确认】**`beforeWorldGenScript` 根据 owner 的真实 enemy type 选择 `KDDragonList` 定义，并在合适位置放 furniture/jail points；`KDGetDragonType()` 通过 `KDPersonalAlt[currentRoom].OwnerNPC` 找 persistent NPC。见 `Game/src/map/Lair/DragonLair.ts:46-70,417-464`。
- **【合理推断】**龙巢预期的主要敌对角色是该 persistent owner，而不是“独立房间生成器固定刷一组敌人”。其他 roaming persistent NPC 是否同时进入，取决于通用持久 NPC 系统状态。

### 3. 奖励与目标

- **【源码确认】**首次生成会循环 10 次，从 Dragon curse/hex/enchant 与一组 restraint tags 中生成带诅咒/锁/附魔的物品，并直接放进 `KDMapData.GroundItems`。见 `Game/src/map/Lair/DragonLair.ts:351-412`。
- **【源码确认】**`keepItems: true` 使离开 DragonLair 时所有地面物品都进入持久项集合，而不是仅保存标记为 persistent 的种类。见 `Game/src/map/Lair/DragonLair.ts:43-44`、`Game/src/map/KDMapGen.ts:57-77`。
- **【源码确认】**`loadscript(firsttime)` 使用 room-local `KDMapData.data.sigilsSpawned`；首次进入时按 `KDGameData.SealErasedQuota` 放 `SealSigil` effect tile，并设置 `DragonTarget`，之后无论加载多少次都把/保持 `sigilsSpawned = true`。见 `Game/src/map/Lair/DragonLair.ts:72-95`。
- **【源码确认】**`SealSigil` MapMod escape method 在主地图 worldgen 时计算 quota、重置 `SigilsErased`，从当前槽位 lair 找龙 owner 并设为目标；玩家踩 sigil 会移除它并增加 `SigilsErased`。见 `Game/src/map/KinkyDungeonEscapeList.ts:477-531`、`Game/src/map/KinkyDungeonTilesList.ts:849-864`。
- **【源码确认】**当前层的正常出口检查通过条件是：已捕获/击败目标龙、目标在 Collection，或擦除足够 sigil。见 `Game/src/map/KinkyDungeonEscapeList.ts:479-483`。这说明 DragonLair 不是替换主出口，而是其内部目标可以解除当前普通地图出口的 `SealSigil` 条件。

## 七、为什么它不推进普通层级

### 1. 保持不变的字段

入口 `H` 与返回 `S` 的实际数据流是：

```text
主图 H (tile.RoomType = lairInstanceId)
  -> KDAdvanceAmount['H'] = 0
  -> KDAdvanceLevel: MiniGameKinkyDungeonLevel += 0
  -> newLocation = {x: 0, y: currentWorldSlot.y + 0}
  -> KDGameData.RoomType = lairInstanceId
  -> 同一 KDWorldSlot 的另一条 data[RoomType]

龙巢 S (tile.RoomType = sourceMainRoom)
  -> KDAdvanceAmount['S'] 通常 = 0
  -> KDAdvanceLevel: 深度仍不变
  -> KDGameData.RoomType = sourceMainRoom
  -> 从同一 KDWorldSlot 恢复主图缓存
```

- **【源码确认】**`MiniGameKinkyDungeonLevel` 不变，因为两向 `AdvanceAmount` 都是 0。`S` 默认 0，只有目标 `altRoomNext.skiptunnel` 时才可能 -1；DragonLair 返回普通主图不满足。见 `Game/src/map/KinkyDungeonTiles.ts:878-892,950-964`。
- **【源码确认】**`KDCurrentWorldSlot.y` 不变；`KDAdvanceLevel()` 返回的目标 y 是当前槽 y + 0。见 `Game/src/map/KinkyDungeonTiles.ts:828-864`。
- **【源码确认】**`KDGameData.JourneyY` 最终仍是同一 level，`JourneyX` 从同一层 world slot 恢复；没有选择新 JourneyTarget。见 `Game/src/map/KinkyDungeonTiles.ts:831-847`。
- **【源码确认】**`HighestLevelCurrent` 和 `HighestLevel` 只取 max，且进入 side room 后 level 没变；`KDAdvanceOneFloor()` 仅在 level 超过旧最高层且未 override progression 时调用，所以不会执行。见 `Game/src/map/KDStairActions.ts:127-169`。
- **【源码确认】**世界槽位没有新增正常深度节点；主图和 lair 共用相同 `(mapX,mapY)`，只更换 `RoomType`。`KDGetCurrentLocation()` 的三个字段也直接表达这一点。见 `Game/src/enemy/KDPersistence.ts:93-97,614-619`。
- **【源码确认】**难度查询 `KDGetEffLevel()` 以 `MiniGameKinkyDungeonLevel` 为基础；lair 生成调用也把同一个 level 作为 `Floor` 传给 `KinkyDungeonCreateMap(...)`。见 `Game/src/base/game/KinkyDungeonGame.ts:979-983`、`Game/src/map/KDStairActions.ts:217-220`。

### 2. 会变化的字段

- **【源码确认】**`KDGameData.RoomType` 在主图的 `""`（通常）与个体化 lair ID 之间切换；`KDMapData` 也切换为对应 room 的完整地图对象。见 `Game/src/map/KDStairActions.ts:193-220`、`Game/src/base/game/KinkyDungeonGame.ts:806-818`。
- **【源码确认】**通过普通 `H` 入口进入 lair 时，入口 tile 明确提供 `MapMod = "None"`，所以当前 MapMod 暂时变为 `None`。NPC-owned lair 只设置 `OwnerNPC` 而不设置 `OwnerFaction`，普通入口的 `tile.Faction` 因而通常为空，并不自动强制 owner faction；捕获直达函数才显式传 `KDGetFaction(dragon) || "DragonQueen"`。从 lair 的 `S` 返回主图时，缓存载入会恢复主图原有的 `KDMapData.MapMod`（通常是 `Dragon`）。见 `Game/src/map/KDLairs.ts:119-127`、`Game/src/map/KDLairEntrances.ts:141-173`、`Game/src/map/KDStairActions.ts:149-180,217-220`、`Game/src/base/game/KinkyDungeonGame.ts:814-818`、`Game/src/prison/KinkyDungeonJail.ts:1400-1405`。
- **【源码确认】**新建 lair 会重新初始化地图 RNG；`KDInitTempValues(seed)` 在 `seed` 未传时调用 `KDrandomizeSeed(true)` 并记录 `LastMapSeed`。所以 lair 有自己的新地图随机序列，不是继续复用主图生成时的随机游标。见 `Game/src/map/KDMapGen.ts:167-170`、`Game/src/base/game/KinkyDungeonGame.ts:905-945`。
- **【源码确认】**每次成功过楼梯都会把 `KDGameData.HeartTaken = false`，并执行通用 `AfterAdvance`、自动存档等副作用，即使深度为 0 增量。见 `Game/src/map/KDStairActions.ts:211-242`。

因此“不推进层级”不等于“所有全局状态完全静止”；它准确表示正常深度、Journey 位置、世界 y、最高层和逐层进度不前进，而当前 room、当前地图对象、MapMod、入口索引和部分通用过梯状态会变化。

## 八、返回原地图和返回坐标

### 1. 原地图缓存/恢复

- **【源码确认】**进入尚未生成的 lair 时，`KinkyDungeonCreateMap(...)` 先调用 `KDSaveRoom(KDCurrentWorldSlot, ...)`；该函数压缩敌人、深拷贝整个 `KDMapData`，并保存到 `CurrentLocation.data[CurrentMapData.RoomType]`。见 `Game/src/map/KDMapGen.ts:147-167`、`Game/src/base/game/KinkyDungeonGame.ts:685-702`。
- **【源码确认】**返回时，目标主 room 已在 `location.data[room]`，所以 `KinkyDungeonCreateMap(..., useExisting = true)` 走 `KDLoadMapFromWorld(...)`，不会重跑 mapgen。见 `Game/src/map/KDMapGen.ts:113-145`。
- **【源码确认】**`KDLoadMapFromWorld(...)` 在切换前保存当前 lair，再深拷贝目标主图，恢复 `RoomType`、`MapMod`、checkpoint、实体、nav map、world slot，并调用 `KDBuildLairs()` 处理仍未落的连接。见 `Game/src/base/game/KinkyDungeonGame.ts:787-855`。

### 2. 精确回到原 `H`

精确返回依赖一个跨两次楼梯调用的顺序：

1. **【源码确认】**主图入口创建时把坐标写到 `ShortcutPositions[tile.ShortcutIndex]`。见 `Game/src/map/KDLairEntrances.ts:156-165`。
2. **【源码确认】**玩家进入 `H` 后，目标 lair 创建/加载完成，`KDGoThruTile(...)` 才把当前入口的 `data.ShortcutIndex` 写到全局 `KDGameData.ShortcutIndex`。见 `Game/src/map/KDStairActions.ts:217-238`。
3. **【源码确认】**玩家从 lair 的 `S` 返回时，主图 `KDLoadMapFromWorld(...)` 在全局索引被下一步覆盖之前调用 `KDPlacePlayerBasedOnDirection(direction, KDGameData.ShortcutIndex)`。见 `Game/src/base/game/KinkyDungeonGame.ts:829-832`。
4. **【源码确认】**`KDPlacePlayerBasedOnDirection(...)` 优先用该索引查主图 `ShortcutPositions`；找到便把玩家放在入口坐标，不走 direction 1 的 `EndPosition` fallback。见 `Game/src/base/game/KinkyDungeonGame.ts:862-887`。

- **【合理推断】**原版落点是原 `H` 格本身，不是旁边格；函数会在玩家脚下有敌人时尝试把敌人踢到附近合法格。见 `Game/src/base/game/KinkyDungeonGame.ts:889-901`。
- **【待实机验证】**若跨存档保留的 `KDGameData.ShortcutIndex` 异常、入口索引类型由旧存档数组迁移为对象，或主图入口坐标后来不可用，实际 fallback 是否始终安全需要实机覆盖。源码包含旧存档 `ShortcutPositions` 数组转对象迁移，见 `Game/src/map/KDLairEntrances.ts:157-164`。

### 3. 可否重复进入

- **【源码确认】**返回不会删除主图 `H` 或它的 tile metadata；`KDExploreStairs(...)` 只在 `ExpStair` 标记入口已探索。见 `Game/src/map/KDStairActions.ts:36`、`Game/src/base/game/KinkyDungeonGame.ts:173-179`。
- **【源码确认】**后续进入同一实例 room 时 `useExisting` 为 true（DragonLair 没有 `alwaysRegen`），因此载入原缓存；入口可重复使用，但内容不重置。见 `Game/src/map/KDStairActions.ts:217-226,252-259`、`Game/src/map/KDMapGen.ts:113-145`。

## 九、存档、重返与幂等

### 1. 存读档覆盖哪些状态

- **【源码确认】**存档包含 `KDGameData`、当前 `KDMapData`、完整 `KDWorldMap`、`KDCurrentWorldSlot`、玩家实体、JSON 化的 `KDPersonalAlt` 和 persistent NPC 数据。见 `Game/src/base/KinkyDungeon.ts:6857-6869`。
- **【源码确认】**读档先恢复 `KDWorldMap`，按 `KDCurrentWorldSlot + KDGameData.RoomType` 找当前 room，再用单独保存的 `KDMapData` 覆盖/补齐；随后恢复 `KDPersonalAlt` 和 persistent NPC，解包当前 room 敌人。见 `Game/src/base/KinkyDungeon.ts:7146-7195`。
- **【源码确认】**save metadata 的 `level` 来自 `MiniGameKinkyDungeonLevel`；在 lair 内保存仍显示/恢复同一正常层级，而当前 room 由 `KDGameData.RoomType` 区分。见 `Game/src/base/KinkyDungeon.ts:6826-6843,6963-6970`。

据此三种存档点表现为：

| 存档点 | 【源码确认】恢复结果 |
|---|---|
| 主图、尚未进入 lair | 主图 `KDMapData`、`H`/待放连接、world slot 的 lair 注册和 `KDPersonalAlt` 都保存；首次进入时才生成/载入实例 room。 |
| lair 内部 | `KDGameData.RoomType` 指向实例 ID；当前 lair 地图和已缓存主图同时在存档，读档直接回 lair 当前坐标。 |
| 返回主图后 | 当前 room 恢复为主图；lair 仍在同一 slot 的 `data[lairId]`，后续重复进入加载旧状态。 |

### 2. 各层幂等键

- **【源码确认】同一实体创建脚本**：`entity.created`。见 `Game/src/dialogue/KinkyDungeonDialogue.ts:600-604`。
- **【源码确认】同一 lair 实例注册**：`slot.lairs[lairid] == undefined`；实例 ID 包含 owner ID、类型和世界坐标。见 `Game/src/map/KDLairs.ts:107-128`。
- **【源码确认】同一 room 连接排队**：`slot.lairsToPlace`、room `LairsToPlace`、room `UsedEntrances` 的 includes/key 检查。见 `Game/src/map/KDLairs.ts:277-335`。
- **【源码确认】已落入口**：成功后写 `UsedEntrances[lairName]`，移除候选，并从 `LairsToPlace` 消费。见 `Game/src/map/KDLairs.ts:370-399`。
- **【源码确认】room 内容**：`location.data[RoomType]` 存在时直接 load，不重新生成。见 `Game/src/map/KDMapGen.ts:113-145`。
- **【源码确认】sigil 目标**：room-local `KDMapData.data.sigilsSpawned`。见 `Game/src/map/Lair/DragonLair.ts:72-95`。
- **【源码确认】奖励、敌人死亡与掉落**：都属于缓存的 `KDMapData`（`GroundItems`、`Entities`、`EffectTiles` 等）；room 载入是缓存恢复，不是重跑生成器。见 `Game/src/base/KDTypeDefs.ts:3148-3185`、`Game/src/base/game/KinkyDungeonGame.ts:787-855`。

**【源码确认】原版没有一个通用的 `lairVisited` / `lairCompleted` 布尔字段。**“已访问”由 Journey `HiddenRooms` 被揭示、实例 room 是否已存在于 `slot.data`、入口探索 `ExpStair` 等状态间接表达；“本次目标已生成/已完成”由 room-local `sigilsSpawned`、已移除的 sigil effect tiles、全局 `SigilsErased`/`DragonCaptured`/`DragonTarget` 和 persistent owner 状态共同表达。相关写入见 `Game/src/map/KDLairEntrances.ts:145-155`、`Game/src/map/KDMapGen.ts:110-114,604,747`、`Game/src/base/game/KinkyDungeonGame.ts:173-179`、`Game/src/map/Lair/DragonLair.ts:72-95`、`Game/src/map/KinkyDungeonEscapeList.ts:477-531`。

### 3. 已知非终态/边界

- **【源码确认】**入口找不到或 place script 失败时，lair ID 保留在 `KDMapData.LairsToPlace`，`KDBuildLairs()` 以后加载时还会重试；它不是“本图判定一次后永久跳过”。见 `Game/src/map/KDLairs.ts:365-399`。
- **【源码确认】**如果 forced regeneration 使用 `useExisting = false`，MapMod worldGen 可能创建新 dragon ID，从而得到新 lair ID；原版通常通过 room cache 避免这条路径，而非按“地图 seed 已抽取”布尔值阻止。见 `Game/src/map/KDMapGen.ts:113-167`、`Game/src/map/KinkyDungeonMapMods.ts:88-104`。
- **【源码确认】**`sigilsSpawned` 即便没找到 owner 也会在 loadscript 尾部设 true，因此异常存档若缺 owner，不会在下一次加载自动补生成 sigil。见 `Game/src/map/Lair/DragonLair.ts:74-95`。
- **【待实机验证】**在入口 place script 已部分挖掘后失败、保存、重载并重试时，地图视觉和候选可用性如何演化；源码无事务恢复。

## 十、捕获/击败直达路线与随机入口的关系

- **【源码确认】**dragon 的 `beforeDamage` 事件在玩家受击且这次没加上新拘束时运行 `KDTripleBuffKill(...)`；不在 DragonLair 时设置 `AIData.defeat`、`KDCustomDefeat = "DragonLair"` 和 enemy。见 `Game/src/effect/KinkyDungeonEvents.ts:10884-10904`。
- **【源码确认】**自定义 defeat 最终查 `KDCustomDefeats[CD]`；`DragonLair` handler 调用 `KDEnterDragonLair(...)`。见 `Game/src/enemy/KinkyDungeonEnemies.ts:4975-4979`、`Game/src/prison/KinkyDungeonJail.ts:2199-2205`。
- **【源码确认】**`KDEnterDragonLair(...)` 仍先调用 `KDCreateDragonLair(...)` 获取相同实例 room，然后用同一层的 `MiniGameKinkyDungeonLevel` 直接 `KinkyDungeonCreateMap(...)`；之后只是额外处理 defeat、家具拘束、清钥匙、仇恨与存档。见 `Game/src/prison/KinkyDungeonJail.ts:1380-1439`。

这条路线证明原版会让“探索入口”和“被捕获直达”共享 lair 注册、实例 ID、room cache 和层级字段；它不证明捕获路线应当成为 Spiderlings MVP 主入口。

## 十一、Spiderlings 可复用边界

### 1. 可按唯一命名扩展的结构

以下是 KD 5.5 源码中可组合的注册表/函数，不表示稳定的跨版本正式 API：

| 目的 | 5.5 结构 | 建议用法 |
|---|---|---|
| 基础额外 room | `alts` | 追加 Spiderlings 唯一 key，不覆盖 `DragonLair` |
| room 生成器 | `KinkyDungeonCreateMapGenType` | 追加唯一 `genType` |
| 个体化 room 解析 | `KDPersonalAlt` + `KinkyDungeonAltFloor` | 优先复用 `KDAddLair` 创建实例，不手造另一套 room stack |
| lair 类型默认入口 | `KDLairTypes` | 若运行时可访问，追加唯一类型及双向 entrance；不要修改原 key |
| lair 入口筛选/放置 | `KDLairEntranceFilterScript`、`KDLairEntrancePlaceScript`、`KDLairTypePlaceScript` | 用唯一 key 扩展；Spiderlings 的原子入口+守卫应自建 place script，不可直接把原版 `Cave` 当事务 |
| lair 注册和落点 | `KDAddLair`、`KDBuildLairs` | 调用现成函数；不要替换其定义 |
| 普通地图时机 | `KDEventMapGeneric.postMapgen` 等事件表 | 用唯一 event ID 注册入口决策协调器；注意原版 `KDBuildLairs` 在 `postMapgen` 前已运行 |
| 进入/返回 | `H` tile + `RoomType` + `ShortcutIndex` + `KinkyDungeonCreateMap` | 尽量走原版 `KDGoThruTile`，不要自写深度增减或地图栈 |

基础证据：`Game/src/map/KinkyDungeonAlt.ts:338,1237-1252`、`Game/src/map/KDLairs.ts:19-61,90-179,344-457`、`Game/src/map/KDLairEntrances.ts:13-177`。

### 2. 原版 Cave 入口不能直接满足 Spiderlings 原子守卫合同

- **【源码确认】**原版 `Cave` filter 只把 special-area 附近候选强降权；既不硬拒绝，也不预留四个敌人位置。见 `Game/src/map/KDLairEntrances.ts:115-123`、`Game/src/map/KDLairs.ts:402-425`。
- **【源码确认】**原版 place script 先修改地图再验证最终点，失败无回滚。见 `Game/src/map/KDLairEntrances.ts:54-76`。
- **【源码确认】**`KDBuildLairs()` 一次处理每个 lair，但事务边界只覆盖“入口 place script 返回布尔值”；敌人不属于该返回值。见 `Game/src/map/KDLairs.ts:344-400,452-457`。

**【合理推断】**Spiderlings 若要求“入口和 Jumper/WebCaster/Tunneler/Spinner 四只守卫全有或全无”，应让自有 place script 在任何写入前完成：入口候选筛选、四个互异合法点、连通/不堵入口检查和实体创建可用性计划；提交阶段若实体创建可能失败，还需显式撤销已经创建的本模组实体与入口写入。不能把守卫留给稍后的独立 `postMapgen` 事件再声称原子。

### 3. 应避免覆写的全局入口

**【合理推断】**以下函数是多系统共用的核心流，直接 monkeypatch 容易和其他 Mod 或 5.5 小版本冲突：

- `KinkyDungeonCreateMap(...)`；
- `KDGoThruTile(...)` / `KinkyDungeonHandleStairs(...)`；
- `KDAdvanceLevel(...)` / `KDAdvanceAmount.H/S`；
- `KDBuildLairs(...)` / `KDPlaceLairEntrance(...)`；
- `KDLoadMapFromWorld(...)` / `KDSaveRoom(...)`；
- 原版 `KDMapMods.Dragon`、`KDLairTypes.DragonLair` 或 `alts.DragonLair` key。

应采用唯一命名的表项、事件处理器和 room ID，并让核心流自然消费它们。

### 4. 5.4/5.5 兼容风险

- **【源码确认】**5.5 当前实现依赖 `KDWorldSlot.lairs/lairsToPlace`、`KDMapData.LairsToPlace/PotentialEntrances/UsedEntrances`、`KDPersonalAlt`、`KDLairEntrances` 三组脚本表及 `ShortcutPositions` 对象。这些都是源码级全局结构，不是版本化插件接口。字段定义见 `Game/src/base/KDTypeDefs.ts:3007-3022,3148-3168`。
- **【源码确认】**`KDMakeShortcutStairs(...)` 内含旧存档 `ShortcutPositions` 数组转对象的兼容分支，说明 5.5 的入口索引形态已发生过迁移。见 `Game/src/map/KDLairEntrances.ts:156-165`。
- **【合理推断】**若要同时支持 5.4/5.5，不能只检测 `alts`/`KinkyDungeonCreateMapGenType`；还需启动时 feature-detect `KDAddLair`、`KDLairTypes`、`KDPersonalAlt`、`KDMapData.UsedEntrances`、`KDMakeShortcutStairs` 及 `ShortcutPositions` 形态。缺关键结构时应禁用入口功能并报告兼容错误，而不是覆写楼梯核心。
- **【待实机验证】**当前仓库只有 KD 5.5 参考包，本调查没有 5.4 同源树可作符号级 diff；5.4 是否已有相同 lair 实例协议、函数签名是否一致必须用真实 5.4 包验证。
- **【源码确认】**`KDCreateWorldLocation(..., _main)` 的 `_main` 参数当前没有写入，函数把 `main` 固定设为空字符串。见 `Game/src/base/game/KinkyDungeonGame.ts:664-677`。实现者不应假设传 `main` 参数一定生效；普通主图依赖空 `RoomType` 恰好工作，但非空主 room 需要专项验证。

## 十二、对 Spiderlings 新 MVP 的直接设计含义

这些不是原版事实，而是由已确认机制推出的实现约束：

1. **【合理推断】**复用同层协议时，Nest Depth 应拥有稳定且唯一的实例 `RoomType`，挂在当前 `KDWorldSlot.data` 下；进入和返回分别使用 `H`/`S` 的零 AdvanceAmount 流程。
2. **【合理推断】**“每张地图最多一个入口、只抽一次”不能照抄原版。原版允许多个 owner lair，且失败连接会留队重试；Spiderlings 必须另有 room-local 终态，例如 `notEligible` / `rolledOut` / `placed` / `placementFailed`，并随 `KDMapData.data` 存档。
3. **【合理推断】**入口随机应使用 `KDRandom()`，并在初次合格 mapgen 的单一确定时机消费一次；结果随主图 `KDMapData.data` 持久化。不要把原版 `Dragon.weight = 50` 当成可复制概率。
4. **【合理推断】**入口和四守卫需要一个先规划后提交的自有事务；原版 lair filter、place script 和 `KDBuildLairs` 本身没有多实体事务能力。
5. **【合理推断】**主图已有固定 `spiderlingsSquad` 时，入口守卫和保底小队必须共享同一个 room-local 终态，但使用不同 provenance；否则两个独立 `postMapgen` handler 的事件顺序会生成两队。
6. **【合理推断】**Nest 内部访问/完成/奖励应存进该实例 room 的 `KDMapData.data`，并依赖 room cache 保留实体、掉落与目标；不要仅用短期 `KinkyDungeonFlags`。
7. **【合理推断】**返回点若产品要求“原入口旁安全格”而非原版的“原 `H` 格”，应在恢复主图后从 `ShortcutPositions[ShortcutIndex]` 周边找合法格，同时保留原格 fallback；这是对原版协议的局部扩展，不需要新地图栈。

## 十三、仍需实机验证的清单

1. **【待实机验证】**Dragon MapMod 普通地图实际生成时，MapMod worldGen 创建的 owner 是否在所有合格 tileset 都能获得 `KinkyDungeonGetRandomEnemyPoint(true)`；无点时界面如何表现。
2. **【待实机验证】**没有任何 Cave `PotentialEntrances` 时，dragon/lair 已注册但入口留在 `LairsToPlace` 的玩家可见表现，以及重返后是否会意外补入口。
3. **【待实机验证】**多个带 `creationScript: DragonLair` 的 dragon 同图生成时，实际可落入口数、候选耗尽顺序和 Journey SideRooms 显示。
4. **【待实机验证】**入口 `Cave` place script 部分挖掘后最终落点失败的可构造案例、保存重载结果与视觉残留。
5. **【待实机验证】**主图 `H` -> lair `S` 的返回点在新档、主图内存重返、主图存档重载、lair 内存档重载四种路径都是否稳定回原入口格。
6. **【待实机验证】**在 lair 内保存/读档后，`KDGameData.ShortcutIndex` 是否始终保留足够信息供返回；源码存档包含整个 `KDGameData`，但需要跑通确认时序。
7. **【待实机验证】**击败/收集 owner 后重复进入 lair，owner 消失、sigil 已擦除、已拾取奖励和主图出口解锁状态是否全部保持。
8. **【待实机验证】**`KDCreateWorldLocation` 忽略 `_main` 对非空主 room 的 side-room 返回是否存在当前 5.5 bug；Spiderlings 只应在验证后支持这类来源。
9. **【待实机验证】**真实 KD 5.4 与 5.5 的 `KDLairs.ts`、`KDLairEntrances.ts`、`KDStairActions.ts` 字段/签名差异。

## 十四、完整调用链索引

### 随机入口生成

```text
KDJourneySlotTypes.basic
  -> KDGetMapGenList(3, KDMapMods, slot)
  -> slot.MapMod = "Dragon"
  -> KinkyDungeonCreateMap(... MapMod="Dragon" ...)
  -> KinkyDungeonReplaceDoodads -> KDMapData.PotentialEntrances
  -> KDPruneEntrances
  -> KDMapMods.Dragon.worldGenScript
  -> DialogueCreateEnemy
  -> KDRunCreationScript
  -> KDCreationScripts.DragonLair
  -> KDCreateDragonLair
  -> KDAddLair / KDDoLairOutpostConnections
  -> slot.lairs + slot.lairsToPlace
  -> KDBuildLairs
  -> KDFindEntrance
  -> KDPlaceLairEntrance
  -> KDLairEntrancePlaceScript.Cave
  -> KDLairTypePlaceScript.Cave
  -> KDMakeShortcutStairs
  -> map char H + tile.RoomType=lairInstanceId
```

### 进入和返回

```text
KinkyDungeonHandleMoveToTile(H)
  -> KinkyDungeonHandleStairs
  -> KDGoThruTile
  -> KDAdvanceAmount.H => 0
  -> KDAdvanceLevel (same depth / same world y)
  -> KDGameData.RoomType = lairInstanceId
  -> KinkyDungeonCreateMap(useExisting=true)
       first visit: KDSaveRoom(main) + generate DragonLair + cache data[lairId]
       revisit: KDLoadMapFromWorld(data[lairId])
  -> remember KDGameData.ShortcutIndex

DragonLair S (tile.RoomType=sourceMainRoom)
  -> KDGoThruTile
  -> KDAdvanceAmount.S => 0
  -> KDGameData.RoomType = sourceMainRoom
  -> KDLoadMapFromWorld(main cache)
  -> KDPlacePlayerBasedOnDirection(..., saved ShortcutIndex)
  -> original H coordinate
```

### 存档

```text
KinkyDungeonGenerateSaveData
  -> KDGameData (RoomType, ShortcutIndex, progress)
  -> KDMapData (current room)
  -> KDWorldMap (all cached rooms + lairs + pending links)
  -> KDCurrentWorldSlot
  -> KDPersonalAlt
  -> KDPersistentNPCs

Load
  -> restore KDWorldMap and current slot
  -> select slot.data[KDGameData.RoomType]
  -> overlay saved current KDMapData
  -> restore KDPersonalAlt and persistent NPCs
  -> unpack entities
```

## 十五、源码证据文件清单

- `KinkiestDungeon-5.5/Game/src/map/KDJourney.ts`：basic/shop/boss slot 与 MapMod 抽取。
- `KinkiestDungeon-5.5/Game/src/map/KinkyDungeonMapMods.ts`：`Dragon` MapMod、权重、资格和 owner worldgen。
- `KinkiestDungeon-5.5/Game/src/map/KDLairs.ts`：lair 类型、实例注册、连接队列、入口选择与幂等。
- `KinkiestDungeon-5.5/Game/src/map/KDLairEntrances.ts`：入口候选类型、筛选、挖掘、`H` tile 元数据。
- `KinkiestDungeon-5.5/Game/src/map/Lair/DragonLair.ts`：alt type、洞穴生成器、奖励、sigil、owner 环境。
- `KinkiestDungeon-5.5/Game/src/map/KDMapGen.ts`：完整地图生成阶段、缓存选择和 `KDBuildLairs` 时机。
- `KinkiestDungeon-5.5/Game/src/base/game/KinkyDungeonGame.ts`：默认地图数据、room 存取、返回点和 RNG 初始化。
- `KinkiestDungeon-5.5/Game/src/map/KinkyDungeonTiles.ts`：`H/S/s` 的 AdvanceAmount 和玩家移动交互。
- `KinkiestDungeon-5.5/Game/src/map/KDStairActions.ts`：房间切换、层级进度、目标 room 和 ShortcutIndex 时序。
- `KinkiestDungeon-5.5/Game/src/enemy/KDCreationScripts.ts`：dragon owner 与 lair 创建。
- `KinkiestDungeon-5.5/Game/src/prison/KinkyDungeonJail.ts`：`KDCreateDragonLair`、捕获直达和世界槽位更新。
- `KinkiestDungeon-5.5/Game/src/base/KinkyDungeon.ts`：存读档字段与恢复顺序。
- `KinkiestDungeon-5.5/Game/src/map/KinkyDungeonEscapeList.ts`、`KinkyDungeonTilesList.ts`：sigil 目标/完成状态。
- `KinkiestDungeon-5.5/Game/src/base/KDTypeDefs.ts`：`KDWorldSlot` 与 `KDMapDataType` 的持久结构。
