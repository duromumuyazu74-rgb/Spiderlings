# Spiderlings displacement 一次性实机原型

这个独立测试 Mod 只回答一个问题：在 KD 5.5 中，身体轮廓和紧身服装被 displacement 压入、被加强压入，以及服装被 `Encase` 隐藏，三种状态在实机里分别是什么样。

它复用游戏自带的 `Catsuit`、`YukataWaist` 窄束带和 `CorsetSquish`，不含 Spiderlings 正式美术，也不会修改 Spiderlings 的正式 Lv1/Lv2 行为。0.2.0 移除了会遮住形变的宽腰封，并故意放大强度，让挤压首先达到“肉眼能够确认存在”的程度。

## 使用

1. 在 KD Mod Loader 中安装并启用 `Spiderlings_Displacement_Prototype.zip`。
2. 进入一局游戏，打开开发者控制台。
3. 执行：

```js
KDDisplacementPrototype.prepare()
```

该命令会将四件可搜索物品加入 inventory，并自动穿上紧身测试衣。内部物品名是：

- `SpiderlingsDisplacementPrototypeTargetSkirt`（为兼容 0.1.0 测试存档保留旧 ID，0.2.0 中显示为紧身衣）
- `SpiderlingsDisplacementPrototypeLv1`
- `SpiderlingsDisplacementPrototypeLv2`
- `SpiderlingsDisplacementPrototypeLv3`

然后依次执行并观察角色腰部：

```js
KDDisplacementPrototype.clear() // 仅穿紧身衣的正常腰线基准
KDDisplacementPrototype.wear(1) // 明显压入，紧身衣仍存在
KDDisplacementPrototype.wear(2) // 极强压入，紧身衣仍存在
KDDisplacementPrototype.wear(3) // Encase 隐藏上下身服装
KDDisplacementPrototype.state() // 查看当前测试状态和参数
KDDisplacementPrototype.reset() // 脱下本原型穿上的测试物品
```

如果 `ItemTorso` 或 `ItemPelvis` 已被其他束缚占用，脚本会拒绝移除它们。请使用干净的测试存档，或自行脱下冲突物品后重试。

## 预期结论

- Lv1 和 Lv2 没有隐藏服装。观察束带左右两侧的腰线：紧身衣和身体轮廓都应向内凹入。
- 原版 `YukataWaist` 的强度是 150；这个诊断版 Lv1/Lv2 故意使用 300/600。它们是“证明效果存在”的放大参数，不是正式 Spiderlings 的推荐终值。
- Lv3 用 `EncaseTorsoUpper` 和 `EncaseTorsoLower` 隐藏测试服装。这一级只验证隐藏机制；因为原型仍然只有一条窄束带贴图，所以不会像完成版 Spiderlings 美术那样覆盖整个隐藏区域。

因此，如果目标是“Lv1 压入、Lv2 更强压入、Lv3 完全覆盖”，正式实现应让 Lv1/Lv2 保留 displacement 且不添加 `Encase`，到 Lv3 才同时添加完整覆盖贴图和 `Encase`。
