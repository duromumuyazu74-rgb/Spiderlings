# 构建依据与维护

核验日期：**2026-09-13**。这是维护技能时读取的资料，不是每次 KD 工作的前置步骤。

## Astra 指南

- [OpenAI 官方 Model guidance](https://developers.openai.com/api/docs/guides/latest-model)：本轮取得完整 Markdown，元数据明确 `gpt-6-astra`。采用清楚的完成范围、沿用已授权工作和按实际变化验证；主流程依赖工作区现有规则，不复制整份模型提示，也不改变模型配置或分派权限。
- [Eric Provencher 的 X 原文](https://x.com/pvncher/status/2095991462416490862)：直接 X 访问失败，经 [FxTwitter article 数据](https://api.fxtwitter.com/pvncher/status/2095991462416490862) 读取全部正文，并查看两张说明图。该镜像部分标点有编码损坏；同时完整读取 [OpenAI Developers 同题文章](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)，核心建议相符，措辞有编辑差异。采用简短、明确的触发描述和按需参考；去掉全任务强制读库、固定方案数量和中途审批。

以上是官方模型建议与作者建议；“两个新增技能，共享版本证据”的结构是本项目根据任务分工做出的设计判断，不是文章指定的结构。效果尚未经过模型 A/B 对比。

## 同类技能调查

读过下列作者仓库的 SKILL.md 正文，仅借鉴方法，未安装外部技能或复制其整套规则。

| 原始实现 | 值得采用 | KD 适配取舍 |
| --- | --- | --- |
| [LVTD：game-balance-economy](https://github.com/LVTD-LLC/skills/blob/main/skills/game-balance-economy/SKILL.md) | 从体验目标出发，梳理资源来源/消耗与参数表。 | 不固定每次输出五份模块，也不强制每次加载全部参考。KD 的控制、逃脱与回合成本需原生证据。 |
| [abagames：evaluating-gameplay-balance](https://github.com/abagames/agentic-gamedev-skills/blob/main/.agents/skills/evaluating-gameplay-balance/SKILL.md) | 比较策略，保存可比运行配置，并检查测试策略本身是否有效。 | 不采用固定 n、min–max 不重叠、强制三方案/三次放弃；不把得分比当通用 KD 目标。 |
| [abagames：implementing-gameplay-invariants](https://github.com/abagames/agentic-gamedev-skills/blob/main/.agents/skills/implementing-gameplay-invariants/SKILL.md) | 把玩法承诺落到状态、生命周期、事件身份和可观察规则。 | 采用“规则错误先于参数修正”的判断；不把短游戏的按键/得分规范硬套到 KD。 |
| [saschb2b：game-design](https://github.com/saschb2b/skills/blob/main/skills/productivity/game-design/SKILL.md) | 设计与引擎实现协作，深层资料按主题拆分。 | 它的广泛触发、概念签字流程和项目钩子不适合本任务；不新增通用设计套件。 |
| 本地 `kd-mod-development` | 已覆盖 Mod 实现、验证、文档和产品边界。 | 保留其职责，只新增机制与数值能力。项目根通过条件指针衔接，避免复制一套开发技能。 |

公开检索未找到可核实的 KD 专属机制/数值 Agent Skill；这是本次搜索范围内的结果，不是证明不存在。搜索词包括 `"SKILL.md" "game-design"`、`"SKILL.md" "game-balancing"`、`"Kinky Dungeon" agent skill`，目录网站仅作发现线索，判断以作者仓库正文为准。

## 可继续参考的一手材料

- [Hunicke、LeBlanc、Zubek：MDA](https://users.cs.northwestern.edu/~hunicke/MDA.pdf)：用机制、运行动态与玩家体验联系设计和实现。用于提出可观测目标，不作为 KD 公式来源。
- [Ian Schreiber：Game Balance Concepts，Level 3](https://gamebalanceconcepts.wordpress.com/2010/07/21/level-3-transitive-mechanics-and-cost-curves/)：比较成本、收益和成本曲线。KD 的原生对象可作为局部参照，不据此建立缺少依据的全局兑换率。
- [KD 作者 Buff 教程](https://itch.io/t/3869103/buffs)：提供 Buff 概念与原生入口；本技能中的精确行为由 5.4.92/5.5.0 实现核对。
- [KD 作者源码入口](https://itch.io/t/3869129/repo-and-clothes-template)、本地 `Game/Changelog.txt`、类型与原生数据表：建立版本档案和机制地图。
- [OpenAI Codex skill discovery 源码](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_roots.rs)：经 Context7 查询，确认项目 `.agents/skills` 发现位置；前置元数据与 `agents/openai.yaml` 按本机 `skill-creator` 定义校验。

## 为什么不拆出更多技能

版本判断是所有机制和数值任务的共同前提，放在 `kd-mechanics` 内共享。机制查询与数值设计有独立的用户请求和交付物，各自保留可自动触发入口。Buff/AI/地图等分支共享取证方法，作为按需机制地图；迁移仍使用同一证据链，暂不新增独立入口。

拆分条件是实际使用出现独立请求、稳定专门流程或主文件过载，而不是按每个子系统机械建技能。新增领域知识也先增加有证据的机制卡，避免把游戏源码抄成无法维护的静态百科。

## 更新与检验

目标补丁、相关文件指纹或运行观察变化时，只更新受影响的机制卡与适配结论。模型指南更新只有在技能维护任务中重新核实；不让普通 KD 调查先联网重读 Astra 文章。

技能维护后运行 `skill-creator/scripts/quick_validate.py`，在 Windows 上使用 `python -X utf8`。核对相对链接与默认调用元数据；有脚本改动时运行对应行为测试。对代表任务做路由与完成范围走查，并明确这是文档走查；只有实际执行的原生探针/模型试用才能称为相应行为测试。
