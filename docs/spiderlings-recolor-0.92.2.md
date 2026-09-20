# Spiderlings 0.92.2 重上色素材替换

来源为工作区更新后的 `T's NEW Webbing (6).zip`。包内 20 张 PNG 直接采用到既有运行时路径，沿用拘束、模型、姿势、图层与位移参数。安装包为 [Spiderlings_0.92.2.zip](../Spiderlings_0.92.2.zip)。

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

## 已提供但本次未采用

`Cocoon.png`：使用新版丝茧时，25 个 frame 加一像素边距的矩形总面积为 18,553,476，超过 4096×4096 单页的 16,777,216，构建器报容量不足。保留旧丝茧后可正常构建。此次保留现有 `Models/SpiderlingsWebbingCocoon/Cocoon.png`，新版丝茧后续需单独处理；不能通过重新排列解决当前总面积超限。

## 新包缺项

| 未提供的素材 | 保留的现有贴图 |
| --- | --- |
| Web Mittens | Lv1/MittenLeft.png、Lv1/MittenRight.png |
| Full Webbing Hood | Lv3/Hood.png |
| OuterWebs（丝茧加固外围网） | SpiderlingsWebbingCocoon/OuterWebs.png |

这三类缺项共对应四张运行时贴图，加上暂未采用新版的丝茧本体，共五张贴图继续使用原有版本。图集仍包含全部 25 张 direct fallback，发行清单仍为 60 个条目。
