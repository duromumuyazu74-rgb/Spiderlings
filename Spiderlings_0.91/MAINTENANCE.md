# Spiderlings 0.92.36-test.11 维护说明

test.11 采用五份 `T's Enemies` 交付包的新怪物图。Spinner、Tunneler、WebCaster、NestEntrance 的本体与原色／粉色蛛丝层按原始画布坐标做 alpha 合成，输出 `Enemies/<name>.png` 与 `Enemies/<name>Pink.png`；不缩放、移位或重新调色。Jumper 包只有成图，两种设置共用原样采用的 `Enemies/Jumper.png`。原始图层、采用脚本及验证记录保存在 `.scratch/spiderlings-enemy-art-20260920/`。

现有 `spiderlingsPinkWebbing` 设置同时控制拘束、投射物与四种带蛛丝的怪物外观。`SpiderlingsModelRuntime.js` 在原生 `KDDraw` 入口按当前设置选择对应 PNG，已有地图实体在下一次绘制时换色；敌人名称、存档实体和玩法参数不变。九张敌人 PNG 在脚本前显式登记，不进入拘束 atlas。安装包为 `Spiderlings_0.92.36-test.11.zip`，正式基线仍为 `0.92.36`。

以下 test.10 条目保留其交付记录。

test.10 将 Spinner 立绘包裹改为实际 PNG 测试素材。`Models/SpiderlingsSpinnerLegbinder/` 中的 Band、Tail、Finished、Closure 四张原图由 Image Gen 生成，直接加载，不进入共用蛛丝图集。`SpiderlingsSpinnerArt.js` 在 Capture 之前加载，负责纹理网格、前后层与成品衔接；粉色由同图染色。局部画布与取图框见目录内双语 README；更换同规格四图无需改代码或重建图集。`tools/artist-kit/` 提供独立画师包的预览打包脚本，不随可安装 ZIP 发布。地图四项仍沿用 test.9 的占位接入。交接与验证见 [画师说明](../docs/spiderlings-spinner-capture/ARTIST-HANDOFF.html) 和 [test.10 记录](../docs/spiderlings-spinner-capture/TEST10-PIPELINE.md)。

0.92.36-test.9：修复 KD 5.5.3 原生警报只更新发信者、遗漏接收者的实体目标记录。复用原生实际接收者列表同步追踪坐标／ID，保留感知筛选、afterSignal 改向、蛛丝禁言和旧版本路径。同时为原地掘巢召唤补齐 noSprite 标记，避免请求不存在的 SummonNestEntrance.png；巢穴生成、引导、提示和音效不变。外观颜色没有变化时不再从每件装备的 afterDress 事件反复清空原生模型缓存；读档旧颜色修正、换色和纹理解码完成后的刷新仍保留。兼容与整体验证记录见 `docs/spiderlings-full-review-0.92.38.zh-CN.md`。

0.92.36-test.8：修复 KD 5.5.3 召唤成功提示的玩家回退对象导致 `KDCanDom` 读取不存在的 `Enemy.bound` 而崩溃。仅在原生 `KDIsSubbier` 存在时包装它：第二参数为玩家则返回 false，NPC、空参数与其余参数完整交回原函数。召唤、提示及玩家称谓保留，无存档迁移。使用报告中同址 5.5.3 脚本复现异常，修复后缺失／失效／玩家来源的真实召唤各成功一次，报告存档加载并推进 30 回合无异常。证据见 `docs/spiderlings-crash-0.92.36.zh-CN.md`。

以下内容保留原有功能与历史交付记录。

当前测试版以 0.92.36 为正式基线。Spinner 先放四处地面陷阱，再连接已有陷阱拦截玩家退路，按最近移动方向优先封边。四条连接完整、玩家仍在内部、至少两只合法近战 Spinner 才开始对抗。进入对抗即强制并腿，方案 D 的粗蛛丝宽带逐圈缠绕，预览不施加装备。拘束目标 100，两只每世界回合 +12.5（八回合）、额外每只 +4；挣脱目标 75、额外每只 +25，一次有效挣脱 +25。中途增援保留进度，失败后固定五回合实际施加。 场地元数据与连接结点随原生存档保存；旧围场缺少连接结构时解除控制，保留已有物品。玩法、限制和验收见 [试玩说明](../docs/spiderlings-spinner-capture/PLAYTEST.zh-CN.md)。

以下为 test.2 历史记录。

当前测试源码与包为 `0.92.36-test.2`，正式基线为 `0.92.36`。`SpiderlingsSpinnerField.js` 在 Capture 后加载；可选起始 Perk 进入独立 31×21 平坦场地，两个真实 Spinner 使用移动／行动预算逐步布置 7×7 可破坏围网，留下西侧入口和地面触发丝。结点是原生可攻击占格实体（HP 2／弱点 0.5），所有权保存在场地地图数据中；破坏、结束或离图仅清理本轮结点。

Spinner 玩家和 NPC 近战均不因施网成功退场；正常战败仍有效。场地准备与等待协作期间不施普通腿网，对抗仅绘制独立半透明预览与活动白线。失败后五世界回合依次施加 20% 至 100% 的同一腿袋。捕获预览在原生模型子网格上方使用自有渲染纹理；渲染只插值，不改变装备或回合。场地／阶段／结点／物品随原生存档保留；重置与放出 Jumper 使用可点击的场内按钮。当前步骤、限制和分版本验证见 [试玩说明](../docs/spiderlings-spinner-capture/PLAYTEST.zh-CN.md)。

