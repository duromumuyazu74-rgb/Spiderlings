# Spiderlings 0.92.36-test.32 维护说明

`KinkyDungeon-Spiderlings/` 是当前开发 Mod 根目录，已移除旧目录名中的版本号。正式版本是 [GitHub Release v0.92.38](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.38)，本测试版本保留 `0.92.36` 的版本基线。test.13 原生验收覆盖本地只读参考的 KD 5.5.0 和安装版 KD 5.4.92；5.4.92 本轮未覆盖存档恢复，不据此扩大为所有 5.4.x / 5.5.x 版本均已验证。

玩法和数值见 [参数说明](Spiderlings_0.9_Parameter_Guide.md)，正式范围见 [0.92 设计基线](../docs/spiderlings-0.92-game-design.zh-CN.md)，当前 Spinner 场景与验证入口见[运行时说明](../docs/RUNTIME.md)，术语与边界见 [CONTEXT.md](CONTEXT.md)。旧[试玩说明](../docs/spiderlings-spinner-capture/PLAYTEST.zh-CN.md)保留 test.10 的历史记录。

test.14 清理比较运算并减少同次 Rollout 规划的重复地图扫描，自动回归与安装包验证另见本次维护记录。实机与视觉测试由维护者后续执行，不沿用 test.13 的证据声称本版本已完成实机验收。

test.15 加入 Mage Spiderlings。第 5 层或有效安全等级 0 起，合格新普通地图在原生随机人口之前保留一只，前提是合法格和共享移动人口额度足够。自然权重随有效安全等级从 2 增至 8，侵扰地图再加 1，最高 9；巢穴增援默认权重 1，与 Tunneler 相同。法师使用远程攻击和单格符文；当时的玩家 ItemArms 占位物在 test.26 停用。`KDMapData.SpiderlingsGuaranteedMageState` 保存本图保底结果，重访不补生。实机证据需按本次交付包另行记录。

test.16 补齐符文与丝弹命中时由原生战斗逻辑请求的短暂命中贴图，复用现有符文图形，避免命中后产生缺失资源请求。实机证据需使用 test.16 的最终 ZIP 重新记录。

test.25 增加独立的自有 Hood 开关，并尊重原生 NoHood Perk；关闭后下一游戏回合解除已穿戴的自有 Hood，结茧和满蛛丝开局改用七件 Lv3 门槛。Mage 敌人贴图已采用专用素材，手臂拘束仍无专用模型。`T's Enemies (12).zip` 中的两张 72×72 PNG 分别采用为符文底图和放置时的蜘蛛图标；命中图沿用新底图。放置阶段显示发光图标，布置完成后显示底图；踩中后发光并警示 3×3 区域，下一回合按当时位置结算。玩家调用普通 Webbing 进阶，敌对 Maidforce 通过原生 Slime、护盾和抗性结算。Webbinder 不在本次包中。

test.26 移除 Mage 手臂拘束及其文案。丝弹通过原生 `Damage` 效果对玩家造成 0.5 点胶属性伤害，不再穿戴额外物品；对敌对 Maidforce 的原生伤害仍为 4 点。Mage 仍只选择丝弹或符文，未启用旧版四种召唤法术。此测试版不兼容已装备旧 Mage 手臂拘束的存档。

test.27 从 T_Swizzle 的 `Enemy Webs.psd` 提取 Spinner 陷阱的侧边、转角、上边框以及玩家牵引线的 72×72 Normal 图。转角和上边框只取灰色成稿图层，不带红色草稿线。训练场中已建成的边界和 Spinner 捕获玩家时的牵引线使用这些图；若贴图尚未加载或玩家选择粉色蛛丝，则保留原有线条绘制。四组 WebCaster 弹体效果继续使用已有的 Normal/Pink 成对贴图。PSD 中 Spinner 陷阱三件和玩家牵引线的 Pink 组仍是灰色副本，等待画师提供粉色版；`Web Caster Webs v2` 的四个 Pink 组也不是粉色，尚未替换现用弹体贴图。

test.28 采用画师新交付的八张 Pink PNG：Spinner 边框三件、玩家牵引线与四种 WebCaster 弹体效果。WebCaster 四种 Normal 效果也从 PSD 中换成对应的 v2 图，沿用原有文件名与战斗逻辑。Normal/Pink 按现有蛛丝颜色选项切换；贴图绘制不可用时仍回退到线条。Spinner 边框角图的原始直边位于左侧和下侧，四角旋转起点改为 90°，使直边与上下左右的边框衔接。此版本完成了静态拼接检查和自动测试，游戏内视觉效果仍需以此包检查。

test.29 修复 Pink 模式下 Spinner 场地仍显示灰白蛛网的问题。普通地图的 `SpiderlingsSpinnerWebCell` 与训练场的 `SpiderlingsSilkAnchor` 都是原生敌人贴图，先前只把 `WebSprayTrail.png` 注册为其图像别名；弹体效果的颜色切换不会自动覆盖这两个敌人名。现在为两者注册 Normal/Pink 别名，并在原生敌人绘制时按现有设置选取对应路径。切换设置后现存蛛网格也随下一次绘制更新；蛛网战斗逻辑和美术源文件不变。

