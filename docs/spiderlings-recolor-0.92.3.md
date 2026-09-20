# Spiderlings 0.92.3 重上色素材替换

来源为再次更新的 `T's NEW Webbing (6).zip`，共 24 张 PNG。采用其中 23 张到既有运行时路径，沿用拘束、模型、姿势、图层与位移参数。安装包为 [Spiderlings_0.92.3.zip](../Spiderlings_0.92.3.zip)。本次补齐 Left hand、Right hand 和 (Outer webs) 的来源；此前版本记录见 [0.92.2](spiderlings-recolor-0.92.2.md)。

## 已采用

| 新包文件 | 运行时路径（相对 Spiderlings_0.91） |
| --- | --- |
| `1) Arm Webbing.png` | `Models/SpiderlingsWebbingLv1/ArmWebbing.png` |
| `1) Belly Wrapping.png` | `Models/SpiderlingsWebbingLv1/Belly.png` |
| `1) Leg Webbing.png` | `Models/SpiderlingsWebbingLv1/Legs.png` |
| `1) Ankle Webbing.png` | `Models/SpiderlingsWebbingLv1/Ankles.png` |
| `1) Foot Webbing.png` | `Models/SpiderlingsWebbingLv1/Foot.png` |
| `2) Arm Webbing.png` | `Models/SpiderlingsWebbingLv2/ArmWebbing.png` |
| `2) Belly Webbing.png` | `Models/SpiderlingsWebbingLv2/Belly.png` |
| `2) Leg Webbing.png` | `Models/SpiderlingsWebbingLv2/Legs.png` |
| `2) Ankle Webbing.png` | `Models/SpiderlingsWebbingLv2/Ankles.png` |
| `2) Foot Webbing.png` | `Models/SpiderlingsWebbingLv2/Foot.png` |
| `1) Blindfold Webbing.png` | `Models/SpiderlingsWebbingLv1/Blindfold.png` |
| `Mouth Filling Webbing.png` | `Models/SpiderlingsWebbingLv1/Stuffing.png` |
| `Gag Webbing.png` | `Models/SpiderlingsWebbingLv1/Gag.png` |
| `Full Arm Webbing.png` | `Models/SpiderlingsWebbingLv3/ArmWebbing.png` |
| `Full Belly Wrapping.png` | `Models/SpiderlingsWebbingLv3/Belly.png` |
| `Full Leg Webbing.png` | `Models/SpiderlingsWebbingLv3/Legs.png` |
| `Full Ankle Webbing.png` | `Models/SpiderlingsWebbingLv3/Ankles.png` |
| `Full Foot Webbing.png` | `Models/SpiderlingsWebbingLv3/Foot.png` |
| `Full Blindfold webbing.png` | `Models/SpiderlingsWebbingLv3/Blindfold.png` |
| `Full Mouth Web Gag.png` | `Models/SpiderlingsWebbingLv3/Gag.png` |
| `Left hand.png` | `Models/SpiderlingsWebbingLv1/MittenLeft.png` |
| `Right hand.png` | `Models/SpiderlingsWebbingLv1/MittenRight.png` |
| `(Outer webs).png` | `Models/SpiderlingsWebbingCocoon/OuterWebs.png` |

## 仍使用旧图

- `Full Webbing Hood.png`：新包仍未提供，保留 Lv3/Hood.png。
- `Cocoon.png`：新版与其余贴图合计的 frame 矩形面积（含一像素边距）为 18,553,476，超过现有 4096×4096 单页容量 16,777,216；替换全部素材时构建仍失败。保留旧 Cocoon 本体后可以打包其余 23 张，图集仍为 25 个 frame，发行清单仍为 60 个条目。
