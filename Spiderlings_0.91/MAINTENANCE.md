# Spiderlings 0.92.36-test.11 维护说明

`Spiderlings_0.91/` 是当前开发 Mod 根目录，名称为迁移前历史路径。正式基线是 [GitHub Release v0.92.38](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.38)，当前测试安装包由 `test` 分支成功 CI 运行提供。兼容验收覆盖本地只读 `KinkiestDungeon-5.5/` 的 KD 5.5.3 与安装版 KD 5.4.92；不据此扩大为所有 5.4.x / 5.5.x 版本均已验证。

玩法和数值见 [参数说明](Spiderlings_0.9_Parameter_Guide.md)，正式范围见 [0.92 设计基线](../docs/spiderlings-0.92-game-design.zh-CN.md)，Spinner 开发玩法见[试玩说明](../docs/spiderlings-spinner-capture/PLAYTEST.zh-CN.md)，术语与边界见 [CONTEXT.md](CONTEXT.md)。

## 当前测试扩展

Spinner 试玩从新游戏 Perk「结网幼蛛试玩」进入 31×21 平坦场地。两只 Spinner 按真实移动和行动预算放置四处陷阱、连接四条可破坏边界。完整围场内至少两只合法参与者才开始捕获对抗；玩家挣脱或蜘蛛完成拘束后，场地控制、临时预览和围网按当前状态清理。

对抗使用独立拘束条和挣脱条，不提前装备物品。失败后五个世界回合把同一腿袋从 20% 推进到 100%；中断保留已经形成的实际进度。场地、连接、参与者、阶段和物品进度保存在地图数据中，图形对象与计时器句柄不写入存档。

`Models/SpiderlingsSpinnerLegbinder/` 的 Band、Tail、Finished、Closure 是四个直接替换入口，不进入共用蛛丝 atlas。`SpiderlingsSpinnerArt.js` 负责前后层、宽带和活动尾端，`SpiderlingsSpinnerCapture.js` 负责阶段与腿袋状态，`SpiderlingsSpinnerField.js` 负责场地和结点。`tools/artist-kit/` 生成独立画师交付，不进入安装 ZIP。

`spiderlingsPinkWebbing` 同时选择拘束、投射物和带蛛丝敌人的外观。Spinner、Tunneler、WebCaster、NestEntrance 分别有原色和粉色 PNG；Jumper 两种设置共用同一张交付图。切色不改变实体 ID、存档或玩法。

## 运行时与状态

Manifest 按以下顺序加载十一个脚本：

1. `SpiderlingsCore.js`：命名空间、设置、原生兼容入口与共享工具。
2. `SpiderlingsModelRuntime.js`：atlas、direct PNG fallback、颜色选择和模型缓存。
3. `Spiderlings.js`：敌人、法术、设置和基础遭遇注册。
4. `SpiderlingsInfestation.js`：侵扰楼层、五巢任务、人口上限和巢穴增援。
5. `SpiderlingsCombat.js`：玩家与 NPC 的近战、跃击、喷网和束缚结算。
6. `SpiderlingsJumperDash.js`：Jumper 蓄力跃击及目标生命周期。
7. `SpiderlingsWebbingModels.js`：模型、图层、姿势和位移注册。
8. `SpiderlingsWebbing.js`：通过 shared resolver 处理蛛丝进阶、脱困、丝茧、加固和警戒状态。
9. `SpiderlingsSpinnerArt.js`：Spinner 腿袋纹理和人物叠层。
10. `SpiderlingsSpinnerCapture.js`：捕获对抗、包裹进度、输入与存读档。
11. `SpiderlingsSpinnerField.js`：试玩场地、陷阱、连接、重建和调试入口。

共享状态保存在现有 Spiderlings 命名空间、实体字段和地图数据中。旧存档缺少新字段时按当前默认值恢复，不推断无法证明的历史来源。兼容包装只在对应 KD 原生函数存在时安装，并把不属于 Spiderlings 的参数完整交回原函数。

地图默认最多保留 25 只移动幼蛛，0 表示不限。自然生成、游荡、固定小队、巢穴增援和死亡召唤共用额度。每个巢穴的存活子代与累计 Tunneler 额度独立保存。五个任务巢采用 3＋2 分组，保持地图连通和可攻击邻格；任务完成后才开放正向楼层出口。

## 拘束与模型

当前共有 25 件运行拘束：十件 Lv1、五件 Lv2、八件 Lv3、Cocoon 和 Spinner 腿袋。普通蛛丝部位独立按 Lv1 → Lv2 → Lv3 推进；Blindfold 和 Gag 从 Lv1 进入 Lv3，Hood 需要对应 Lv3 头口层。八件 Lv3 全部真实装备、命中前 slow 达到五层后，后续允许的直接命中才能施加 Cocoon。Spinner 普通命中只推进腿、踝和足。

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

测试包由 manifest、96 个 `fileorder` 条目和七份 CSV 组成，共 104 项。开发脚本、文档、画师包、原画和验证记录不进入安装包。图集依赖固定在 `tools/requirements-atlas.txt`。

按 [CONTRIBUTING.md 的验证矩阵](../CONTRIBUTING.md#verification)选择检查范围。仅修改文档不需要游戏输入、版本升级或本地 ZIP。运行时交付在 Spiderlings 仓库根目录构建最终 ZIP 后执行完整本地检查：

```powershell
python -m pip install -r .\Spiderlings_0.91\tools\requirements-atlas.txt
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\build-spiderlings-release.ps1
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\watch-spiderlings-mod.ps1 -Once
```

`Repository checks` 在每个 PR 和维护分支推送上重建 atlas、构建 ZIP、逐项比对包内容，并保存以提交 SHA 命名的 14 天 workflow artifact。测试版本不创建 GitHub Release。正式发布只从 `main` 产生，并将通过验收的同一 ZIP 附加到 `v<modbuild>` Release。