test.30 为 Mage 增加蚀盾咒印和千丝坠牢。咒印先预警两回合，再在 4×4 区域持续三回合，并对其中敌对女仆施加最高 3 点即时破盾；逐回合叠加的咒印在其他幼蛛有效命中后延迟一回合按 1 格、3×3 或 5×5 爆发。护盾易碎从最后一次留在法阵内起持续三回合，实际护盾伤害增加 50%，超出护盾的部分不增加生命伤害。坠牢按 21 格阵形逐环向内预警三回合，爆发时依位置造成递减生命伤害及普通蛛丝／原生 Slime 施加；爆发后冷却七回合。两个法术复用 T's 已有 Normal/Pink 蛛网效果图，符文和丝弹仍保留。自动测试与安装包检查独立记录，实机视觉仍待本版 ZIP 验收。

test.31 完成总规格 #90：侵扰楼层改为全图开阔地形与狭道，固定三个原始任务巢，每巢初始配备两只 Spinner、WebCaster 和 Mage；三巢全部击破后才开放下楼。普通地图和侵扰地图的 Spinner 可按原生行动预算建造 3×3 围场并向 5×5、7×7 扩展。移动幼蛛能站在自有蛛网上并以约 1.5 倍移动速率通过；敌对 NPC 的直接 WebCaster 喷射可开启八回合黏住压力，其他有效蛛丝行动续加压力。完全黏住后，相邻幼蛛可各支付真实行动协作三次非致命缠裹；原生无力反抗只在带有仍存自有蛛丝的合格目标上触发回退。BlindZombie 可黏住但不可缠走；监狱实验不包含在本测试包中。

test.32 将楼层显示名改为“幼蛛猎场”／Spiderling Hunting Grounds，保留 `SpiderlingsInfestation` 内部 ID 与旧存档兼容。缠裹复审修复三处问题：蜘蛛离场后继续按施丝来源的阵营和幼蛛类型判定敌意；只有自有蛛丝足以造成原生无力反抗时才进入无人缠裹回退；原生挣扎未破坏完全黏住状态时保留已支付的缠裹行动。相关单元与原生场景复验以本测试版交付记录为准。

test.34 将五巢“幼蛛侵扰”（`SpiderlingsInfestation`，权重 50）与三巢“幼蛛猎场”（`SpiderlingsHuntingGrounds`，权重 100）作为两个独立地图修饰符装入同一包。test.32 的三巢旧存档按 `garrisonVersion: 2` 迁移到猎场 ID。猎场野生幼蛛会发现并攻击所有非幼蛛 NPC，包括友方、商人、任务和 `nocapture` 角色；最终缠裹仍遵守原生 `KDCapturable` 与持久角色 `alwaysEscape` 限制。旧侵扰层保留原生人口，不受猎场的额外索敌规则影响。

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

地图默认最多保留 25 只移动幼蛛，0 表示不限。Mage 也计入；自然生成、地图保底、游荡、固定小队、巢穴增援和死亡召唤共用额度。每个巢穴的存活子代与累计 Tunneler 额度独立保存。侵扰楼层只有三个原始任务巢，初始共占十五个实体名额；新增普通巢不替代任务目标。三个原始巢全部被原生击破后才开放正向楼层出口。

## 拘束与模型

当前共有 26 件运行拘束：十件 Lv1、五件 Lv2、八件 Lv3、Cocoon、Spinner 腿袋和 Silk leash。普通蛛丝部位独立按 Lv1 → Lv2 → Lv3 推进；Blindfold 和 Gag 从 Lv1 进入 Lv3，Hood 需要对应 Lv3 头口层。Hood 允许时八件 Lv3 全部真实装备，禁用时其余七件真实装备；命中前 slow 达到五层后，后续允许的直接命中才能施加 Cocoon。Spinner 普通命中只推进腿、踝和足。

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

测试包由 manifest、126 个 `fileorder` 条目和七份 CSV 组成，共 134 项。开发脚本、文档、画师包、原画和验证记录不进入安装包。图集依赖固定在 `tools/requirements-atlas.txt`。

按 [CONTRIBUTING.md 的验证矩阵](../CONTRIBUTING.md#verification)选择检查范围。仅修改文档不需要游戏输入、版本升级或本地 ZIP。运行时交付在 Spiderlings 仓库根目录构建最终 ZIP 后执行完整本地检查：

```powershell
python -m pip install -r .\KinkyDungeon-Spiderlings\tools\requirements-atlas.txt
powershell -ExecutionPolicy Bypass -File .\KinkyDungeon-Spiderlings\tools\build-spiderlings-release.ps1
powershell -ExecutionPolicy Bypass -File .\KinkyDungeon-Spiderlings\tools\watch-spiderlings-mod.ps1 -Once
```

`SpiderlingsNPCAdhesion.js` 为敌对 NPC 记录独立的八回合蛛丝压力、自有 Slime 余额和初始／完全黏住状态。实际原生 Slime 增量按一次付费行动合并；普通蛛丝喷射开启序列，Spinner、Jumper 与 Mage 的有效蛛丝动作可续加压力。初始黏住阻止主动移动，完全黏住使可缩放的直接伤害乘 0.65，不设置原生昏迷或无力反抗。行动间的原生挣脱会扣减自有余额与压力；地图时钟和 NPC 记录随新存档保存。`SpiderlingsNPCWrapping.js` 保存三次付费缠裹进度，并交由 KD 原生非致命移除处理物品和持久 NPC 记录。

`Repository checks` 在每个 PR 和维护分支推送上重建 atlas、构建 ZIP、逐项比对包内容，并保存以提交 SHA 命名的 14 天 workflow artifact。测试版本不创建 GitHub Release。正式发布只从 `main` 产生，并将通过验收的同一 ZIP 附加到 `v<modbuild>` Release。
