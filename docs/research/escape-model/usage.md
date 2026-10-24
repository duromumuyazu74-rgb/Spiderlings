# 原生脱困实验

`npm run analyze:escape` 用实际游戏和安装 ZIP 比较脱困策略。它复用现有的隔离 Chrome runtime、原生 Mod 加载与 `normalAcceptance`，不用归档 notebook 内复制的引擎或 fallback 数据。工具、脚本与本目录均不进入 Mod ZIP。

从正在开发的 checkout 根执行。游戏输入与依赖设置见 [开发环境](../../DEVELOPMENT.md#setup)，版本准备见 [双版本验证](../../DEVELOPMENT.md#dual-version-runtime-acceptance)。

```powershell
npm run test:compatibility -- --prepare-only
npm run analyze:escape -- --runtime '<cache>/latest.json' --package '<accepted ZIP>' --plan docs/research/escape-model/quiet-cocoon.json
npm run analyze:escape -- --runtime '<baseline result.json>' --package '<same accepted ZIP>' --plan docs/research/escape-model/quiet-cocoon.json
```

`--runtime` 接受现有 compatibility `result.json` 的 `game` 记录，或准备阶段产生的 `latest.json`。工具核对 bundle 指纹、源码提交和实际版本；源码缓存已移动时，先重新准备。它不会自行联网或把旧报告当最新版本。输出默认为本 checkout 的 `.scratch/escape-analysis/<唯一目录>/`，也可用 `--output .scratch/<新实验目录>` 指定。保留 `result.json`、`REPORT.md` 与输入计划。

## 计划与结果

[quiet-cocoon.json](quiet-cocoon.json) 比较单件与完整起始套装，以及密度 0、密度 300、密度 300 后静候 22 回合。每种场景分别用相同的两个种子执行 Cut、Remove、Struggle，总计 24 个样本。所有样本共用 240 世界回合总预算，包括预先静候、资源不足时的休息及延迟结算。两个种子只供配对校准。

空房场景会清理测试地图，准备指定装备和初始密度；完整套装沿用原生起始 perk。默认提供普通 Knife 与测试地格的 Sharp 亲和，`knife: false` 同时移除工具准备与该亲和。资源只由新局的初始状态提供，之后不补满；资源不足时走真实等待恢复。密度随真实世界回合自然变化，300 不是强制恒定的密度。敌人接触、修补、围场与离场路径不在这组受控样本内。

`cases` 中每个条目指定 `label`、拘束 `id`、`method`、`equipment: "single" | "full"`、初始 `density`，并可指定 `quietTurns`、`knife`。候选参数通过 `overrides` 设置，如：

```json
{
  "label": "candidate-cocoon-remove-speed",
  "id": "SpiderlingsWebbingCocoon",
  "method": "Remove",
  "equipment": "full",
  "density": 300,
  "overrides": { "speedMult": { "Remove": 0.3 } }
}
```

候选只临时改变指定拘束的 `escapeChance`、`speedMult`、`struggleMinSpeed` 或 `limitChance`，每个样本结束即还原，不改源文件或 ZIP。工具记录加载包的实际参数、游戏身份、ZIP 哈希、实验脚本哈希、种子、累计回合、真实精力/意志支出、休息次数、密度与原生进度轨迹。共享种子能减少初始条件差异，不保证不同策略消耗完全相同的随机序列。

资源数字采用 `KinkyDungeonStatStamina` / `KinkyDungeonStatWill` 的内部 Stat 单位，与 HUD 显示缩放分开。结果保留 `escaped`、`turn-budget`、`missing-tool`、`blocked`。预算耗尽是截尾观察，不能将它的回合数当作真实脱困时间。汇总同时列出所有样本及实际观察回合范围；它不报告总体胜率或精确尾部分位数。

## 在复制存档上观察

需要实际监牢状态时，传入复制的导出存档或现有存档清单，并用 `--slot` 选择。解码沿用指定游戏的 LZString。每个样本分别重载同一份原生存档，保留装备、资源、密度、敌人、围场和位置，不修改输入文件。加载完成后重新设置计划指定的 RNG 种子，因为原生加载会恢复存档或地图的种子；结果记录实际 `rngSeed`。

```powershell
npm run analyze:escape -- --runtime '<runtime result.json>' --package '<matching ZIP>' --plan '.scratch/prison-plan.json' --save '<copied save>' --slot 1
```

存档计划省略 `equipment`、`density` 和 `knife`，其余字段含义相同。例如比较三种方法与静候策略时，使用实际穿戴的 Cocoon ID，设相同的总预算。工具只对指定拘束执行脱困与等待；拘束已经移除后即停止。完整的多层拆除、破墙、移动和返回来源楼层仍由 [存档 replay](../../DEVELOPMENT.md#save-and-evidence-diagnostics) 与实际路线测试负责。用它支持 [#76](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/76) 的数值判断，不能凭拆茧成功关闭成熟四层离场验收。

## 成熟四层监牢路线

[mature-prison.json](mature-prison.json) 提供 `preparation: "mature-prison"`。使用相同 `analyze:escape` 命令，将 `--plan` 换为该文件；每版游戏会重新准备并原生保存一个四层监牢，随后每个种子和策略各自重载该状态。它与 `--save` 输入互斥。

准备沿用现有原生监牢施工 fixture：普通来源房间、一次真实 captured admission、单件普通 Cocoon、Knife，以及 Spinner-only 巢穴增援权重和既有配额。四层必须全部由真实施工动作闭合。只在准备阶段维持精力与意志，正式存档边界满资源一次；之后保留敌人、围场、修补、接触、自然恢复和有限法力，不给每个行动补满资源。它与前文的完整二十四件套装空房矩阵是不同场景。

计划比较立即 Cut、先等 22 回合再 Cut、已掌握 Fireball 的预先施法加 Cut。预先施法最多尝试四次，实际次数受原生法力需求限制，目标交替为已知地图的 `(14,22)` 与 `(11,22)`。原生施法拒绝、未命中和伤害均保留。

拆茧后，`route: true` 沿现有准备路线的四个路标前往出口。脚本根据实际地图找可尝试的相邻格，拥有整张测试地图信息；实体网格只允许作为原生攻击或施法目标，不直接删除。普通移动、碰撞攻击、可支付的 Fireball、捕获对抗中的挣脱输入和阻塞后的等待均走原生入口。它不搜索最优打法，也不拆除所有可能挡路的内层装备。

总预算 360 世界回合同时包含施法、静候、休息、拆茧和离场。`rows[].outcome` 描述目标拘束是否移除；`rows[].route` 单独记录 `cocoon-not-removed`、`no-route`、`blocked`、`turn-budget`、`unexpected-map` 或 `returned-to-source`。只有回到来源房间、主旅程楼层不变且本 Mod 囚犯身份已清除，才记作返回成功。`webHits` 保留真实网实体伤害，路线轨迹包含位置、资源、闭合层数和游戏状态。拘束阶段的精力支出与后续路线的资源快照分别记录。

输出中的 `mature-save.txt` 是本轮生成的原生存档，`fixture` 记录施工回合、四层状态、实际移动蜘蛛数、实体总数、设置和准备干预。它可以用于后续 [replay](../../DEVELOPMENT.md#save-and-evidence-diagnostics)。失败样本保留，完整离场样本也只证明记录中的构筑、资源与脚本策略；#76 的维护者难度判断继续单独记录。

历史文件、适配理由与本轮实测范围见 [适配记录](assessment.zh-CN.md)。
