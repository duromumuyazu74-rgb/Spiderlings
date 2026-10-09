# Spiderlings 文档

## 当前维护入口

| 需要了解的内容                 | 文档                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 当前候选、已完成工作与剩余验收 | [STATUS.md](STATUS.md)                                                                                        |
| 安装与玩家功能                 | [English](../README.md) / [简体中文](../README.zh-CN.md)                                                      |
| 模块职责、状态及原生接入       | [RUNTIME.md](RUNTIME.md)                                                                                      |
| 模块边界、定向测试与场景隔离   | [MODULES.md](MODULES.md)                                                                                      |
| 开发环境、测试命令与发布通道   | [DEVELOPMENT.md](DEVELOPMENT.md)                                                                              |
| 最终检查范围与提交规则         | [CONTRIBUTING.md](../CONTRIBUTING.md)                                                                         |
| 当前参数与玩法条件             | [参数说明](../KinkyDungeon-Spiderlings/Spiderlings_0.9_Parameter_Guide.md)                                    |
| 模型、素材和本地维护入口       | [MAINTENANCE.md](../KinkyDungeon-Spiderlings/MAINTENANCE.md)                                                  |
| 场地领域词汇 / 其他玩法背景    | [GLOSSARY.md](../KinkyDungeon-Spiderlings/GLOSSARY.md) / [CONTEXT.md](../KinkyDungeon-Spiderlings/CONTEXT.md) |
| 原生接入约束与美术来源         | [官方 Mod 接入](spiderlings-official-modding-guidance.md) / [Spinner 美术](spinner-stage-art.md)              |
| 游戏兼容证据 / 交付报告        | [COMPATIBILITY.md](COMPATIBILITY.md) / [DELIVERY-EVIDENCE.md](DELIVERY-EVIDENCE.md)                           |
| 后续任务 / 依赖维护            | [GitHub Issues](agents/issue-tracker.md) / [DEPENDENCIES.md](DEPENDENCIES.md)                                 |

当前文档描述生效行为，不追加逐版开发日志。修改职责时维护 RUNTIME 与 MODULES；修改数值时维护参数说明；修改交付门槛时维护 CONTRIBUTING。进度只在 STATUS 汇总。

## 历史资料

[历史索引](archive/README.md) 收录逐版修复、验收和已替代设计。它们按当时版本冻结，不作为当前规则，也不持续同步。

[ADR](adr/) 保留决策依据；[拓扑原型](prototypes/spinner-topology/README.md) 和 [早期捕获试玩](spiderlings-spinner-capture/PLAYTEST.zh-CN.md) 只解释各自实验。日期审查、调参报告和兼容记录中的旧数据同样只适用于原版本。历史本地证据路径可能指向维护者原 KD 工作区。