以下 test.1 条目保留历史交付事实，当前规则以本节和试玩说明为准。

当前测试源码为 `0.92.36-test.1`，正式基线为 `0.92.36`。Spinner 腿袋 demo 的玩法、素材坐标、实机矩阵和安装步骤见 [试玩交付说明](../docs/spiderlings-spinner-capture/PLAYTEST.zh-CN.md)。`SpiderlingsSpinnerCapture.js` 在 Webbing 与 Jumper 后加载，负责独立腿袋、四回合对抗、两回合自动缠绕及原生存档恢复。普通 Spinner 仅推进 Legs／Ankles／Foot，不能新结全身茧；既有丝茧修补继续生效。完整与半程腿袋都阻止重复协作；不兼容的外部装备沿用原生拒绝。

腿袋图像为运行时纹理视图：完整裁剪自原图 y=1880，半程 y=2540，保留 2480×3508 画布及原始坐标。两色 atlas 和直接 PNG 采用同一裁剪，无源图改写。直接 PNG 必须使用原生 `modTextureLoader` 的显式 PNG 描述，不能按无扩展名 blob URL 推测加载器。连接线固定 #FFFFFF。失败计时属于世界回合；Jumper 玩家目标的预警在此遭遇范围仅由真实输入消费，自动两回合和多回合动作的延迟 tick 不消费额外机会。

0.92.36 修复加固丝茧中等待仍阻止据点撤退：`Webbing.isCocoonPassive()` 从真实丝茧装备、当前行动、警戒活动与待加固状态判断玩家是否停止反抗，供整个据点（包括任务巢穴）共用。首个 Wait 即可累计十五回合安静；不额外等待 25 回合散开警戒。攻击、挣扎、施法、被阻挡的移动尝试以及未完成加固仍打断计时；正常玩家和可反抗 NPC 保留威胁判定。该查询兼顾 tick 前的 LastAction 和 tickAfter 前原生清空 LastAction 的时序。旧侵扰存档直接生效，原有 25 回合散开移动规则保持。用户 5.4.92 日志与双版本复核见 `.scratch/spiderlings-cocoon-retirement-20260913/`。

0.92.35 修复双向寻敌与安静驻守：闲逛幼蛛也会接近可达的女仆，幼蛛／巢穴自身感知可唤醒画面外选敌；撤退只由附近可感知、可反抗目标打断，排除原生 helpless／监禁／眩晕／冻结／noAttack NPC。新增蛛丝封口，以自有攻击实际增加 Slime 束缚记录来源，helpless 时阻止发声与两类求救，恢复反抗后恢复，Slime 耗尽后清理；来源字段随实体保存，旧存档无来源 Slime 不推断归属。参数与验证见当前参数说明及 `.scratch/spiderlings-rival-retirement-20260913/`。以下 0.92.34 发布前条目保留历史范围。

左右 Lv1 蛛丝手套可绕过束臂袋、紧身衣等造成的手部施加阻挡；同槽仍须通过原生无覆盖链接检查，保留原有装备、锁和脱困进度。此规则只影响施加，脱困操作与丝茧门禁仍沿用原规则。

0.92.34 发布前结茧条件调整：自动结茧只要求八件 Lv3 真实装备，不再检查 Lv1／Lv2 齐套。命中前五层喷网减速、允许的直接来源及原生装备许可仍须满足；补齐最后 Lv3 的同次命中不结茧。

当前布局恢复 3＋2：组内欧氏距离 4～5 格、跨组最近距离 6～8 格，三巢组／两巢组仅计任务巢时每巢合格增援概率为 35%／25%。分别清理每组空地，额外检查新地面绕开巢穴可达；整片仍共用十五回合安静留五只，旧图不重排。后文圆环条目为历史实施记录。验证见 `.scratch/spiderlings-groups-return-20260913/`。

0.92.34 据点复审：清墙新增原生八方向可达性边界，保留锁门后封闭区域的围墙；撤离检查包含群体内部敌意，并同时采样回合开始／结束，避免有交战的回合被算作安静。三个新增回归先失败后通过；复审证据见 `.scratch/spiderlings-clearing-review-20260913/`。仍按用户授权覆盖未发布的同版本包。

0.92.34 发布前据点补充：新五巢圆环清理内外一格的普通墙体与碎石，保留任务／交互格并刷新导航；旧图不改地形。原始圆环 12 格内野生蜘蛛共享安静计时，附近连续无敌对玩家或 NPC 15 回合后非击杀撤离多余者，留最近 5 只；友方、被俘、远处蜘蛛与巢穴保留。计时随地图保存，不返还累计掘穴额度。规则和验证见参数手册及 `.scratch/spiderlings-clearing-retirement-20260913/`；沿用用户同版本覆盖与原色默认。

当前正式基线为 `0.92.36`，源码目录保留 `Spiderlings_0.91/`，安装包为工作区根目录 [Spiderlings_0.92.36.zip](../Spiderlings_0.92.36.zip)。核验游戏为只读 `KinkiestDungeon-5.5/` 和本机 KD 5.4.92，不代表全部 5.4 玩法兼容认证。玩法与数值见 [参数说明](Spiderlings_0.9_Parameter_Guide.md)，实现范围见 [0.92 设计基线](../docs/spiderlings-0.92-game-design.zh-CN.md)，术语见 [CONTEXT.md](CONTEXT.md)。

