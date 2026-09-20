# HTML 制作手册验证

日期：2026-09-12。成品：`production-plan.zh-CN.html`，7,262,707 字节。

验证命令：`node docs/spiderlings-spinner-capture/verify-plan.mjs`。

将成品复制为独立的 `standalone.html`，用 Chromium 离线模式打开。11 章、10 个 US 任务、36 项核对清单；章节锚点完整。页面脚本错误 0，HTTP / HTTPS 请求 0。

- 9 组规则场景通过：八回合成功、喝药后残留失败、提前耗尽、末次成功同时耗尽待定、费用不足待定、阻塞与半成品 / 快照、加固修复与警戒、混合整体脱困、参与人数与中途加入。
- 中文和英文均通过 A / B / C 视频加载、播放和 60% 定位；D 的 161 张帧全部加载，播放、暂停、拖动正常。
- 外层语言按钮与内嵌语言链接均正常；srcdoc 环境下不执行独立播放器的地址栏改写，保留独立 demo 与原媒体。
- 核对状态刷新后保留，JSON 导出及离线 Markdown 原稿下载正常。
- 390px / 320px 宽度没有页面整体横向溢出；说明表在自己的容器内横向滚动，可键盘聚焦。
- 人工查看桌面、移动端、行为模拟与内嵌动画截图；内嵌初始位置直接显示播放器。

机器结果：[results.json](../../.scratch/spiderlings-spinner-capture/plan-verification/results.json)。截图位于同目录的 `desktop.png`、`mobile.png`、`simulation.png`、`animation.png`。

这些结果验证文档与说明模拟。未实现新捕获玩法，未运行新机制的 KD 实机验收，未生成 Mod 安装包。现有动画原型的证据与限制在手册内嵌原稿中保留。

## 2026-09-12 粗蛛丝图解同步

制作计划正文、中英文内嵌演示、两份独立演示共用 `artist-thick-guide.mjs` 和 `artist-thick-guide.css`。构建计划会先重建独立演示，保证嵌入内容来自当前源码。正文四个按钮加载试片并定位到 72 / 98 / 150 / 160 帧；自由带尾、向上搭接和手机滚动修复均同步。

验证命令：`node docs/spiderlings-spinner-capture/verify-plan.mjs --sync`。离线单文件中的两个语言、四种试片、四项部件定位、320 / 390 / 1440px 显示通过；规则模拟、核对记录保存与导出、原稿下载通过。无脚本错误或外部网络请求。最终重建仅更新了内嵌 README，已比对其余内容与浏览器验证版本一致，且两种内嵌演示与独立 HTML 完全一致。

证据：`../../.scratch/spiderlings-spinner-capture/plan-sync-20260912/results.json`、`final-sync.json` 与同目录截图。此次验证针对离线说明页面，不是正式捕获 Mod 验收。
