# 旧 Spiderlings 拘束面原子退休

- 状态：已采纳
- 日期：2026-08-01

## 决策

新版 Lv1 不在旧 LooseWebbing、WebHeavy 或五模块实现上增量改造，而是在同一个可交付变更中原子替换整个 Spiderlings 拘束面：运行时入口、21 个旧 restraint、26 个旧 model、旧全局事件与 `TrapBindings` 包装、54 张退休拘束 PNG、旧 displacement、翻译、manifest/fileorder、三页旧 atlas、预览工具硬编码和旧测试一起退出。0.91.7 首次以八张交付 Lv1 图 direct 加载；后续 split-mitten 与 Cocoon TEST 修订形成 9 张 Lv1 runtime PNG + 1 张 Cocoon placeholder，共 10 个权威 direct fallback，并生成唯一的 `spiderlings-webbing-0` 派生 atlas。

所有新版 restraint/model 使用新 ID。Spinner、Jumper、WebCaster、残留 WebSpray 地面和玩家背包装备都通过新版共享状态模块处理；不存在候选时不得回退到 KD 原生随机拘束池或任何旧 Spiderlings 物品。新旧两套实现不得出现在同一个发行包。

## 历史素材例外与当前修订

早期曾允许旧 Cocoon5 图作为临时例外；该例外已被后续提交取代。当前唯一 TEST 是新建的 `Models/SpiderlingsWebbingDebug/TestPlaceholder.png`，只由 `SpiderlingsWebbingCocoonPlaceholderModel` 使用；Lv2 没有渲染层，旧 Cocoon5 restraint/model、Cocoon1–4 阶段、素材路径和 LooseWebbing 语义均保持退休。

## 保留边界与后果

五个现用敌人图和 `SpiderWeb`、`SpiderWebHit`、`WebSpray` 战斗素材不属于拘束美术，继续保留。未使用的 `SpinnerOLD`、`WebCast`、`WebCastHit` 可在独立清理中处理，不与本次原子切换混合。

仅移除 `mod.json` 条目不足以退休素材，旧文件必须物理离开模组包；旧 atlas 页面与旧递归图像构建器一并删除。当前构建器只消费 10 个明确路径，以 alpha 边界无损裁切到派生页，并用 `sourceSize` / `spriteSourceSize` 恢复原坐标；禁止缩放、旋转、重采样、调色或改写源 PNG。运行时 atlas-first、失败时 direct fallback。最终验收必须在全新 KD 进程和新存档中检查运行时注册、文件路径、manifest 与发布 ZIP 的条目清单；PNG payload 不作为视觉、像素、颜色、透明度、哈希或校验和验收对象。热重载会留下幽灵全局对象，不能作为唯一证据。