0.92.34 发布前战斗补充：WebCaster 增加胶抗性；NPC 双来源直击在 2 回合内配对，追加原生基础 Slime 绑定 2、不加伤害，每目标冷却 4 回合并随实体存档。五个原始任务巢被 Maidforce 致命伤害击毁时，先于常规死亡增援尝试一只独立额度 Tunneler，仍受单图上限限制；新建普通巢不变。回归与双版本原生证据位于 `.scratch/spiderlings-npc-cooperation-20260913/`。增援权重仍为 2／2／2／1，整层三七开未验证。

0.92.34 发布前同版本覆盖：依用户要求，将新侵扰层五个任务巢改为中空圆环，支持 5×5 与 4×4 格排法及旋转；五巢均在彼此欧氏 5 格内，完整存活敌对圆环每巢合格检查概率为 55%。保留原子放置、地图连通、可攻击邻格、空间不足取消和旧地图不重排。默认原色、地图上限 25、每巢累计 Tunneler 3 均保持。重武女仆对抗方案仅为待测设计，不宣称实现 30% 胜率。证据见 `.scratch/spiderlings-ring-balance-20260913/`，方案见 [重武女仆对抗设计](../docs/spiderlings-maid-balance-proposal.zh-CN.md)。

0.92.34 将单图幼蛛默认上限设为 25，新增每巢累计掘穴幼蛛上限，默认 3，0 表示不再召唤 Tunneler。只在成功创建后累计；死亡、造巢、地图重访与读档不返还名额，新巢有独立额度。耗尽后从该巢候选权重中排除 Tunneler，其他种类继续按权重增援；与每巢存活子代上限及全图上限同时生效。旧巢首次遇到新计数机制时，以地图中仍可归属的 Tunneler 初始化，已移除的历史子代无法回溯。已有保存设置不被覆盖。审核及 KD 5.4.92 / 5.5 原生召唤、存读档证据见 `.scratch/spiderlings-nest-tunneler-cap-20260913/`。未发布的中英文公告已合并为当前完整机制说明，保留原文件路径和配图链接。

0.92.33 让闲逛中的女仆主动搜寻附近幼蛛与巢穴：在原生 hunt／wander 的 aftermove 选路阶段，按距离寻找 12 格内可由原生短程寻路到达、路径不超过 24 步的敌对 Mod 实体，设置移动目标和路径。看见对手后仍由原生感知、战斗和行动点决定攻击；已有 NPC 目标、玩家追击／挑衅、守岗、押送及其他专用任务不被搜索接管。所有相遇地图生效，旧地图上的合格女仆也适用。回归与原生取证见 `.scratch/spiderlings-maid-search-20260913/`。

0.92.32 增加巢穴的 NPC 防御启动条件，并将新侵扰地图的五个任务巢穴分成 2＋3 两组。组内各对巢穴欧氏距离为 4～5 格，组间各对巢穴切比雪夫距离至少 6 格，确保只有组内相互提供原有概率加成：两巢组每巢 25%、三巢组每巢 35%。放置复用原有连通性与可攻击位置检查，无合格完整两组时取消该图侵扰任务，旧图不重排。敌对巢穴在原生选敌感知到女仆时也能增援；受到敌对 NPC 的可引发敌意攻击后，用原生短期标记维持一个增援周期（配置间隔＋当前 tick 余量一回合），重复攻击刷新。原有玩家触发、2 回合默认间隔、概率、单巢 6 和全图 20 的默认上限继续生效，不追加即时召唤。验证见 `.scratch/spiderlings-nest-defense-20260913/`。

0.92.31 修复女仆主题层被原生中立人口额度清空的问题：预设 NPC 也会消耗该额度，随后初始随机人口被要求对玩家敌对，排除了默认关系高于敌对门槛 -0.5 的女仆和装扮公司。初始女仆主题随机抽选现在单独移除这一 `requireHostile: "Player"` 条件，保留其余势力限制、等级、阶级、地形、原生人口预算和既定权重；预设遭遇、游荡搜索增援、其他主势力及特殊房间保留原生敌意筛选。不向已生成地图补刷人口。KD 5.4.92 / 5.5 的原生进图复现、修复验证和审核见 `.scratch/spiderlings-maid-spawn-fix-20260913/`。

0.92.30 将幼蛛侵扰的楼层抽选权重从 50 提高到 100，并用原生 MapMod.faction 为新选出的侵扰节点指定 Maidforce，进入后沿用现有蜘蛛／女仆人口配置。第 3 层门槛、五巢目标、人口预算和其他特性保持原规则；已生成的旅程节点及旧地图不改写。KD 5.5 原生旅程函数固定种子 1 的 30,000 个第 5 层普通节点抽样，侵扰占比由 2,233/30,000（7.44%）升至 3,864/30,000（12.88%）；这是指定条件下的候选节点频率，不是玩家实际选路概率。回归位于 `tools/tests/spiderlings-infestation.test.js`。

0.92.29 取消全身 Lv1/Lv2 阶段锁，各部位独立按权重晋级，每次命中读取最新实体链，满级部位退出候选。丝茧最近 12 回合内的有效脱困与攻击意图合计 3 次后请求 WebCaster 加固；未命中近战及攻击法术计数，一次行动的多段效果只计一次。待加固时 WebCaster 优先选择视野内的玩家并持续执行原生喷网，只有它的直接命中添加外围网。Spinner/Jumper 仍可修补进度。回归和 KD 5.4.92 / 5.5 原生证据见 `.scratch/spiderlings-cocoon-diagnosis-20260913/`。

