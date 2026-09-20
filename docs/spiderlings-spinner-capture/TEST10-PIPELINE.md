# test.10：实际素材替换流程

版本 `0.92.36-test.10`，正式基线 `0.92.36`。用户要求使用 Image Gen 生成测试图，并建立画师可直接替图的流程。本次生成的 PNG 保留工具输出原始字节；完整提示词、选图与参考关系见 [生成记录](test10-imagegen-prompts.json)。画师的 Cocoon 裁片仍未交付。

## 四个实际文件

目录：`Spiderlings_0.91/Models/SpiderlingsSpinnerLegbinder/`。同目录的中英文 README 含实际原图、取图框、绘图要求、游戏渲染和替换步骤。

| 文件 | 透明画布 | 取图框 x/y/w/h | 用途 |
| --- | --- | --- | --- |
| Band.png | 2172×724 | 0/132/2172/468 | 每圈带面、半成品 |
| Tail.png | 2172×724 | 0/195/2140/400 | 左端连接、右端自由的活动尾 |
| Finished.png | 1024×1536 | 210/30/605/1490 | 完成袋体 |
| Closure.png | 2172×724 | 35/85/2105/530 | 大腿顶部前缘 |

这四张是局部素材，不使用旧交接页要求的 2480×3508 全身导出画布。PNG 大小、取图框与摆放位置固定；JS 负责在人物坐标系定位与变形。替换相同规格原图无需调整脚本、manifest 或共用 Webbing 图集。粉色选项对同图染色；当前没有独立 Pink 四图。Cocoon 和其他装备原图保持原用途。

`SpiderlingsSpinnerArt.js` 以直接 PNG 创建纹理网格。Band 沿螺旋路径逐段出现，Tail 跟随前沿并切换前后层；中断隐藏 Tail、保留已有 Band。最终 8% 进度淡入 Finished 和 Closure。装载顺序为四张图 → Art → Capture。复制人物容器变换，用 `c.Zoom * MODEL_SCALE` 得到人物源坐标缩放。

## 交付

- `Spiderlings_0.92.36-test.10.zip`：100 个显式允许的运行文件，可直接安装。
- `Spiderlings_0.92.36-test.10-artist-kit.zip`：四张可编辑原图、中英图示说明、Base-Mod.zip、预览打包脚本。
- 双击画师包的 `BUILD-PREVIEW.cmd`：验证 RGBA PNG 尺寸后，仅用四张文件替换 Base-Mod.zip 中对应条目，输出 Preview.zip。重新加载游戏后仅启用 Preview.zip。脚本不需要 Node、Python 或美术工具依赖。

构建来源：`tools/build-spiderlings-release.ps1`、`tools/build-spinner-artist-kit.py`。维护脚本、README 和画师说明不进入可安装 Mod ZIP。

## 验证依据

可复跑脚本与记录放在 `.scratch/spiderlings-spinner-art-test10/`。

- `native.mjs`：真实 KD 5.4.92、5.5.3 加载 ZIP，四个 PNG 解码；通过实际 Spinner 事件进入对抗、40% 包裹、中断保留，再验证五世界回合依次 20/40/60/80/100% 完成、原色及粉色角色渲染。
- `replacement.mjs`：五份实际 ZIP，基准包与四份各只更换一张 PNG 的变体。所有 JS 和 manifest 相同。实际 PIXI 像素结果证明 Band 只改变缠绕／半成品，Tail 只改变活动阶段，Finished 和 Closure 只改变完成阶段；共 12 组差异／不变断言通过。
- `spiderlings-spinner-art.test.js`：直接 PNG 加载与清单顺序、前后切换、完成／中断、粉色、重建后保留共享纹理、错误画布尺寸，共 3 项。
- 原生测试环境已知缺少 `/Game/Locks/Red.png`，与四张新图无关；5.4.92 音效可能报告播放被暂停。新图无加载失败，5.5.3 本轮角色渲染无页面异常。

本轮验证覆盖默认角色衣装和上述阶段。测试图不是画师风格定稿；所有衣装／姿态的完整组合没有逐一验收。M01–M04 地图素材仍需单独接入，不能照腿袋四图的路径直接替换。
