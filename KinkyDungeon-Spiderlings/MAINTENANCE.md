# Spiderlings 0.92.36-prison.alpha.1 维护说明

`KinkyDungeon-Spiderlings/` 是当前开发 Mod 根目录，已移除旧目录名中的版本号。正式版本是 [GitHub Release v0.92.38](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.38)。当前巢穴监狱实验版 `prison.alpha.1` 保留 `0.92.36` 版本基线，和普通 `test.N` 包分开安装测试。test.13 原生验收覆盖本地只读参考的 KD 5.5.0 和安装版 KD 5.4.92；5.4.92 当轮未覆盖存档恢复，不据此扩大为所有 5.4.x / 5.5.x 版本均已验证。

玩法和数值见 [参数说明](Spiderlings_0.9_Parameter_Guide.md)，正式范围见 [0.92 设计基线](../docs/spiderlings-0.92-game-design.zh-CN.md)，当前 Spinner 场景与验证入口见[运行时说明](../docs/RUNTIME.md)，术语与边界见 [CONTEXT.md](CONTEXT.md)。旧[试玩说明](../docs/spiderlings-spinner-capture/PLAYTEST.zh-CN.md)保留 test.10 的历史记录。

test.14 清理比较运算并减少同次 Rollout 规划的重复地图扫描，自动回归与安装包验证另见本次维护记录。实机与视觉测试由维护者后续执行，不沿用 test.13 的证据声称本版本已完成实机验收。

test.15 加入 Mage Spiderlings。第 5 层或有效安全等级 0 起，合格新普通地图在原生随机人口之前保留一只，前提是合法格和共享移动人口额度足够。自然权重随有效安全等级从 2 增至 8，侵扰地图再加 1，最高 9；巢穴增援默认权重 1，与 Tunneler 相同。法师使用远程攻击和单格符文；玩家 ItemArms 物品的最终素材与脱困设计待定。`KDMapData.SpiderlingsGuaranteedMageState` 保存本图保底结果，重访不补生。实机证据需按本次交付包另行记录。

test.16 补齐符文与丝弹命中时由原生战斗逻辑请求的短暂命中贴图，复用现有符文图形，避免命中后产生缺失资源请求。实机证据需使用 test.16 的最终 ZIP 重新记录。

test.17 加入巢穴监狱：锚定蛛茧后，幼蛛在 30–50 个世界回合内开始可打断的牵引押送；玩家抵达巢穴入口才入狱。监狱保留同一地图、十个主巢入口、巡逻、地区警报、普通施工与茧房 50 回合后的分层扩建。玩家可切开蛛茧、绕过主巢并从外出口返回原楼层；再次被捕会回到保留旧破坏与施工状态的茧房。无刀 Cut 按蛛茧原有的 40 次有效动作门槛计数。最终实机证据和包哈希见本次交付报告。

test.18 修复离开监狱期间的目击报告过期计算；再次目击已过期的相同位置会建立新报告。茧房施工队优先使用现有 Spinner，有空位时补召 Spinner；满员仍不足四只时，优先征用未承担巡逻的存活敌对幼蛛，补足四名所有者并沿用原有付费施工与外层规则。

此前 test.17／test.18 是监狱功能的历史安装包。当前实验包改用 `prison.alpha.1` 命名，玩法沿用 test.18 的监狱实现；旧包不改名，也不作为当前版本的验收证据。

## 当前测试扩展

当前 Spinner 遭遇默认在合格的新普通／侵扰地图启用，使用已有敌对 Spinner 按原生行动预算施工。闭合围场、至少两只合法来源及一次真实近战命中共同允许开始捕获；围场破损不解除已建立的 Capture strands。十种调试场景通过 `Spiderlings.SpinnerScenarios` 使用同一运行时。旧固定训练房 Perk 和旧试玩存档不作为当前验收入口。

对抗使用独立拘束条和挣脱条，不提前装备物品。失败只进入 wrapping；第一次付费 wrapping 行动通过原生 ItemLegs 兼容检查后创建腿袋并写入 20%，随后四次行动继续更新同一物品。中断保留物品 ID、锁、原生解除字段、事件、逃脱进度和 `data.wrapProgress`；临时捕获状态不保存进度副本。场地与连接保存在地图数据中；捕获阶段、参与者及活动腿袋 ID 保存在 KDGameData；实际沉积和逃脱进度只保存在物品 data 中。图形对象与计时器句柄不写入存档。绘制只读物品进度和临时状态；读档事件审计 schema 3 状态和精确物品 ID，旧捕获状态不会迁移。

