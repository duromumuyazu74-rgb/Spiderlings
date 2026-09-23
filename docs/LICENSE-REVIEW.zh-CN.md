# Spiderlings 许可证调查，2026-09-22

## 2026-09-23 授权决定

维护者选择分项授权，现行范围见根目录 [LICENSE.md](../LICENSE.md)：Chlorlne 的原创代码贡献采用 MIT；列明路径内署名 T_Swizzle 的 Spiderlings 美术采用 CC BY-NC 4.0。四个外部音效来自 ZapSplat，适用该站现行标准许可证，而非 CC BY-NC 4.0。文档、其他作者的代码和 Kinky Dungeon 原版内容不随之改许可。混合文件只对维护者拥有权利的贡献适用 MIT。以下保留 2026-09-22 调查时的状态与依据，不作为当前授权声明。

## 2026-09-23 ZapSplat 音效核查

维护者提供的[原检索链接](https://www.zapsplat.com/?s=spider&registration_redirect=1&item_id=6169)指向 ZapSplat。站内与四个 OGG 文件名相符的系列为“Thick cobwebs sweep away with hand”[1](https://www.zapsplat.com/music/thick-cobwebs-sweep-away-with-hand-1/)、[2](https://www.zapsplat.com/music/thick-cobwebs-sweep-away-with-hand-2/)、[3](https://www.zapsplat.com/music/thick-cobwebs-sweep-away-with-hand-3/)、[4](https://www.zapsplat.com/music/thick-cobwebs-sweep-away-with-hand-4/)。维护者已剪辑、转码；现有 OGG 元数据没有可用于逐文件校验原始下载的来源标记，因此系列匹配依据为维护者提供的来源和文件名。

ZapSplat 的[标准许可证](https://www.zapsplat.com/license-type/standard-license/)（页面标注 2026-05-08 更新）允许将音效用于游戏并在项目内剪辑、改作；Basic 用户须署名，Premium 用户免署名。其[署名说明](https://www.zapsplat.com/how-to-credit-us/)建议在项目说明、游戏鸣谢等处以文字和链接署名。标准许可证同时限制把音效作为独立文件再分发，不能因剪辑、转码就将其改标为 CC BY-NC 4.0。现有四个 OGG 独立存在于公开源码与安装 ZIP，能否按该条款继续分发尚未确认。根目录 LICENSE 和第三方声明只标明已知来源和条款，不代表 ZapSplat 对此分发方式另行授权。

## 2026-09-22 调查记录

建议先保留分项授权，暂不为整个仓库添加 MIT 或 GPL。对明确属于维护者原创的独立代码，可以选择 MIT；原版游戏片段、继承的 Spiderlings 代码和美术必须分别保留其权利人的条件。署名不能代替再许可授权。

## 原版游戏实际采用的条款

核对了本地只读 KD 5.5.0 的 README、package.json，以及官方 `Ada18980/KinkiestDungeon` 的 `5.5` 分支，固定到提交 `1970807cc663bfd7ac55bfd46c814c4e8677655c`。

官方 package.json 标记为 `All Rights Reserved`。官方 README 允许下载、个人修改和为游戏开发内容，并单独允许将部分代码作为 Mod 再分发，但要求免费开放且署名 Strait Laced Games LLC。它禁止完整重新托管源码、收费提供源码或修改版、冒认作者，以及未经许可使用游戏素材。允许就自制 Mod 接受捐赠。

README 后半段的 Kinky Contributor License 是向 Ada18980／其公司授予游戏贡献使用权的条款，不能简单复制成自己的 Mod LICENSE。其第 2 条明确说：自己的原创作品可以选择自己的许可证，但该许可证不适用于 Kinky Dungeon 本身或其代码。因此它没有要求独立原创 Mod 代码一律采用相同许可证，也没有允许把原版片段重新许可为 MIT。

## 仓库中与原版代码的关系

| 位置                                                                                        | 可以确认的关系                                                           | 交付范围                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| `KinkyDungeon-Spiderlings/tools/tests/spiderlings-encounters.test.js` 的 `native553Subbier` | 注明 KD 5.5.3 来源的 `KDIsSubbier` 原生回归片段                          | 仓库内测试代码，不进入安装 ZIP                 |
| 多个 `tools/tests/*.test.js`                                                                | 从外部 `gamePath(...)` 读取原版函数，去除 TypeScript 类型后验证契约      | 原版文件未复制进仓库或 ZIP                     |
| `SpiderlingsSpinnerNativeField.js` 的 IceWall 定义扩展                                      | 从运行中的 `KinkyDungeonEnemies` 取得原生模板并扩展成 Mod 拥有的蛛网代理 | Mod 适配代码进入测试 ZIP；不是打包整个原生文件 |
| `SpiderlingsSpinnerRecovery.js` 的 BasicLeash 载体                                          | 使用原生拘束定义和添加／牵引接口                                         | Mod 适配代码进入测试 ZIP                       |
| `SpiderlingsCore.js`、`Spiderlings.js` 等包装器                                             | 调用并包装游戏提供的函数，未把所调用函数的完整实现随接口引用打包         | Mod 自己的包装代码进入 ZIP                     |

所以，仓库确实使用原版代码，并包含明确标注来源的原生片段。“调用接口”“运行时读取模板”“复制实现”是不同情况，不能仅凭函数名相同认定整份文件都是复制，也不能因安装 ZIP 未带官方文件就宣称全仓库纯原创。本次没有完成每一行历史代码的版权溯源。

旧 Spiderlings 保留了 anthropocentricity 的原作者署名。当前仓库和可用历史快照中没有查到一份明确允许维护者把其所有代码改为 MIT／GPL 的原作者许可证。T_Swizzle 的美术署名也不能视为授予任意再分发、商用或改作权。已有游戏发布使用许可与允许整个素材目录作为通用素材包分发不是同一件事。

## 可选方案

| 方案                                               | 适用情况                                                   | 目前结论                                                   |
| -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| 原创代码 MIT，原版／继承代码和美术单列例外         | 希望原创工具和新模块方便复用，且能确认各部分作者或取得授权 | 推荐的长期方向；先划清范围，再添加许可证                   |
| 自有内容保留权利，以明确的免费 KD Mod 使用条件提供 | 暂时不打算授予通用开源复用，或原作者授权尚未补齐           | 目前更稳妥；仍需遵守原版片段与素材本身的授权               |
| 整仓库 MIT 或 GPL                                  | 已有权利人的完整兼容授权，或已经移除／重写不兼容部分       | 目前不建议。原版限制收费的条件不能被一个通用开源许可证覆盖 |

本次新增 `THIRD-PARTY-NOTICES.md` 并补充原版游戏署名，未擅自添加 blanket LICENSE。下一步需要确认原 Mod 作者和美术作者的实际授权范围，以及维护者希望对自己的原创代码允许哪些用途。

## 建议的实际处理顺序

1. 现在保留 `THIRD-PARTY-NOTICES.md` 和 README 中的完整署名，不给整仓添加 MIT／GPL，也不把 Kinky Contributor License 原样当成 Mod 的许可证。GitHub 暂时显示没有标准 LICENSE，准确反映了尚未统一的授权状态。
2. 向原 Mod 作者确认是否允许修改、公开源码、再分发，以及是否明确允许将其贡献按 MIT 再许可。只有“可以继续维护”或“记得署名”不足以推出可改成 MIT。
3. 向美术作者确认免费 Mod 安装包、公开 Git 仓库中的 PNG、适配／改色、独立素材再分发各自的许可范围。美术可以保留权利或另用作者指定条款，不必随代码采用 MIT。原版游戏素材如有实际采用，也须有原版权利人的许可。
4. 核清后，给你拥有权利或已取得明确再许可授权的原创代码采用 MIT，并在根许可说明中列出不适用 MIT 的路径和来源。包含原生摘录的测试文件、继承但授权未明的旧代码、第三方美术不能因目录归类而自动变成 MIT。

可向代码作者明确询问：“是否允许我将您在 Spiderlings 中的代码及我的后续修改，以 MIT 许可证公开分发，保留您的版权和署名，并单独遵守 Kinky Dungeon 原版代码的条款？”美术授权应另行确认，不与这句话合并。本次未联系任何作者，也未替任何作者作出授权决定。

## 一手依据

- [官方 README，固定提交](https://github.com/Ada18980/KinkiestDungeon/blob/1970807cc663bfd7ac55bfd46c814c4e8677655c/README.md)。
- [官方 package.json，固定提交](https://github.com/Ada18980/KinkiestDungeon/blob/1970807cc663bfd7ac55bfd46c814c4e8677655c/package.json)。
- [Spiderlings 上次审查后的原作者与美术署名](https://github.com/duromumuyazu74-rgb/Spiderlings/blob/f0346a8c29c62c5c9848189eb36ae87755a92f26/Spiderlings_0.91/mod.json)。
- 本仓库上述源文件和测试，按路径可复核。此文记录授权依据与待决项，不代替权利人的许可。