0.92.28 将「丝茧初醒」从 0 点改为返还 2 个界面点数（内部 `cost: -1`），位于原生绳缚开局 1 点与乳胶开局 3 点之间。英文 fallback 及七份语言 CSV 的描述改为从头到脚层层包覆的丝茧氛围文案；24 件装备和脱困规则不变。比较依据见参数说明的「丝茧初醒点数依据」。

0.92.27 按用户修订将玩家与 NPC 统一为“轻微伤害＋绑定”。`Spiderlings.Combat.CONFIG` 共用普通/跃击/喷网直击/轨迹基础 tickle 伤害 0.05/0.10/0.05/0.01。NPC 保留原生 glue/Slime 束缚分量，再结算一次 tickle；自有伤害增幅最多为原生倍率调整后输入的两倍，避免弱点固定加 0.5/1 将轻触放大。玩家喷网在合格接触时扣伤害，轨迹限频同时覆盖伤害与束缚。记录见 `.scratch/spiderlings-shared-combat-0927/`。

0.92.26 实现玩家轻伤害与 NPC 纯束缚：普通有效命中基础 0.05 tickle，跃击基础 0.10，不追加失败伤害；NPC 普通/跃击/直击/轨迹基础束缚量为 1.5/3/3/0.5，直接 HP 伤害为零，沿用原生抗性、护盾和 Slime 挣脱。普通近战、跃击实际增加束缚才消耗幼蛛。新增 `SpiderlingsCombat.js` 负责原生近战调用、弹丸碰撞及 NPC 束缚，跃击保留目标身份与地格。记录见 `.scratch/spiderlings-npc-combat-0926/`。

0.92.25 将随机敌人配置与五巢任务拆开。普通地图主势力 `KDMapData.MapFaction === "Maidforce"` 时才启用幼蛛／女仆／装扮公司／护士的随机池、权重及普通女仆基础人口槽，初始生成与游荡随机生成一致，不要求带蜘蛛侵扰特性。其他派系保留原生随机池与基础槽过滤，即使存在蜘蛛侵扰；五巢任务始终随有效蜘蛛侵扰独立生成、计数与解锁。五巢放置失败不再关闭女仆层的敌人配置。预设和强制生成仍不受随机池筛选，特殊房间保留原生人口。验证见 `.scratch/spiderlings-maid-population-20260913/`。

0.92.24 修复旅程候选缓存跨新游戏复用时，第 2 层误取幼蛛侵扰、进入后因层数不足取消五巢的预告不一致。普通旅程节点抽选前只剔除当前低层不合法的幼蛛侵扰候选，保留其他特性；注册和读档清理未访问的低层侵扰预告及对应五巢逃离条件。门槛仍为第 3 层起。女仆特性 `Mold`、地图势力和普通蜘蛛遭遇独立于五巢任务。回归见 `tools/tests/spiderlings-infestation.test.js`，双版本取证见 `.scratch/spiderlings-early-infestation-20260913/`。

0.92.23 新增“起始场景”分类的 0 点 Perk「丝茧初醒」：新游戏选中后依次穿戴十件 Lv1、五件 Lv2、八件 Lv3 与 Cocoon，共 24 件，初始不加锁、不收紧、无外围加固蛛网。入口位于 `SpiderlingsWebbing.js` 的原生 `KDPerkStart` 注册；加载 Mod 本身不穿戴，普通回合与读档不补穿。英文 fallback 和七份语言 CSV 同步。KD 5.5 原生新游戏、未选择对照及解除后内层保留验证见 `.scratch/spiderlings-cocoon-start/native.json`，持久回归在 `tools/tests/spiderlings-new-save-smoke.test.js`。

0.92.22 修复外部非护甲拘束导致的全阶段停滞：各部位及 Cocoon 统一按原生无覆盖添加与空 blocker 判定，保留原版实例、锁和逃脱进度；解除蛛丝时的原生根重建保留适配扩展到普通拘束。Lv3 八件物品改为两次有效 Cut/Remove/Struggle，方法可混合，强度仍为 3。同步设计基线、参数指南与交互图鉴。更新说明见 [0.92.22 更新公告](../docs/spiderlings-release-0.92.22.zh-CN.md)。

0.92.21 修复发布前审查发现的 WebCaster 交战移动冲突：`KDGetDir` 射角分散仅在目标为玩家实体时生效；对女仆等 NPC 的退避及坐标寻路目标保留原生方向。新增回归直接运行 KD 5.5 的原生方向函数，覆盖 NPC、坐标目标和玩家分散射角。同步纠正本说明与参数指南中沿用旧值的脚踝位移参数；运行时位移仍沿用 0.92.15 已采用的配置。更新公告见 [0.92.21 更新公告](../docs/spiderlings-release-0.92.21.zh-CN.md)，审查证据见 `.scratch/spiderlings-pre-release-20260912/REVIEW.md`。

0.92.20 采用 `NewSpiderWeb.zip`、`NewSpiderWebHit.zip`、`NewWebSpray.zip`、`NewWebSprayTrail.zip` 的全部八张 PNG（72×72 RGBA）。各包 `New.png` 原样替换 `Bullets/<名称>.png`，`New Pink.png` 保存为 `Bullets/<名称>Pink.png`；粉色随现有“粉色蛛丝”设置在绘制时选图，已存在的投射物与地面残留同样随之切换，法术身份、伤害和轨迹保持原值。八张图均作为独立 PNG 显式打包，不加入拘束 atlas。当前运行时仍未换新的旧美术为 `Enemies/` 下的 `Jumper.png`、`Spinner.png`、`Tunneler.png`、`WebCaster.png`、`NestEntrance.png`，均与初始提交一致；两色拘束各 25 张和侵扰地图图标已采用此前交付的新图。

