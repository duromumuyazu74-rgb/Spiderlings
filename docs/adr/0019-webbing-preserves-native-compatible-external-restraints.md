# 蛛丝与原生可兼容的外部拘束共存

2026-09-13，用户提供 KD 5.4.92、Spiderlings 0.92.21 的局内记录并要求修复同类部位问题。LatexArmbinder 与 WolfBallGag 均非护甲；原生允许新增蛛丝，但旧的护甲限定筛选分别挡住 Lv2 Arm 和 Lv3 Gag，导致整个 10/5/8 阶段链无法完成。

修订 [ADR 0018](0018-armour-webbing-preserves-armour-and-native-linking.md)：Lv1/Lv2/Lv3 和 Cocoon 的外部同槽物品统一以空 `KDGetBlockersToAddRestraint`、`KDCanAddRestraint(..., noOverpower=true)` 为准。外部护甲、普通拘束、混合链均可兼容；原生不允许时仍拒绝，不删除外部装备、不强制链接、不跳过缺失内层。

新穿戴保留外部实例、锁和进度。原生 unlink 重建刚露出的根时，对 Spiderlings 直接覆盖的所有外部装备恢复原实例；只在原生移除成功、重建名称与余下链接匹配时执行。其他外层装备的解除行为不变。自有装备规范化继续不重排混合外部链。

同次用户数值调整：全部八件 Lv3 拘束需要两次有效 Cut、Remove 或 Struggle，允许混合。power 仍为 3；Lv1/Lv2 保持 1/2 次。Cocoon 的逃脱与三次行动触发外围网规则保持现值。

验证依据：用户日志重建、所有自有组及 ItemDevices 的兼容/拒绝回归、原生 unlink 实例保留，以及八件 Lv3 的混合方法逃脱检查。记录见 `.scratch/spiderlings-cocoon-diagnosis-20260913/`。
