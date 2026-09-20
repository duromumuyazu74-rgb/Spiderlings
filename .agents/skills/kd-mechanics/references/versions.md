# 版本与证据

## 识别输入

记录目标游戏精确补丁、游戏根目录、Mod 版本/工作区状态、已加载补丁及设置。常用版本标记是 `Screens/MiniGame/KinkyDungeon/Text_KinkyDungeon.csv` 的 `KDVersionStr`；运行时再读 `TextGet("KDVersionStr")`。`package.json` 可能是桌面壳版本，文件夹名也可能过时。

源码版通常含 `Game/src/**/*.ts`、`Data/*.ts` 和 `Scripts/*.ts`；安装版可能只有 `out/main.js`。安装包运行文件是该环境的直接证据。TS 是可读的定义与实现依据；不要假定已有编译文件与 TS 同步。需要运行 TS 时，把输出定向到 scratch，依赖也在游戏目录外准备。

可用 [probe.py](../scripts/probe.py) 读取版本、相关文件 SHA-256 和符号位置，完全不执行游戏代码：

```powershell
python .agents/skills/kd-mechanics/scripts/probe.py --root 'KinkiestDungeon-5.5' --symbol KinkyDungeonTickBuffs --file Game/src/effect/KinkyDungeonBuffs.ts
python .agents/skills/kd-mechanics/scripts/probe.py --root 'C:/Game1/kinky-dungeon-win_64 (2)/resources/app' --symbol KinkyDungeonTickBuffs
```

脚本输出 JSON 到 stdout，有 `Game/src` 玩法 TS 时优先查源码；安装版只有零散 `Scripts` 时优先回退 `out/main.js`，跳过 `.d.ts` 类型声明。需要核对实际 bundle 时显式 `--file out/main.js`。符号搜索是词边界定位，包含调用处；用 `kind` 区分函数声明与其他引用，再读取上下文。`missing_symbols` 表示所选文件中未找到，不能据此判定整个游戏不存在。默认每符号显示 12 条命中，`total_matches` 与 `truncated` 提示是否需要扩大 `--limit`。

## 证据层次

| 层次 | 可以支持的结论 |
| --- | --- |
| 精确版本源码/安装 bundle | 该文件中实现、顺序、分支和常量；不能独自证明运行时加载了哪个覆盖。 |
| 原生函数探针 | 指定输入与显式替身依赖下的实际函数输出；不能代表完整游戏。 |
| 隔离游戏运行 | 所记录版本、设置、Mod 集合、初始状态和操作下的行为。 |
| 官方更新日志/作者教程 | 改动意图和查找线索；旧示例需要对应版本核对。 |
| 第三方 Mod、Wiki、历史调查 | 搜索入口与待验证假设；项目特例只属于其拥有者。 |

有效证据记录包含：结论、版本、相对文件路径与符号、必要行号、相关文件哈希或提交、前提、验证方式、日期、局限。行号是辅助定位，符号与文件身份更耐久。没有依据的状态写“待核实”；同名函数或无文本差异不等于依赖与调用时序相同。

## 本机已核实档案（2026-09-13）

| 档案 | 根目录提示 | 版本标记 | 用途 |
| --- | --- | --- | --- |
| 5.4 基线 | `C:/Game1/kinky-dungeon-win_64 (2)/resources/app` | `5.4.92` | `out/main.js` 原生执行代码，按只读输入处理。 |
| 5.5 对照 | 工作区 `KinkiestDungeon-5.5/` | `5.5.0` | TS 源码、类型、数据与作者更新日志，按根规则只读。 |

文件指纹见 [baseline.json](baseline.json)。这是建立技能时的快照，不是自动确认当前环境。输入变化时重新读取受影响文件，更新对应机制卡；旧结论保留原验证范围。

5.4.0–5.4.91、5.4.93 和其他补丁未在本技能中进行运行验证。涉及这些版本时寻找用户已有安装或作者仓库相应提交；没有目标版本也可先交付接口依赖和待验证项，不以 5.5 替代它。

## 官方入口

- [作者公布的源码位置](https://itch.io/t/3869129/repo-and-clothes-template) 指向 [KinkiestDungeon/newartwork](https://github.com/Ada18980/KinkiestDungeon/tree/newartwork)。分支会移动；历史调查固定 commit，核对版本文件后再引用。
- [作者 Mod 教程](https://itch.io/board/3693437/tutorials) 用于意图及接入示例。
- [mod.json 说明](https://itch.io/t/4135169/mod-json)：版本字段参与过时提示；`-1` 忽略相应字段。声明范围不构成兼容测试结论。
- 本地 `Game/Changelog.txt` 用于缩小补丁区间，特别是 5.4.46 的楼层类型变化提示；日志中的 TODO 不视为已经实现。