0.92.19 采用用户提供的 `Spiderlings_Map_Modifier_Icon.png`，原样保存为 `UI/MapMod/SpiderlingsInfestation.png`（72×72）。原生旅程地图按特性 ID 叠加此图，覆盖楼层选择与旅程地图显示；透明区域保留原版楼层底图。通过 manifest 在脚本前登记，不新增绘制钩子，也不加入拘束 atlas。

0.92.18 增加女仆与幼蛛的互殴优先级，适用于所有相遇场景。`Spiderlings.js` 在 `KinkyDungeonNearestPlayer` 的一次原生选敌调用中暂时去掉玩家距离上限，并只考虑女仆与五种敌对 Mod 实体；视线、视距、俘虏及无力目标筛选仍由原生处理，无合格对手时回到普通选敌。玩家已提交的近战攻击（含未命中）或可引发敌意的法术命中，为被攻击者设置原生 `SpiderlingsPlayerProvoked` 标记 10 回合，再次攻击刷新；此时优先选择视野内的玩家。NPC 互殴、友方召唤物攻击、治疗与 inert 效果不触发；友方、队伍、仆从及停战覆盖保持生效。新回归覆盖 KD 5.5 原生选择器、事件归因与计时；KD 5.5 和本机 KD 5.4.92 的实际交战、近战/法术转火记录见 `.scratch/spiderlings-rival-priority/`。

0.92.17 将幼蛛侵扰层的随机敌人池改为幼蛛与女仆主导、少量装扮公司与护士，恢复原生随机人口预算，保留五巢任务。`SpiderlingsInfestation.js` 按实际势力登记自有筛选标签，在初始随机人口及游荡随机抽选期间使用原生 requiredTags 与 bonusTags；倍率为幼蛛 1、女仆 3、装扮公司 0.5、护士 1，不是固定人数百分比。普通女仆可填充基础人口槽。预设 spawnpoints 通过复制的 ftags 标记退出主题筛选；ForceSpawn、预设遭遇、监狱/守卫势力、囚犯和任务 NPC 保持原版。选择上下文在 finally 中恢复，五巢创建失败时保留普通人口。回归在 `tools/tests/spiderlings-infestation.test.js`；完整地图证据位于 `.scratch/spiderlings-infestation-population/`。

0.92.16 增加“单图幼蛛上限（0 为不限）”配置，默认 20，只统计当前地图存活的 Spinner、Jumper、WebCaster、Tunneler（包含友方），巢穴不占名额。自然生成、游荡增援与重生队列、固定小队、巢穴循环及死亡召唤共用额度；小队名额不足四只时整组跳过，重访不补放。满额巢穴保留到期计时，死亡或离场后腾出名额；调低设置或读入超额存档保留已有蜘蛛并暂停新增。原生 KD 5.5 路径回归见 `tools/tests/spiderlings-encounters.test.js`。

0.92.15 采用更新的 `Author_SpiderlingsWebbingLv2AnklesModel_Ankles.zip`，原始导出留存于 `DSmap/`。脚踝位移 PNG 原样替换，目标由 `All` 改为 `Skirts`、强度由 1000 改为 2000、裁切原点由 `(737,2336)` 改为 `(383,2085)`；Lv2/Lv3 及原色/粉色共用新图和参数。其他部位位移保持原值。

0.92.14 缩减发行包体积：四段手动清网音效由 48 kHz 双声道浮点 WAV 转为 22.05 kHz 单声道 Ogg Vorbis（FFmpeg `-ac 1 -ar 22050 -c:a libvorbis -q:a 0 -map_metadata -1`），合计由 1,244,336 字节降至 28,096 字节；播放时机与随机选择保持原值。原始 WAV 可从保留的 `Spiderlings_0.92.13.zip` 或 Git 历史取回。两张派生 atlas 在构建时用 pyoxipng level 2 无损重压缩，保留透明像素 RGB 和元数据，不改写 50 张模型源 PNG。最终 ZIP 由 21,388,027 字节降至 19,428,263 字节（19.43 MB / 18.53 MiB），减少 9.16%。验证与体积明细见 `.scratch/spiderlings-size/`。

0.92.13 将中文与英文兜底文案统一为“温柔的层层缠织”：以轻巧的幼蛛动作、柔软贴合的丝缕和逐渐绵密的包覆改写敌人、召唤、24 件拘束、脱困与侵扰描述，并更新 Mod 简介。名称、键名、占位符和玩法数值保持原值；共调整 99 个中文词条和对应英文运行文本。物品描述兼顾原色与粉色，任务门禁及丝茧固定仍直接说明条件与结果。其余六份语言 CSV 沿用现有翻译。本次文案校验记录在 `.scratch/spiderlings-gentle-copy/`。

