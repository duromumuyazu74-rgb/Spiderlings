# Spiderlings

[English](README.md) | **简体中文**

Spiderlings 为 Kinky Dungeon 增加幼蛛遭遇、分部位递进的蛛丝拘束、捕获场地与法师技能。Mod 设置可切换原色和粉色美术。

## 版本与安装

| 通道         | 版本             | 获取方式                                                                                                               |
| ------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 正式版       | `0.92.39`        | [下载可安装 ZIP](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/download/v0.92.39/Spiderlings_0.92.39.zip) |
| 巢穴监狱实验 | `prison.alpha.N` | 独立 [PR #77](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/77)，不包含在普通测试包中                         |

1. 下载[正式版 Release](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/latest) 的 ZIP 附件，或按[开发说明](docs/DEVELOPMENT.md)构建选定的开发候选。
2. 在游戏 Mod 管理器中载入该 ZIP。
3. 同时只启用一个 Spiderlings 包；切换版本前备份存档。

GitHub 自动生成的 Source code 压缩包是源码下载，不能直接载入为 Mod。PR 的 CI artifact 对应具体提交，属于候选包，其验收范围另行记录。

安装包已在 KD 5.4.92 和 [COMPATIBILITY.md](docs/COMPATIBILITY.md) 记录的官方 `5.5` 提交上验证。每次新运行时交付都重新拉取并测试最新官方 `5.5`。Manifest 的宽泛 5.x 提示不代表未测试版本也已兼容。源码、安装包和合并状态见[当前进度](docs/STATUS.md)。

## 当前玩法

场地保留已捕获猎物的归属，分配幼蛛主动攻击试图牵走猎物的 NPC，其他成员继续场地职责。玩家必须穿着腿套实际从场地内突破到场地外，才获得回收资格；单穿腿套或在场内偏离中心不会触发。已批准的接触通过原生付费攻击执行，回到最近可达场地的中心格。Maidforce 全派系及原生归属 Adventurer 的两种女仆骑士均与幼蛛敌对。

- 普通蛛丝按身体部位独立递进。Hood 开关、原生装备共存和 Cocoon 资格分别判断，具体数值与条件见[参数说明](KinkyDungeon-Spiderlings/Spiderlings_0.9_Parameter_Guide.md)。
- Spinner 付费建设、修复和开闭场地。总控处理增援与借调，各场地指挥自己的 Spinner。施工者、在途援兵和可用人手分别统计；优先合法大型多层围场，适用时回退通道场地。
- 捕获场地一至四层最低常驻分别为 1、3、6、10 名 Spinner。总控优先满足最低分配，再安排可选支援，出借保留供给场地的下限。本场地任务保留常驻归属，分配与实际到场分别统计。人口短缺时暂停新增独立工程。
- 新独立场地需要 `floor(n / 4)` 个人口许可，n 为存活且符合条件的敌对 Spinner，同时受默认三座的设置上限约束。许可数不覆盖设置值。角色靠近时，规划阶段提出待备需求；移动、战斗与 Capture 仍须满足各自原生条件。
- 侵扰有五个任务巢和两支初始三人队。猎场要求原生主派系为 Maidforce，有三支六人巢队，幼蛛上限为全局设置加二十。初始大型场地取决于合法空间与许可。两种楼层默认权重均为 200，权重表示符合条件时的抽选关系，不是全局出现百分比。
- Mage 的丝弹、符文、蚀盾咒印与坠牢分别维护技能状态和危险格反馈。魔典与法杖提供玩家蛛丝攻击及技能，原生日志收录六项幼蛛见闻。
- 合格 NPC 在连续六回合保持自有蛛丝控制后可非致命退场；挣脱或救援可以中断。捕获、恢复、原生伤害与死亡分别处理。

以上描述 0.92.39。旧版本和既有存档场景可能不同，逐版结果见[历史记录](docs/archive/README.md)。

## 开发与反馈

源码、运行素材和维护脚本位于 `KinkyDungeon-Spiderlings/`。

- [文档索引](docs/README.md)与[当前进度](docs/STATUS.md)
- [运行时模块](docs/RUNTIME.md)与[所有权契约](docs/MODULES.md)
- [开发、定向测试与打包](docs/DEVELOPMENT.md)
- [维护指南](KinkyDungeon-Spiderlings/MAINTENANCE.md)

开发中先运行 `npm run test:affected -- --base <起点提交> --plan` 查看范围；去掉 `--plan` 执行选中的公共测试，加 `--include-local` 执行选中的本地契约。原生场景仅作为建议列出。最终门禁由 [CONTRIBUTING.md](CONTRIBUTING.md#verification) 规定。

后续工作在 [GitHub Issues](https://github.com/duromumuyazu74-rgb/Spiderlings/issues) 跟踪。反馈尽量附上 Mod 版本、游戏版本和可复现的场景。

## 许可证

Chlorlne 的原创代码贡献采用 MIT。署名 T_Swizzle 的 Spiderlings 美术采用 CC BY-NC 4.0，允许署名后非商用复用。经剪辑的 ZapSplat 音效适用 [ZapSplat 标准许可证](https://www.zapsplat.com/license-type/standard-license/)。[授权范围](LICENSE.md)列出了适用文件和例外。其他贡献者的代码与 Kinky Dungeon 保留各自的条款。

## 作者与署名

美术素材：T_Swizzle。原 Mod 作者：anthropocentricity。重制作者：Chlorlne。保留 manifest 和源码中的既有署名。

音效来自 [ZapSplat](https://www.zapsplat.com/)；原始音效链接和修改说明见[第三方声明](THIRD-PARTY-NOTICES.md)。

Kinky Dungeon 原版代码与原生模板：Strait Laced Games LLC / Ada18980。授权边界见[第三方声明](THIRD-PARTY-NOTICES.md)。
