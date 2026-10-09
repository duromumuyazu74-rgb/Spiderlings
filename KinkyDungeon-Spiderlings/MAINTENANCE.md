# Spiderlings 维护指南

当前包与待办见 [STATUS.md](../docs/STATUS.md)，开发命令见 [DEVELOPMENT.md](../docs/DEVELOPMENT.md)。本页只维护跨功能的接入和素材约束；逐版结果保存在[历史记录](../docs/archive/README.md)。

## 修改入口

| 改动                         | 维护位置                                                            |
| ---------------------------- | ------------------------------------------------------------------- |
| 场地许可、需求、施工和退役   | `SpiderlingsFieldProjects.js`                                       |
| 猎物归属、回收接触与攻击拦截 | `SpiderlingsFieldCustody.js`                                        |
| 成员、请求、借调、改派与归还 | `SpiderlingsFieldCommand.js`                                        |
| 观察、候选、路径与战术       | `SpiderlingsSpinnerAI.js`、`SpiderlingsSpinnerPassagePlanner.js`    |
| 单次行动及原生阶段准入       | `SpiderlingsSpinnerDuties.js`、`SpiderlingsNativeActions.js`        |
| 结构规则与原生事务           | `SpiderlingsSpinnerTopology.js`、`SpiderlingsSpinnerNativeField.js` |
| 地图事件和读档恢复           | `SpiderlingsSpinnerRuntime.js`                                      |
| 共用测试映射和所有权声明     | `tools/test-impact.json`、`tools/module-contracts.json`             |

其余模块职责见 [RUNTIME.md](../docs/RUNTIME.md)。场地、共用原生行动或原生场景改动使用 `spiderlings-modularity` skill 和 [MODULES.md](../docs/MODULES.md)；共用入口的改动覆盖实际消费者。

Manifest 按依赖顺序加载全局 JavaScript 脚本。模块共享 Spiderlings 命名空间，但通过所属领域 API 变更状态。`KDMapData.SpiderlingsSpinnerEncounter` 保存场地与工程，原生蛛网实体只是可重建、可去重的投影。渲染不推进玩法，不把图形对象和计时器写进存档。

## 拘束与原生兼容

当前拘束目录有十件 Lv1、五件 Lv2、八件 Lv3、Cocoon、Spinner 腿袋和 Silk leash，共 26 件。准确施加、递进与脱困条件见[参数说明](Spiderlings_0.9_Parameter_Guide.md)。普通外部拘束和护甲只在 KD 原生无覆盖添加、blocker 与链接检查允许时共存；不删除或重建外部实例。

修改拘束、模型、图层或打包前，阅读[官方 Mod 接入约束](../docs/spiderlings-official-modding-guidance.md)的相关章节。存档中的真实装备进度、原生付费和来源归属不得由显示或零时间刷新补写。

## 素材与图集

运行素材由用户与画师提供。直接 PNG 是权威输入，两色采用 atlas-first 加载并保留 direct fallback；图集失败按颜色回退，不丢失另一颜色。Spinner 七阶段腿袋与拖尾的来源及动画约定见[美术接入](../docs/spinner-stage-art.md)。模型姿势兼容只扩展到已交付且已验证的素材。

Lv1 没有 displacement。Lv2/Lv3 共用对应部位配置：

| 部位   | 目标          | 强度 | 裁切原点     |
| ------ | ------------- | ---: | ------------ |
| Arm    | `Rope1`       | 1200 | `(650,749)`  |
| Belly  | `CorsetTorso` | 1200 | `(459,1280)` |
| Legs   | `Skirts`      | 2000 | `(110,1657)` |
| Ankles | `Skirts`      | 2000 | `(383,2085)` |
| Foot   | `Shoes`       |  100 | `(741,2928)` |

位移图不进入 atlas。构建器从显式路径读取 alpha 边界，无损裁切并记录原画布偏移，不缩放、旋转、重采样、调色或改写源 PNG。素材、加载器或打包改动使用 `build-spiderlings-atlas` skill。

## 检查与交付

从仓库根目录预览 `npm run test:affected -- --base <起点提交> --plan`。去掉 `--plan` 执行选中的公共测试，`--include-local` 执行列出的本地契约；原生场景另行执行。未知映射必须补齐，不自动扩大为全量。

最终检查严格采用 [CONTRIBUTING.md 验证矩阵](../CONTRIBUTING.md#verification)。纯文档只需仓库检查与内容、链接核对，不升级版本、不生成 ZIP、不运行游戏。运行时交付须构建最终 ZIP，并完成规定的完整本地与双版本原生验收。

英文 fallback 与七份 CSV 保持一致。Manifest allowlist、七份 CSV 和构建器定义安装包内容；文档、测试工具和画师工作资料不进入 ZIP。包数量与哈希记在具体交付证据，不在指南里维护另一份易过期计数。

任务统一在 [GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues) 跟踪。正式版、明确请求的测试 Pre-release、PR 候选与本地包的通道区别见[发布规则](../docs/DEVELOPMENT.md#releases)。
