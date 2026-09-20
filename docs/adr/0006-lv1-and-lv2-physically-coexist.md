# Lv1 与 Lv2 采用物理双层并存

- 状态：已采纳
- 日期：2026-08-01

2026-09-13 修订：下文的全身阶段门槛被 [ADR 0020](0020-independent-webbing-progression-and-caster-reinforcement.md) 取代；实体并存原则继续适用。历史数量保留在本文，当前 10/5/8 件目录见 Spiderlings 参数说明。

Spiderlings 的七个 Lv2 部位（Arm、Mitten Left、Mitten Right、Belly、Legs、Ankles、Foot）在进入 Lv2 时保留对应 Lv1，并新增一件独立 Lv2 拘束；Lv2 不替换 Lv1，也不在状态语义上自动代表 Lv1。Cocoon 因此要求 9 件 Lv1 与 7 件 Lv2 共 16 件物理内层同时存在。

该决定要求同一 KD Group 内的 Lv1/Lv2 使用明确的 Spiderlings-owned 动态链接关系，并要求进度逻辑扫描完整链接链而非只看最外层物品。Lv2 固定链接在同部位 Lv1 外侧；玩家必须先移除 Lv2，才能处理内层 Lv1。不得用原子替换、`tier >= N` 状态模型、反向链接或穿透外层的内层逃脱代替该双层结构。

Lv2 的敌方施加还受全局阶段门槛约束：只有 9 件 Lv1 全部真实存在后，后续敌方拘束才可选择 7 个缺失 Lv2；不允许敌方单部位提前升级或一次命中同时添加 Lv1 与 Lv2。该门槛不限制玩家从背包主动装备已经持有的物品，具体例外见 ADR 0007。

口部只有 Lv1 Stuffing 与 Lv1 Gag，不注册 Lv2 口部层。手套共享 `ItemHands`，其 Spiderlings-owned canonical chain 按 Left Lv1→Left Lv2→Right Lv1→Right Lv2 排列；其他同部位仍按 Lv1→Lv2。玩家装备后的规范化不得删除重建物品或重置实例状态。