0.92.12 增加蛛丝拘束的脱困反馈：Cut、Struggle、Remove 各有过程与完成描述，丝茧单独描述茧壁开裂与钻出茧壳。只有已经通过有效行动判断的未完成动作才选择进展描述，查询、耐力不足、缺少工具或外层门禁沿用原有提示。使用原生 `data.failSuffix` 与拘束 `customEscapeSucc`，同时覆盖原生追加的 `Aroused` 词条。原生额外力量分支优先选择 `Fail2/Fail3`，仅在当前自有有效行动调用内将这两个文本查询转向过程文案；返回或异常后清理上下文。次数、扣费和物品去向保持原值。新增 18 个消息键，英文 fallback 与七份 CSV 同步。

0.92.11 修复结茧后的警戒：敌对蜘蛛不再因玩家已绑紧而随机放弃攻击；挣扎、攻击、施法或移动会重新开始警戒，包括被外围网阻挡的移动。连续 25 回合无主动行动后停止攻击并按原生移动消耗退至四格外；新的行动立即恢复追击。散开时取消未完成的 Jumper 跃击。原生 KD 5.4.92 完整挣扎、施法加固、25 回合边界与恢复追击记录见 `.scratch/spiderlings-cocoon-vigil/`。

0.92.10 增加 WebCaster 交叉命中联动与原生风筝移动中的分散射角偏好。不同存活敌对施法者在两回合内直击可额外添加一件合格内层蛛丝，全体每玩家回合最多一次；血量、射速、减速上限和结茧门槛保持原值。联动回归覆盖原生命中入口、阶段门槛与中断，KD 5.4.92 原生验证记录在 `.scratch/spiderlings-crossfire/`。

0.92.9 增加粉色 4096×4096 单页 atlas。Mod 启动时预载原色与粉色共 50 个 frame，首次命中和切色复用各自图集；图集失败时该颜色单独回退 direct PNG。

0.92.8 修复粉色首次被怪物施加后未及时显示：等待显式 PNG 加载完成，将有效纹理写回 KD 缓存，再补刷角色。

0.92.7 采用 `Webbing-pink-parts1.zip` 中关闭背景图层后重新导出的 21 张粉色部件（Lv1 八张、Lv2 五张、Lv3 八张）；左右手套、Cocoon 和 OuterWebs 沿用 `Webbing-pink-parts.zip`。现有“粉色蛛丝（关闭为原色）”设置保持不变。默认关闭；退出 Mod 设置后刷新已穿戴模型，设置由 KD 保存并在加载时恢复。

本机用户安装的 **KD 5.4.92** 位于 `C:\Game1\kinky-dungeon-win_64 (2)`，运行代码为 `resources/app/out/main.js`，Mod 目录为 `Mods/`。官方运行文件只读；排查输出放在工作区 `.scratch/spiderlings-map-generation/`。2026-09-11 已验证 Spiderlings 单独加载的进图与切图；同时加载 Rika 1.7 时发现其旧囚犯生成函数导致地图生成异常，对应独立补丁见 [Rika / KD 5.4.92 兼容补丁](../mods/rika-kd54-compat/README.md)。该验证范围不等于全部 KD 5.4 玩法兼容认证。

## 运行时与状态

| 文件                          | 职责                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `SpiderlingsCore.js`          | 注册入口、拘束目录、自然权重、固定小队与巢穴增援              |
| `SpiderlingsModelRuntime.js`  | atlas-first 别名加载、direct fallback、位移图预载与重绘       |
| `Spiderlings.js`              | 五类敌人、技能、英文 fallback、女仆敌对与选敌优先级           |
| `SpiderlingsInfestation.js`   | 原生侵扰修饰符、五巢任务、完成记录与出口门禁                  |
| `SpiderlingsCombat.js`        | NPC 束缚、近战效果成功、喷网碰撞及轨迹去重                    |
| `SpiderlingsJumperDash.js`    | 蓄力跃击、目标格预警、落点重验与取消                          |
| `SpiderlingsWebbingModels.js` | 图层、姿势、覆盖与五部位 displacement                         |
| `SpiderlingsWebbing.js`       | 24 件拘束、shared resolver 实体进阶、操作门禁、逃脱与丝茧加固 |

敌方进阶按部位独立进行，身体 Lv1 → Lv2 → Lv3，眼罩 Lv1 → Lv3，口塞 → Lv1 封口 → Lv3 封口；Hood 需要 Lv3 眼罩和封口。每个未满部位只提供下一件候选，统一按来源权重随机选择。每次命中重新检查，不需要等下一回合；十件 Lv1、五件 Lv2、八件 Lv3 全齐后，才按命中前五层 slow 与允许的 direct 来源施加 Cocoon。每次命中最多施加一件。玩家手动装备绕过敌方进阶前置，装备链仍遵守原生兼容与自有层序。外部护甲、普通拘束及混合链通过原生无覆盖添加检查且无 blocker 时可叠加，外部实例及属性保留；原生不兼容时保留原槽。Cocoon 使用同样的兼容判定。

丝茧是跨部位最高级操作门禁。装备丝茧时，全部 23 件 Lv1/Lv2/Lv3 的 HUD、紧凑 HUD 和玩家右键操作入口隐藏，Cut、Remove、Struggle 在原生扣费前返回 `Blocked`，显示本地化提示并播放 `ClickError.ogg`。不累计进度，不自动改选目标；丝茧自身、第三方目标、NPC 操作和系统直接移除继续使用各自规则。脱茧即时恢复部位门禁：身体 Lv3 → Lv2 → Lv1，头部 Hood → Lv3 Blindfold → Lv1 Blindfold，口部 Lv3 Gag → Lv1 Gag → Lv1 Stuffing。双手套分别可操作。

