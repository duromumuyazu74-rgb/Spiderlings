# Escape model 的保留与当前适配

日期：2026-10-24。开发基线为 `test` 提交 `3a1de7d1edded0f8b5b5db5bd7af824dead1c707`，安装输入为 Spiderlings `0.92.39-test.3`。本次迁移不改变运行时数值。

## 原始材料

维护者提供的 [notebook](original/escape-model-5.5.4.ipynb) 与 [HTML 导出](original/escape-model-5.5.4.html) 按原字节保留。运行与文档入口不再依赖原始下载位置。

| 文件                     | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| escape-model-5.5.4.ipynb | `7d601e8f1b8a309c22087012b9c0ccb7de97ba6e15f4a0de76e438c1973f6a97` |
| escape-model-5.5.4.html  | `610775965ed874fc115df81b9ec257d4ee15be9d244846dca916e2fc71929763` |

原材料说明基于 KD 5.5.4，游戏提交 `60b41e14dcd651c49ce2af1be2a25754c52f89d7`。其 JavaScript cell 复制部分原生引擎，另以函数替身提供单件环境；`KinkyDungeonSendEvent` 是空函数。保存的 Python 输出明确为 `data source: fallback`。这些原件保留其历史结论与图片，不将它们改写成当前实测。

引擎来源为 Strait Laced Games LLC / Ada18980 的 [Kinky Dungeon](https://github.com/Ada18980/KinkiestDungeon/tree/60b41e14dcd651c49ce2af1be2a25754c52f89d7)。原生代码部分沿用游戏的条件，见 [第三方说明](../../../THIRD-PARTY-NOTICES.md)；本次归档与适配不将其重新许可为 Spiderlings 的 MIT 代码。

## 当前适用范围

原生 `escapeChance` 参与进度、限制与成功判定，不应直接解释为独立掷骰概率。条件性的下限、亲和、工具、紧度与延迟结算值得保留为分析入口。但固定的 `0.4` 下限、单一的自由肢体阈值、固定四回合操作和一两次脱困不能概括所有装备、事件与版本。

当前 [Webbing 参数](../../../KinkyDungeon-Spiderlings/SpiderlingsWebbingData.js) 采用原生进度与阶段化 `escapeChance` / `speedMult`。注册模板的 `struggleMinSpeed` 为 `0.01`。普通 Cocoon 的基础参数为 Cut `0.5` / Remove `0.04` / Struggle `0.03`，速度倍率为 `0.1` / `0.2` / `0.24`；[事件](../../../KinkyDungeon-Spiderlings/SpiderlingsWebbing.js) 还修改实际成本并记录抵抗。旧 checkout 中固定有效动作次数的实现不属于这个开发基线。

[SilkDensity](../../../KinkyDungeon-Spiderlings/SpiderlingsSilkDensity.js) 在原生延迟进度进入队列时，将本 Mod 拘束的新增进度除以 `1 + D/100`。十个安静世界回合后开始衰减，穿戴与自己的挣扎不阻止衰减；跨过保留期后的比例为 `2^(-(t/12)^2)`，小于 `0.5` 时归零。这个缩放发生在原生分段最小进度处理之后，不能只把原始 `escapeChance` 除以密度倍率替代实际调用。

当前 [#76](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/76) 仍需要成熟四层围场的脱困实测。[#165](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/165) 的主母与魔织丝茧尚未实现，层数扣减和超时关系只用于后续候选分析。当前工具先回答真实拘束在资源与密度恢复下的脱困成本；完整离场仍需原生路线证据。

## 本轮验证

复现实验方法见 [使用说明](usage.md)。原生受控矩阵在两个游戏各执行 24 个样本，共 48 个样本。每个场景使用 `escape-paired-1`、`escape-paired-2`，总预算均为 240 世界回合；两个种子的结果在本矩阵中相同。

| 输入         | 身份                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mod ZIP      | `Spiderlings_0.92.39-test.3.zip`，SHA-256 `67fa70a09373a27403a594b6c0149d9e6888159d73b963a78dc2fcdfe909b864`                                                      |
| KD 5.4.92    | 原生 bundle SHA-256 `2d3041a085cbe475a63227ff40709f6d9c1595c77a58545c69edf359a57605a4`                                                                            |
| KD 5.5.6     | 2026-10-24 拉取官方 `5.5` 提交 `ffdbf9d89c45b8fc758fb5325028b48cf5a7e9a3`；隔离 bundle SHA-256 `34713e7d21e03da4e9f858aea69eacc76a5d8bd6c2a96a3e6c5a5f46fcf7f3be` |
| 矩阵实验脚本 | SHA-256 `eb612fe5dea56be173cae7b9f3d9b7dc874b30d6727495d1e1ee9365e7f624da`，对应记录中的 `analysisSha256`                                                         |

下表为完整套装中拆除最外层普通 Cocoon 的总世界回合，包含静候、恢复与延迟结算。两版结果一致，均拆除 Cocoon 并保留 23 件内层装备。

| 方法     | 密度 0 立即尝试 | 密度 300 立即尝试 | 密度 300 先等 22 回合 | 高密度实际精力支出，立即 / 等待 |
| -------- | --------------- | ----------------- | --------------------- | ------------------------------- |
| Cut      | 25              | 48                | 54                    | 4.8 / 3.2                       |
| Remove   | 28              | 71                | 62                    | 18 / 12                         |
| Struggle | 76              | 107               | 113                   | 40.5 / 36                       |

精力数字是内部 `KinkyDungeonStatStamina` 单位。总支出可以高于初始储量，因为等待会原生恢复。密度 300 在预先静候 22 回合后实测为约 150。各样本的意志支出为 0；这只描述本次默认新局 fixture，不概括其他构筑和版本。

单件与完整套装的 Cocoon 脱困时间在本次对应条件下相同；完整套装不会在脱茧时被一起删除。立即 Cut 在这组无敌人、有 Knife/Sharp 的样本中最快。先等待能节省三种方法的精力，Remove 的总时间也缩短，但 Cut 与 Struggle 的总时间增加。观察支持按方法比较静候策略，不支持给所有脱困方式统一增加等待期。

详细结果与逐步轨迹保留在此 checkout 的隔离目录：

- [5.4.92 结果](../../../.scratch/escape-analysis/baseline-20261024/result.json) 与 [汇总](../../../.scratch/escape-analysis/baseline-20261024/REPORT.md)。
- [5.5.6 结果](../../../.scratch/escape-analysis/github-20261024/result.json) 与 [汇总](../../../.scratch/escape-analysis/github-20261024/REPORT.md)。
- [复制存档与候选还原](../../../.scratch/escape-analysis/saved-seeded-smoke/result.json)：同一原生导出在两个明确重设的种子下，基础 Cut 均为 48 回合，临时 `speedMult.Cut = 1` 候选为 36 / 37 回合，还原基础值后均回到 48 回合。加载完成后核对了实际 RNG 种子。这个大幅候选用于验证入口和还原，不是调参建议。
- [失败分支](../../../.scratch/escape-analysis/edges-smoke/result.json)：无工具且无 Sharp 亲和的 Cut 为 `missing-tool`、0 回合；1 回合预算的高密度 Struggle 为 `turn-budget`，保留未脱困记录。

这些实验没有敌人修补、再次受击和四层围场离场。它们为 #76 提供拆茧与密度恢复的校准基线，尚不能关闭成熟路线验收。没有修改或发布新的运行时参数。

维护工具验证通过：新增工具回归 5 项、仓库政策测试 12 项、完整本地 watcher 1183 项，包检查器零错误、零警告；`kd-balance` 技能结构校验与 27 个相关本地文档链接检查通过。原生补充测试覆盖复制存档、候选参数还原、缺工具与截尾样本，范围如上。
