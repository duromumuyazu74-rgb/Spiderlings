# Spinner 集体捕获制作手册

[打开详细策划案与制作计划](production-plan.zh-CN.html)

面向开发者与画师的单文件离线 HTML。包含当前规则、行为树、可操作规则模拟、中英文原生动画 demo、绘制分工、US-001–010 实现清单、验收场景、实施顺序、待定决定和原稿全文。可直接双击打开或单文件转发；动画区点击加载后准备内嵌媒体。

规则模拟使用显式标注的演示参数，不代表 KD 运行结果。正式捕获玩法仍待实现。原稿中尚未同步的说法在手册依据章列出，当前细丝工作量为仅绘制活动蛛丝线，粗丝需要新画部件和完成外观。

画师章节直接展示带面、活动带尾、搭接收口和 A07 完成外观的四项图解，各附绘制与分层说明。定位按钮会加载当前选定语言的内嵌试片，并暂停到对应画面；中英文独立演示与手册共用图解来源。

核对框保存在当前浏览器，可导出 JSON；它们不是正式开发状态。打印入口可展开任务验收供打印。原稿 Markdown 可以在离线页内下载。

从工作区根目录重新生成：

```powershell
node docs/spiderlings-spinner-capture/build-plan.mjs
node docs/spiderlings-spinner-capture/verify-plan.mjs
```

手册正文在 `source/content.mjs`，规则模拟在 `source/simulator.html` 与 `source/plan.js`，样式沿用 `source/plan.css`。构建器先运行 `.scratch/spiderlings-spinner-capture/build-artist-demo.mjs`，再读取最新中英文动画 HTML 与现有 PRD、对齐记录、画师说明。四项图解与样式共用该目录的 `artist-thick-guide.mjs`、`artist-thick-guide.css`；不重录媒体、不修改正式 Mod。

原 PRD：[PRD.md](../../.scratch/spiderlings-spinner-capture/PRD.md)；逐轮确认：[ALIGNMENT.zh-CN.md](../../.scratch/spiderlings-spinner-capture/ALIGNMENT.zh-CN.md)。