Lv1/Lv2/Lv3 需要 1/2/2 次有效行动，方法可混合；最终 Cut 销毁物品，Remove/Struggle 回收松散物品，重穿创建新实例。查询、无耐力、缺少剪切工具、原生组阻挡与外层门禁均不计数。Remove/Struggle 的实际行动随机播放四个手动清网音效之一。

普通 Cocoon 使用 `hobble: 3` 缓慢移动。当前物品在最近 12 回合内累计 3 次有效 Cut/Remove/Struggle 与攻击意图后保存待加固标记；WebCaster 优先瞄准视野内玩家，下一次 WebCaster direct 命中添加外围网并固定至脱茧。攻击由敌人行动前的 tick 读取原生 Attack 或 afterPlayerCast 记录的攻击法术意图，一次行动只计一次；未命中也计，治疗和 buff 不计。等待命中不会丢失待加固标记，待加固 WebCaster 不因 25 回合静止而散开。逃脱基准 Cut 40、Remove/Struggle 50 次，允许 direct 每次最多按比例修补总进度 `0.10`。警戒计时保存在 `KDMapData.SpiderlingsCocoonVigil`，在敌人行动前的 `tick` 更新；`beforeMove` 记录被阻挡的移动尝试。重新穿茧、离图、战败、昏迷或入狱清理计时。外围网状态保存在 `item.data.SpiderlingsCocoonOuterWebs`，`afterDress` 恢复视觉姿势，`beforeMove` 使用原生 NoMove 标记阻挡普通移动。新穿戴清理旧加固记录。

WebSpray slow 只接收 `WebCaster.WebSpray` 精确来源；普通 SpiderWeb 使用原生地面效果。切图、战败、昏迷、入狱清除 transient slow，实体拘束仍保留。固定小队与侵扰目标状态归属 `KDMapData`；重访不补放。巢穴循环子代记录父 ID，每 tick 重建计数，不跨 tick 缓存敌人存活状态。

头口限制按 Lv1 → Lv3 → Hood 递进：眼罩 blindfold 为 `1/2/4`；口塞与 Lv1 封口 gag 为 `0.10/0.15`，Lv3 封口为 `0.50`，Hood 为 `1.00`。内层仍参与 KD 原生叠加；默认完整口部链在 Hood 前为 `0.75`，Hood 才达到完全封口。数值与默认视野见参数说明。

## 图层与位移

Lv1 全部无 displacement。Lv2/Lv3 共用对应部位图与参数：

| 部位   | 目标          | 强度 | 裁切原点     |
| ------ | ------------- | ---: | ------------ |
| Arm    | `Rope1`       | 1200 | `(650,749)`  |
| Belly  | `CorsetTorso` | 1200 | `(459,1280)` |
| Legs   | `Skirts`      | 2000 | `(110,1657)` |
| Ankles | `Skirts`      | 2000 | `(383,2085)` |
| Foot   | `Shoes`       |  100 | `(741,2928)` |

Legs/Ankles 的 Lv1 位于站立裙层下；Lv2/Lv3 位于 `OverSkirtDeco`、`Pri: 51/52`，四件外层均用 `NoOverride: true` 保留整张裙层，由画稿实际遮盖。Lv1/Lv2 保留原衣物，不添加 `Encase*`、`FlattenedUnderbust` 或 `WrapArms`，不通过 erase map 清掉手套。两只 Lv1 手套只要求手臂 `Free`；Arm 只绑定手臂。

Lv3 的自有覆盖姿势隐藏对应内层图层及其位移，物品仍装备。Arm 在可见 Wristtie 姿势参与 `ChestBinding` 跨层覆盖；不可见时排除优先级预计算。Hood 覆盖整个头部及兽耳；Lv3 Legs 和 Cocoon 遮住尾巴，相关覆盖全解除后恢复。Cocoon 本体位于 `FurnitureFront`、`Pri: 100`，只包到颈口下缘，头部上半露出，不自动补 Hood；外围网位于 `FurnitureBack`，由 `SpiderlingsCocoonAnchored` 控制。Cocoon 自身及下肢束缚用 `FeetLinked`、`BlockKneel`、`BlockHogtie` 保持站姿。

五张位移 PNG 位于 `DisplacementMaps/SpiderlingsWebbingLv2{Arm,Belly,Legs,Ankles,Foot}Squish.png`，从 `DSmap/` 对应导出包采用并用 `KDOptimizeDisplacementMapInfo` 恢复裁切位置。必须先由 Pixi Assets 解码；装备事件等对应 map 后重绘，读档首次 `afterDress` 完成后只补一次重绘。

## 源素材与 atlas

- 粉色版当前由 `Webbing-pink-parts1.zip` 的 21 张更新部件与 `Webbing-pink-parts.zip` 保留的四张部件组成，共 25 张原始 PNG，原样采用到 `Models/SpiderlingsWebbing{Lv1,Lv2,Lv3,Cocoon}Pink/`，文件名与原色逐一对应；`Left hand` / `Right hand` 分别对应 `MittenLeft` / `MittenRight`，`(Outer webs)` 对应 `OuterWebs`。不重新调色、缩放或生成美术。两色各有单页 atlas-first / direct fallback，显式输入各 25 张；粉色图集不改写原色别名。
- `spiderlingsPinkWebbing` 是原生 boolean 设置，默认 `false`。设置加载、退出配置页、模型注册和 `afterDress` 同步自有模型目录；同时更新玩家 Appearance 与 KDCurrentModels 内的副本。重绘与异步预载复用现有入口，预载缓存按颜色区分。原色 atlas 别名不指向粉色，防止晚到的图集覆盖所选颜色。两色共用物品 ID、图层、姿势、覆盖关系与 displacement。

