# Spiderlings

[English](README.md) | **简体中文**

Spiderlings 是适用于 Kinkiest Dungeon 5.4.x / 5.5.x 的 Mod，包含幼蛛遭遇、逐层蛛丝拘束、丝茧和可切换的粉色蛛丝外观。

## 下载与安装

1. 从[正式版 Release](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/latest) 下载 [Spiderlings_0.92.38.zip](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/download/v0.92.38/Spiderlings_0.92.38.zip)。
2. 在游戏 Mod 管理器中载入该 ZIP。
3. 同时只启用一个 Spiderlings 版本。

请使用 Release 附件中的安装包。GitHub 自动生成的 Source code 压缩包包含开发仓库，不能直接作为 Mod 载入。

## 版本

| 分支                                                                                  | 版本              | 用途                                                            |
| ------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| [`main`](https://github.com/duromumuyazu74-rgb/Spiderlings/tree/main)                 | `0.92.38`         | 正式版                                                          |
| [侵扰楼层 PR #83](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/83)          | `0.92.36-test.24` | 修复 Spinner 施工和守巢反击的普通侵扰楼层测试版                 |
| [头套与符文 Issue #84](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/84)   | `0.92.36-test.26` | 可关闭幼蛛头套、延迟一回合的 3×3 法师符文，取消法师手臂拘束     |
| [敌方蛛网素材 Issue #86](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/86) | `0.92.36-test.29` | Spinner 双配色、四角方向校正、WebCaster v2 效果及蛛网格颜色修复 |
| [侵扰总规格 #90](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/90)         | `0.92.36-test.31` | 三巢四守卫、全图布局、可扩展 Spinner 围场、蛛网移动与非致命缠裹 |

这个测试包包含三巢侵扰楼层改动，不包含独立开发的巢穴监狱。监狱实验版使用自己的 `prison.alpha.N` 版本序列；游戏中一次只启用一个 Spiderlings 包。

test.31 为三个原始侵扰任务巢各配四名守卫，三巢全部击破后才能下楼。Spinner 按真实行动建造最小 3×3 围场，并可逐圈扩展；移动幼蛛通过自有蛛网时加速。WebCaster 蛛丝可黏住敌对 NPC，相邻幼蛛随后可支付三次行动，非致命缠走合格目标。BlindZombie 可以被黏住，但不会被缠走。

测试分支沿用 `0.92.36` 正式基线，并已包含正式版 `0.92.38` 的兼容修复。它增加了实验性的 Spinner 捕获和 Mage Spiderlings。法师幼蛛会发射造成伤害的丝弹，并布置可见的符文陷阱。在 test.26 中，符文布置时显示发光蜘蛛图标；踩中后先警示 3×3 区域，一回合后对仍在范围内的目标施加蛛丝。新生成的普通地图达到第 5 层或有效安全等级 0 时，只要有合法空格且未超过幼蛛人口上限，就会有一只法师幼蛛。法师敌人的贴图已经换成专用素材。法师专用的手臂拘束已移除。Spiderlings 头套选项默认开启；关闭后即使没有选择原生 NoHood Perk 也不会穿戴自有头套，丝茧和满蛛丝开局仍可用。目前只有正式版发布 GitHub Release；测试包按[开发说明](docs/DEVELOPMENT.md)在本地构建。

test.28 为 Spinner 训练场边框和玩家牵引线加入 T_Swizzle 新交付的 Pink 图，校正边框四角方向，并将四种 WebCaster 弹体效果替换为 v2 Normal/Pink 成对素材。现有蛛丝颜色选项同时控制这些图。

test.29 让 Spinner 建成的蛛网格也按所选颜色显示，修复 Pink 模式下场地仍出现灰白蛛网的问题。

## 开发与反馈

源码、运行素材和构建检查脚本位于 `KinkyDungeon-Spiderlings/`。开发时可查阅[开发与发布说明](docs/DEVELOPMENT.md)、[维护说明](KinkyDungeon-Spiderlings/MAINTENANCE.md)和[玩法设计](docs/spiderlings-0.92-game-design.zh-CN.md)。

问题反馈和开发任务使用 [GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues)。

代码规范和 PR 流程见[贡献规范](CONTRIBUTING.md)。

## 许可证

Chlorlne 的原创代码贡献采用 MIT。署名 T_Swizzle 的 Spiderlings 美术采用 CC BY-NC 4.0，允许署名后非商用复用。经剪辑的 ZapSplat 音效适用 [ZapSplat 标准许可证](https://www.zapsplat.com/license-type/standard-license/)。[授权范围](LICENSE.md)列出了适用文件和例外。其他贡献者的代码与 Kinky Dungeon 保留各自的条款。

## 作者与署名

美术素材：T_Swizzle。原 Mod 作者：anthropocentricity。重制作者：Chlorlne。保留 manifest 和源码中的既有署名。

音效来自 [ZapSplat](https://www.zapsplat.com/)；原始音效链接和修改说明见[第三方声明](THIRD-PARTY-NOTICES.md)。

Kinky Dungeon 原版代码与原生模板：Strait Laced Games LLC / Ada18980。授权边界见[第三方声明](THIRD-PARTY-NOTICES.md)。
