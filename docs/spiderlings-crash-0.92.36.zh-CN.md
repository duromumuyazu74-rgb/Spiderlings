# Spiderlings 0.92.36 / KD 5.5.3 召唤提示崩溃

修复交付：正式版 `Spiderlings_0.92.37.zip` 基于正式 `0.92.36`；开发线 `Spiderlings_0.92.36-test.8.zip` 保留 test.7 的 Spinner 功能并纳入同一修复。

## 原因与证据

用户报告只有 Spiderlings 0.92.36，游戏版本 5.5.3，Ghost 声望为 50。调用栈是 `KinkyDungeonBulletHit → KDGetGenericDialogueParams → KDIsSubbier → KDCanDom`，错误为 `enemy.Enemy is undefined`。

核对报告实际加载的 [5.5.3 main.js](https://html-classic.itch.zone/html/12466227-1966371/out/main.js)：

- 第 80104 行在成功召唤一个实体后构造提示，将查不到的召唤来源回退为 `KDPlayer()`。
- 第 134908 行为第二参数计算 `EHonorconditional`，调用新加入的 `KDIsSubbier`。
- 第 134956 行在 Ghost 声望不低于 -25 时把第二参数传给 `KDCanDom`。
- 第 47984 行直接读取 `enemy.Enemy.bound`；玩家实体只有 `player: true` 等字段，没有 NPC 的 `Enemy` 定义。

这是 KD 5.5.3 原生召唤提示与新称谓判断之间的参数兼容缺陷。玩家施法或施法者在延迟召唤落地前消失，都能走到该错误路径。打开门只是推进时间，让待处理召唤结算，并非门本身故障。

报告存档没有保留当次召唤弹丸，只剩五个 `SummonHit` 视觉弹丸，因此不能确认具体召唤法术或施法者消失原因。不能据此断言是喷网命中、Tunneler 死亡或存档损坏。

## 修复范围

`SpiderlingsCore.js` 仅在 `KDIsSubbier` 存在时包装它；第二参数为玩家时返回 false，避免调用 NPC 专用的支配关系判断。其他输入、调用上下文及额外参数传给原函数。保留玩家称谓、召唤提示、生成实体、数量限制和其余战斗流程，不改官方文件，不要求重开存档。没有该函数的旧版本不安装此包装。

## 验证

- 新回归先失败，堆栈重现 `Enemy.bound`，修复后通过。覆盖缺失、失效、玩家、NPC 来源，零／单个／多个生成数量，召唤前后事件与正常 NPC 文本判断，以及无该 helper 的旧运行时。
- 本地浏览器加载报告同址的实际 5.5.3 脚本及工作区只读资产。修复前直接调用原生提示生成函数重现相同行号的异常；修复后通过完整原生 `KinkyDungeonBulletHit`，缺失来源、失效 ID、玩家来源分别实际生成一个巢穴。
- 解码并加载报告存档，原生 `KinkyDungeonAdvanceTime(1)` 连续推进 30 回合成功；浏览器 `pageerror` 为零。这证明该存档可继续推进，不代表还原了崩溃发生前的所有操作。
- 两条交付线均执行构建脚本与最终 watcher；完整回归和 ZIP 清单检查结果保存在下述工作目录。

证据目录：`.scratch/spiderlings-crash-09236-20260914/`，包含 `red.txt`、`native.mjs`、`native-result.json` 和发布检查日志。用户原始存档及下载的完整游戏脚本仅作为本地诊断输入，不纳入提交或发布包。

实际下载脚本 SHA-256：`E8BEA29C4957EDE64F82ED6705C06BD1EA354759B485BB18B7B762BADFF3C82F`。工作区固定 5.5 源码没有新版 `KDIsSubbier`，仅跑原有固定版本测试不能覆盖此崩溃。