- `0.92.4` 采用更新后的工作区 `T's NEW Webbing (6).zip` 中全部 25 张 PNG：Lv1 十张（包括独立的 Left hand / Right hand）、Lv2 五张、Lv3 八张、Cocoon 本体和外围蛛网，按现有运行时路径直接替换。本次 Hood 与修正后的 Cocoon 均已采用，无缺项；全部素材可装入原有 4096×4096 单页图集。替换清单见 [重上色与头口递进记录](../docs/spiderlings-recolor-0.92.4.md)。
- 50 张 runtime PNG 是权威 direct fallback：两色各十 Lv1、五 Lv2、八 Lv3、Cocoon 与 OuterWebs。五张 displacement 不进入 atlas。原画与 DSmap 导出作为输入留存，测试仍引用的原始资料保持可访问。
- `tools/build-spiderlings-atlas.py` 分别读取两组各 25 个显式路径的 alpha 边界，以无损 trim 与空闲矩形打包生成两张 4096×4096 图集：原色 `TextureAtlas/spiderlings-webbing-0.{json,png}` 与粉色 `TextureAtlas/spiderlings-webbing-pink-0.{json,png}`。`sourceSize` / `spriteSourceSize` 恢复画布定位；不缩放、旋转、重采样、调色或改写源 PNG。
- 构建器、checker、自动测试和实施代理不对这 50 张输入做视觉、尺寸、像素、颜色、透明度、哈希或校验和验收。实机人工显示观察独立记录，不改变源图，也不成为 atlas 打包门槛。
- direct PNG 的 readiness promise 使用 `Assets.load`，在 KDModFiles 指向 Blob 时显式传入 `format: "png"` 与 `loadParser: "modTextureLoader"`。Pixi 7.2.1 的 `backgroundLoad` 返回仅代表入队；KD 5.4.92 的 resolver 会将逻辑 PNG 转成没有扩展名的 Blob，不能靠普通字符串请求判定解码完成。缓存中 `valid: false` 的纹理不算就绪，解码结果同步到 KD/Pixi 别名后才触发重绘；空加载结果不永久缓存为预载成功。首次粉色命中的原生对照见 `.scratch/spiderlings-first-refresh/`。
- manifest 在脚本前列出完整 fallback 与 atlas。运行时启动两色预载；每个 atlas 完整验证自己的 25 个 frame 后一次性缓存对应 `Models/...png` 别名。某个 atlas 失败只让该颜色回退到 direct PNG，另一色图集继续使用。

## 文本与发行

英文 fallback 与七份 CSV 覆盖 24 件拘束的 name/Desc/Desc2，以及当前敌人、技能、设置、门禁、侵扰和脱困文案。中文与英文采用温柔的缠织主题，以部位与覆盖形态区分层级，操作标签和进度占位符保留。七份 CSV 各有 151 个唯一键，键集合一致。

日语中的 Spiderling 称呼统一使用「幼蛛」。界面排版验收范围为中文和英文；德语、波兰语沿用已有翻译资源，不扩展游戏的语言切换入口。

`0.92.22` 安装包只有 92 个条目：manifest、84 个 `fileorder` 条目和七份 CSV。71 张 PNG 由 1 张楼层特性图标、8 张投射物、5 张敌人、50 张模型（两色各 25 张）、5 张位移图、2 张 atlas 构成，另有 2 份 atlas JSON、4 个 OGG 和 7 个脚本。开发脚本、文档、原画、历史资源不进包。

图集构建依赖 Pillow 与 pyoxipng 9.1.1；首次准备构建环境时执行 `python -m pip install -r .\Spiderlings_0.91\tools\requirements-atlas.txt`。优化仅作用于新生成的两张图集，使用 `optimize_alpha=False` 与 `StripChunks.none()`。

在工作区根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\build-spiderlings-release.ps1 -RunCheck
powershell -ExecutionPolicy Bypass -File .\Spiderlings_0.91\tools\watch-spiderlings-mod.ps1 -Once
```

构建脚本先重建 atlas，再按 manifest 与七份 CSV 的精确 allowlist 打包。最终 watcher 检查源文件、行为测试和实际 ZIP；完成后按包内 `AGENTS.md` 创建聚焦提交。正式版本与测试版本不得混用或静默覆盖。历史 ZIP 和已退役运行时素材保存在 [archive/spiderlings](../archive/spiderlings/README.md)，旧设计与验收文档见 [文档归档](../docs/archive/spiderlings-0.91/README.md)。

玩家从区域西侧外部进入；Spinner 在未发现玩家时预放四陷阱、织好三边，进入后封住最后一边。结点被打断或陷阱被拆除后等待二十个后续世界回合，再由存活 Spinner 重新布场，不生成替补。空闲布场动作每次修补一个连接结点 0.1 HP，最高 2；连接显示最薄弱处生命。对抗及五回合包裹期间，其他敌对蜘蛛暂停攻击玩家并调整等候位置；额外 Spinner 仍可加入。已有玩家目标 Jumper 预警撤销，自有在途喷网不造成伤害或施加；结束后重新攻击与预警，NPC 对战保持原流程。