玩家离开已破损围场后，新的 Spinner 有效命中可建立或复用一条真实 leash。Recovery schema 2 最多保存八个来源及其 field 关联；重复命中只刷新，审计移除的来源必须再次命中才能接回。单一 executor 支付拖拽，目的地按共同核心、无关 field 多数、最近可达核心和 executor fallback 依次决定。跨越连续实体蛛网按每格两个付费拖拽动作累计，最终动作才移动。Stand firm 的显示体力费用为 `5 + 2 × (来源数 - 1)`；自有 leash 的原生挣脱惩罚候选为每个额外来源 `0.05`，仍待实机平衡校准。外部 leash 的物品、锁、进度、链接和原生 tether owner 均不修改。

NPC 回收复用 `SpiderlingsSpinnerRecoveryCore.js` 的来源、executor、目的地和 crossing 规则，不创建 leash 或其他物品。`enemyMove` 只有在 NPC 实际离开破损外边界时记录 departure；随后真实 Spinner 近战增加 Slime 才接入来源。付费拖拽使用原生 `KDMoveEntity(..., false)`，返回修复后的共同核心不会自动开始 Capture；还需下一次真实命中重新满足闭合围场、两只合法来源和绑定增加条件。

`Models/SpiderlingsSpinnerLegbinder/` 的 Band、Tail、Finished、Closure 是四个直接替换入口，不进入共用蛛丝 atlas。`SpiderlingsSpinnerArt.js` 负责前后层、宽带和活动尾端；`SpiderlingsSpinnerCapture.js` 从 `SpiderlingsSpinnerNativeField.js` 的已闭合复合围场接收玩家入场资格，并保存独立于围场的临时 Capture strands。`SpiderlingsSpinnerNPCCapture.js` 在真实 Spinner 近战增加原生 Slime 后接收 NPC 入场资格，只拦截自愿移动，并把原生挣扎的实际减量用于临时丝线债务。旧试玩场建造仍由 `SpiderlingsSpinnerField.js` 保留。门口拦截线、自动预建线、单层围场和同组双层围场共用纯 JSON 的 `SpiderlingsSpinnerTopology.js` 与原生投影 `SpiderlingsSpinnerNativeField.js`。`SpiderlingsSpinnerAI.js` 保存分组、预建计划、稳定诱饵和四回合的最后已知目标信息，并在八回合失去视线后交回原生追击。`SpiderlingsSpinnerRollout.js` 在新普通／侵扰地图保存启用决定，并为每个合法 group 持久化确定性的 schema-2 enclosure 或 line fallback；enclosure 保留合法 3×3 core，保护格、占位或空间拒绝时该 group 保留 line fallback，且没有全局围场数量上限。`SpiderlingsSpinnerScenarios.js` 提供场景输入，`SpiderlingsSpinnerRuntime.js` 是唯一敌人循环分发器及后续攻击/施法门控点。玩家与 NPC 捕获都只会由真实 Spinner 近战命中的 Webbing 特效入口启动。画师交接页、专用脚本和生成记录仅保留在维护者本机，不进入公共仓库或安装 ZIP。

`spiderlingsPinkWebbing` 同时选择拘束、投射物和带蛛丝敌人的外观。Spinner、Tunneler、WebCaster、NestEntrance 分别有原色和粉色 PNG；Jumper 两种设置共用同一张交付图。切色不改变实体 ID、存档或玩法。

## 运行时与状态

Manifest 按依赖顺序加载运行脚本。模块职责、共享 hook 的安装与调用顺序、存档字段归属见 [运行时架构](../docs/RUNTIME.md)。`SpiderlingsCore.js` 负责共享注册；遭遇与 WebCaster 移动分别由 `SpiderlingsEncounters.js`、`SpiderlingsWebCaster.js` 管理。`SpiderlingsWebbingData.js` 和 `SpiderlingsWebbingRules.js` 提供定义与纯规则，`SpiderlingsWebbing.js` 负责 KD 接入。默认开启的 Spinner encounter 只使用地图已有且满足编组条件的 Spinner，不新增人口，也不修改小队、巢穴或地图上限设置。

共享状态保存在现有 Spiderlings 命名空间、实体字段和地图数据中。`KDMapData.SpiderlingsSpinnerEncounter` 的 schema 2 保存声明围场、共同核心、层级、施工分配、共享物理段、HP、重建冷却和失主计时；原生蛛网实体只是可去重的投影。旧存档缺少新字段时按当前默认值恢复，不推断无法证明的历史来源。兼容包装只在对应 KD 原生函数存在时安装，并把不属于 Spiderlings 的参数完整交回原函数。

