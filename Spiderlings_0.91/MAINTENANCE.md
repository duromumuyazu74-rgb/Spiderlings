# Spiderlings 0.92.38 维护说明

`Spiderlings_0.91/` 是当前正式 Mod 根目录，名称为迁移前历史路径。正式安装包是 [GitHub Release v0.92.38](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.38) 中的 `Spiderlings_0.92.38.zip`。当前兼容验收覆盖本地只读 `KinkiestDungeon-5.5/` 的 KD 5.5.3 与安装版 KD 5.4.92；不据此扩大为所有 5.4.x / 5.5.x 版本均已验证。

玩法和数值见 [参数说明](Spiderlings_0.9_Parameter_Guide.md)，实现范围见 [0.92 设计基线](../docs/spiderlings-0.92-game-design.zh-CN.md)，术语与边界见 [CONTEXT.md](CONTEXT.md)，正式包结果见 [0.92.38 审核](../docs/spiderlings-full-review-0.92.38.zh-CN.md)。

## 运行时与状态

Manifest 按以下顺序加载八个脚本：

1. `SpiderlingsCore.js`：命名空间、设置、原生兼容入口与共享工具。
2. `SpiderlingsModelRuntime.js`：atlas、direct PNG fallback、颜色选择和模型缓存。
3. `Spiderlings.js`：敌人、法术、设置和基础遭遇注册。
4. `SpiderlingsInfestation.js`：侵扰楼层、五巢任务、人口上限和巢穴增援。
5. `SpiderlingsCombat.js`：玩家与 NPC 的近战、跃击、喷网和束缚结算。
6. `SpiderlingsJumperDash.js`：Jumper 蓄力跃击及目标生命周期。
7. `SpiderlingsWebbingModels.js`：模型、图层、姿势和位移注册。
8. `SpiderlingsWebbing.js`：通过 shared resolver 处理蛛丝进阶、脱困、丝茧、加固和警戒状态。

共享状态保存在现有 Spiderlings 命名空间、实体字段和地图数据中。运行时对象、纹理和回调句柄不写入存档。旧存档缺少新字段时按当前默认值恢复；不推断无法证明的历史来源。兼容包装只在对应 KD 原生函数存在时安装，并把不属于 Spiderlings 的参数完整交回原函数。

地图默认最多保留 25 只移动幼蛛，0 表示不限。自然生成、游荡、固定小队、巢穴增援和死亡召唤共用额度。每个巢穴的存活子代与累计 Tunneler 额度独立保存。五个任务巢采用 3＋2 分组，保持地图连通和可攻击邻格；任务完成后才开放正向楼层出口。

## 拘束与模型

当前共 24 件运行拘束：十件 Lv1、五件 Lv2、八件 Lv3 和 Cocoon。各身体部位独立按 Lv1 → Lv2 → Lv3 推进；Blindfold 和 Gag 从 Lv1 进入 Lv3，Hood 需要对应 Lv3 头口层。八件 Lv3 全部真实装备、命中前 slow 达到五层后，后续允许的直接命中才能施加 Cocoon。

Lv1 需要一次有效脱困行动；Lv2/Lv3 需要两次，可混合 Cut、Remove 和 Struggle。Cocoon 的 Cut 目标为 40，Remove/Struggle 目标为 50。Cocoon 阻止 23 件内层蛛丝的玩家操作，但内层实例、锁和进度继续保留；移除 Cocoon 后恢复各部位的外层优先顺序。

普通外部拘束和护甲只在 KD 原生无覆盖添加、blocker 与链接检查允许时共存。Spiderlings 不删除或重建外部实例。Lv1 左右手套是独立 ItemHands 链接，只绕过外部 ItemArms 导致的手部不可达，不绕过同槽与原生兼容检查。

## 图层与位移

Lv1 没有 displacement。Lv2/Lv3 共用对应部位配置：

| 部位   | 目标          | 强度 | 裁切原点     |
| ------ | ------------- | ---: | ------------ |
| Arm    | `Rope1`       | 1200 | `(650,749)`  |
| Belly  | `CorsetTorso` | 1200 | `(459,1280)` |
| Legs   | `Skirts`      | 2000 | `(110,1657)` |
| Ankles | `Skirts`      | 2000 | `(383,2085)` |
| Foot   | `Shoes`       |  100 | `(741,2928)` |

Legs/Ankles 的 Lv1 位于站立裙层下，Lv2/Lv3 位于裙层上。Lv1/Lv2 保留原衣物，不使用 erase map 清除手套或衣服。Lv3 隐藏对应内层图像和位移，但不删除物品。Hood 覆盖头部及兽耳；Lv3 Legs 和 Cocoon 覆盖尾巴。Cocoon 本体位于 `FurnitureFront`，外围网位于 `FurnitureBack`。

五张位移图位于 `DisplacementMaps/SpiderlingsWebbingLv2{Arm,Belly,Legs,Ankles,Foot}Squish.png`。装备事件等待 Pixi Assets 解码所需资源后重绘；读档首次 `afterDress` 仅执行一次必要修正。

## 素材与 atlas

50 张 `Models/` PNG 是权威 direct fallback，两色采用 atlas-first / direct fallback 加载，各包含十张 Lv1、五张 Lv2、八张 Lv3、Cocoon 与 OuterWebs。五张 displacement 不进入 atlas。原色和粉色分别生成一张 4096×4096 图集：`TextureAtlas/spiderlings-webbing-0.{json,png}` 与 `TextureAtlas/spiderlings-webbing-pink-0.{json,png}`。

`tools/build-spiderlings-atlas.py` 从显式路径读取 alpha 边界，无损裁切并记录原画布偏移；不缩放、旋转、重采样、调色或改写源 PNG。每个 atlas 必须完整提供自己的 25 个 frame 才会一次性登记别名。某个 atlas 失败时仅该颜色回退 direct PNG。

`spiderlingsPinkWebbing` 同时选择拘束、投射物和带蛛丝敌人的外观，不改变 ID、存档实体或玩法。缓存按颜色分开，换色和纹理解码完成后通过现有重绘入口刷新。

## 文本、检查与发行

英文 fallback 与七份 CSV 覆盖 24 件拘束以及当前敌人、技能、设置、门禁、侵扰和脱困文案。日语中的 Spiderling 统一称为「幼蛛」。中文和英文属于界面排版验收范围，其余语言保留现有翻译。

正式包由 manifest、85 个 `fileorder` 条目和七份 CSV 组成，共 93 项。开发脚本、文档、原画和验证记录不进入安装包。图集依赖固定在 `tools/requirements-atlas.txt`。

在仓库根目录执行完整本地检查：

```powershell
python -m pip install -r .\Spiderlings_0.91\tools\requirements-atlas.txt
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\build-spiderlings-release.ps1 -RunCheck
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\watch-spiderlings-mod.ps1 -Once
```

`Repository checks` 在每个 PR 和维护分支推送上重建 atlas、构建 ZIP、逐项比对包内容，并保存以提交 SHA 命名的 14 天 workflow artifact。该 artifact 仍需本地游戏验收。正式发布将通过验收的同一 ZIP 附加到 `v<modbuild>` GitHub Release；自动 Source code ZIP 不是可安装 Mod。
