# ADR 0005：Lv1 按成品边界独立建模（后续修订为九件）

- 状态：已采纳
- 日期：2026-08-09

Lv1 最初按 Arm Webbing、Web Mittens、Belly Wrap、Leg Wrappings、Ankle Webs、Foot Webbing、Web Mouth Stuffing 和 Gag Webbing 八张语义素材建模。后续运行时证据表明 KD 只有共享 `ItemHands` 组但可用明确 link chain 表达两只手，因此合并 Mittens 已修订为 `MittenLeft` 与 `MittenRight` 两件独立拘束。当前 Lv1 共 9 件，不再是本文件名保留的历史“八件”。

Arm Webbing 是 `ItemArms` Wristtie，只负责 `bindarms`，不绑定手。Mitten Left/Right 共享 `ItemHands` 并各贡献 `bindhands: 0.5`；它们不是 Arm 的附属层，可分别装备和解除。其余六件继续按各自素材边界占用 `ItemTorso`、`ItemLegs`、`ItemFeet`、`ItemBoots` 和两层 `ItemMouth`。

八张交付源图只来自 `T‘s NEW Webbing LV1/`；合并 Mittens 源画布形成保持原坐标与侧别像素的左右两张 runtime 图，因此当前 direct Lv1 runtime 输入为 9 张。集成和 atlas 不缩放、旋转、重采样、调色或执行图像内容验收。

该决定替代旧五模块方案；左右手拆分是其后续已实施修订，不改变 ADR 0003 的“仅支持新存档”决定。ADR 0006 确定 Lv1/Lv2 物理并存，ADR 0007 确定背包重复装备例外，ADR 0008 确定旧拘束面的原子退休。