地图默认最多保留 25 只移动幼蛛，0 表示不限。Mage 也计入；自然生成、地图保底、游荡、固定小队、巢穴增援和死亡召唤共用额度。每个巢穴的存活子代与累计 Tunneler 额度独立保存。五个任务巢采用 3＋2 分组，保持地图连通和可攻击邻格；任务完成后才开放正向楼层出口。

## 拘束与模型

当前共有 27 件运行拘束：十件 Lv1、五件 Lv2、八件 Lv3、Cocoon、Spinner 腿袋、Silk leash 和 Mage 手臂占位物。普通蛛丝部位独立按 Lv1 → Lv2 → Lv3 推进；Blindfold 和 Gag 从 Lv1 进入 Lv3，Hood 需要对应 Lv3 头口层。八件 Lv3 全部真实装备、命中前 slow 达到五层后，后续允许的直接命中才能施加 Cocoon。Spinner 普通命中只推进腿、踝和足。

Lv1 需要一次有效脱困行动；Lv2/Lv3 需要两次，可混合 Cut、Remove 和 Struggle。Cocoon 的 Cut 目标为 40，Remove/Struggle 目标为 50。Spinner 完整腿袋需要 Cut 4 次或 Remove/Struggle 6 次，半成品分别需要 2/3 次。Cocoon 阻止 23 件内层蛛丝操作；移除后恢复各部位外层优先顺序。

普通外部拘束和护甲只在 KD 原生无覆盖添加、blocker 与链接检查允许时共存。Spiderlings 不删除或重建外部实例。Lv1 左右手套是独立 ItemHands 链接，只绕过外部 ItemArms 导致的手部不可达。

## 图层、位移与素材

Lv1 没有 displacement。Lv2/Lv3 共用对应部位配置：

| 部位   | 目标          | 强度 | 裁切原点     |
| ------ | ------------- | ---: | ------------ |
| Arm    | `Rope1`       | 1200 | `(650,749)`  |
| Belly  | `CorsetTorso` | 1200 | `(459,1280)` |
| Legs   | `Skirts`      | 2000 | `(110,1657)` |
| Ankles | `Skirts`      | 2000 | `(383,2085)` |
| Foot   | `Shoes`       |  100 | `(741,2928)` |

50 张 `Models/SpiderlingsWebbing*` PNG 是权威 direct fallback，两色采用 atlas-first / direct fallback 加载。五张 displacement 不进入 atlas。原色和粉色分别生成 `TextureAtlas/spiderlings-webbing-0.{json,png}` 与 `TextureAtlas/spiderlings-webbing-pink-0.{json,png}`。

`tools/build-spiderlings-atlas.py` 从显式路径读取 alpha 边界，无损裁切并记录原画布偏移；不缩放、旋转、重采样、调色或改写源 PNG。每个 atlas 必须完整提供自己的 25 个 frame 才会登记别名，单色图集失败只让该颜色回退 direct PNG。

## 文本、检查与交付

英文 fallback 与七份 CSV 覆盖 25 件拘束以及当前敌人、技能、设置、门禁、侵扰、试玩和脱困文案。日语中的 Spiderling 统一称为「幼蛛」。中文和英文属于界面排版验收范围，其余语言保留现有翻译。

测试包由 manifest、110 个 `fileorder` 条目和七份 CSV 组成，共 118 项。开发脚本、文档、画师包、原画和验证记录不进入安装包。图集依赖固定在 `tools/requirements-atlas.txt`。

按 [CONTRIBUTING.md 的验证矩阵](../CONTRIBUTING.md#verification)选择检查范围。仅修改文档不需要游戏输入、版本升级或本地 ZIP。运行时交付在 Spiderlings 仓库根目录构建最终 ZIP 后执行完整本地检查：

```powershell
python -m pip install -r .\KinkyDungeon-Spiderlings\tools\requirements-atlas.txt
powershell -ExecutionPolicy Bypass -File .\KinkyDungeon-Spiderlings\tools\build-spiderlings-release.ps1
powershell -ExecutionPolicy Bypass -File .\KinkyDungeon-Spiderlings\tools\watch-spiderlings-mod.ps1 -Once
```

`Repository checks` 在每个 PR 和维护分支推送上重建 atlas、构建 ZIP、逐项比对包内容，并保存以提交 SHA 命名的 14 天 workflow artifact。测试版本不创建 GitHub Release。正式发布只从 `main` 产生，并将通过验收的同一 ZIP 附加到 `v<modbuild>` Release。
