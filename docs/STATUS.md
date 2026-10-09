# 当前开发与发布进度

核对日期：2026-10-09。任务完成条件和发布状态以 GitHub Issues、PR 与 Release 为准。

## 0.92.39fix1 正式修复版

[Issue #154](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/154) 的角点维修遗漏和坍塌丝墙无效重建任务已修复，[PR #155](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/155) 已合入 `main`。正式 [0.92.39fix1](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.39fix1) 使用提交 `030038593be73c2f0823b66e53cc59507bbd8a66` 的 CI 安装包，上传后的下载文件已核对一致。

同一正式包通过 KD 5.4.92 与最新拉取的官方 5.5.3 完整原生验收，以及 12 项策略测试、788 项公共测试和 1,117 项完整本地回归。最新存档回放 24 回合后完成两处外圈角点维修，施工不再反复返回 invalid。包哈希、官方提交及验收范围见 [COMPATIBILITY.md](COMPATIBILITY.md)。

## 0.92.39 正式晋升

[Issue #150](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/150) 跟踪本次全面审查、主线晋升与发布。审查发现的 Mage 目标分类遗漏已修复，失效的策划演示维护脚本已移除，历史 HTML 与验证记录保留。

[PR #149](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/149) 已合入 `test`，提交 `d1358b1c95c7a8505be1794648ad724bf443e321` 的文件树与已验收源码 `c54dd02` 一致。正式源码使用 0.92.39，从当前 main 历史晋升；[0.92.39](https://github.com/duromumuyazu74-rgb/Spiderlings/releases/tag/v0.92.39) 已完成正式 main CI 附件的双版本验收、发布及下载核验。

## 已完成的玩法与验证

- Spinner 建设、修复与运作多层场地，主控统一增援和借调，场地直接决定成员职责。最低常驻按 L*(L+1)/2 计算，一至三层为 1、3、6；人口许可 floor(n/4) 与设置上限分别生效。短缺、在途、任务外出及实际到场分别统计。
- 场地保留已捕获猎物归属并安排幼蛛攻击竞争牵引者。玩家穿腿套真实越界后才获得回收资格，再经有效接触牵回最近可达中心；部分 Capture 中越界、已批准冲刺、指挥交接和运输目的地均保留各自状态。
- Mage 丝球、符文及范围法术共用女仆身份，包含原生 Adventurer 派系的两种女仆骑士，并处理场地批准的牵引拦截目标。原生敌意、护盾、抗性及动作费用继续约束实际执行。
- 侵扰、猎场、NPC 协作、蛛丝武器、七语言文本、日志和美术随本次正式晋升交付。独立巢穴监狱不包含在其中。

审查基准 test.152 在 KD 5.4.92 与新拉取的官方 5.5.3 各通过全部 63 项原生检查及七种语言加载；12 项策略测试、785 项公共测试、1,114 项完整本地回归与包核对通过。正式包的精确验证随后记录在 [COMPATIBILITY.md](COMPATIBILITY.md)。[发布审查](archive/validation/spiderlings-0.92.39-review.zh-CN.md)保留发现和复现依据，[test.151 记录](archive/validation/spiderlings-test151-residency.zh-CN.md)保留常驻及最新存档的具体证据。

## 仍独立跟踪的范围

- [Issue #127](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/127) 保持 needs-info。较早的停工截图尚未匹配其原始存档，其他存档成功不替代这条验收。
- [巢穴监狱 #68–76](https://github.com/duromumuyazu74-rgb/Spiderlings/issues/68) 和 [PR #77](https://github.com/duromumuyazu74-rgb/Spiderlings/pull/77) 属于独立实验线。
- 依赖更新 PR 保持各自审查范围；旧候选 PR 只在核对全部改动确已集成后收尾。

职责和后续修改入口见 [MODULES.md](MODULES.md)、[RUNTIME.md](RUNTIME.md)与[开发说明](DEVELOPMENT.md)。47 个运行时脚本均有测试映射，已识别行为改动可选择相关验证；最终发布仍使用完整同包验收。
