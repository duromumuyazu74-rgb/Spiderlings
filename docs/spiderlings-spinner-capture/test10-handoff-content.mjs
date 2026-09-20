export const copy = {
 zh: {
  file:'ARTIST-HANDOFF.html', lang:'zh-CN', title:'Spinner 腿袋 · 替换这四张图',
  intro:'test.10 已使用实际 PNG 测试素材。画师按下面的文件名、画布和连接方向交图，就能直接替换对应部件。',
  notice:'当前四张图由 Image Gen 生成，用来验证素材接入和动画。画师尚未交付的 Cocoon 裁片可参考材质，但不作为这四个部件已经齐备的依据。',
  root:'所有路径均相对 Mod 根目录；画师包中的 Models 文件夹与游戏包完全同名。',
  guide:'图中青框是运行时取图区域，框外不参与显示。保留整张透明画布和原有位置，在框内对照原图替换。不要自动裁掉透明边；参考框、文字和人体底图不要导出到 PNG。',
  labels:['需要画什么','替换后出现在哪里','画布 / 取图范围'],
  parts:[
   ['Finished','A07-L · 完成腿袋','双腿共用一个从脚底到大腿上段的连续袋体，封住脚底。绘制宽丝、纤维、层叠和阴影；不包含人体、上身、手臂或头。顶部开口留给 Closure 叠加。','最后阶段淡入，100% 完成后保留。它不决定逐圈缠绕和自由尾端的外观。'],
   ['Band','A08-B · 缠绕宽带','一条横向宽蛛丝，左右能连续衔接。纤维顺长度方向，上下带有厚度和轻微毛边；宽度保持稳定，不画完整腿部轮廓。先检查左右两端相接是否跳变。','对抗预览、逐圈缠绕和中断后的半成品。代码沿腿部路线弯曲、重复和前后分层，一圈使用一段带面。'],
   ['Tail','A08-T · 活动宽尾','左端连接 Band，右端为自由端。两者宽度、材质和边缘衔接，右端可以略收窄。保持独立，不能烘焙进 Finished。','缠绕最前沿的活动带尾；代码移动和弯曲它，并切换腿前／腿后遮挡。完成或中断后隐藏。'],
   ['Closure','A08-C · 大腿封口','横向浅 U 形前缘，带厚度、压边和阴影。保持中央低、两侧略高；与 Finished 顶部宽度和材质一致。每圈的接缝细节仍画在 Band 中。','最终阶段叠在完成腿袋顶部。单独替换只改变封口，不会改变全部圈间搭接。']
  ],
  pipeline:'替换 → 打包 → 游戏试装',
  steps:[
   '解压画师包，在 Models/SpiderlingsSpinnerLegbinder/ 打开四张原图。先替换一个部件的小样，文件名、大小、透明画布及摆放位置保持一致。保留可编辑 .clip / .psd 分层源文件。',
   '双击 BUILD-PREVIEW.cmd。脚本检查四张图的画布大小，把它们写入附带的 Base-Mod.zip，生成 Preview.zip；代码、其他素材和清单保持来自同一个测试版。',
   '完全刷新游戏页面或重启游戏，停用其他 Spiderlings 包，仅加载 Preview.zip。新建角色选择“结网幼蛛试玩 / Spinner field trial”，依次观察对抗、包裹、完成。',
   '检查 Band 左右接缝、Tail 连接处和前后遮挡、Finished 脚底与大腿覆盖、Closure 接边。中断包裹后应保留已有宽带并隐藏带尾。改图后重新运行脚本并重载游戏。',
   '确认原色后打开 Mod 的粉色蛛丝选项检查同一套素材。此版由程序对四张中性色 PNG 染粉，不交第二套 Pink 图片。若需要独立粉色绘制，另由开发更改接入。'
  ],
  contract:'尺寸已在 test.10 固定：Finished 为 1024×1536，另外三张为 2172×724。它们是局部部件画布，不是旧说明中的 2480×3508 全身画布。只换相同规格的四张图无需改 JS、mod.json，也无需重建蛛丝图集。改变轮廓比例、锚点或导出大小时，需要开发重新定位。',
  evidence:'真实游戏渲染参考',
  captions:['包裹中：Band + Tail','中断后：保留 Band，隐藏 Tail','完成后：Finished + Closure','粉色选项：同图染色'],
  evidenceNote:'这些是 test.10 使用本页四张 PNG 的原生角色渲染，供核对部件用途和位置。生成图是测试样例，材质风格与连接边仍可由画师精修；不要求逐帧作画。',
  mapTitle:'地图四项仍需单独接入',
  mapNote:'本次固定的是立绘腿袋的四个替换入口。下面四项属于原清单，test.10 未建立相同的直接替图入口；先交地图格内小样，由开发单独接入。',
  maps:[['M01 地面陷阱','一个格内的地面网','当前为程序格线'],['M02 陷阱间连接','可延长的纯白连接丝','当前为程序白线'],['M03 边界网结／网片','可与连接丝衔接的透明网结','当前复用 WebSprayTrail.png，勿直接改共用原图'],['M04 蜘蛛到玩家牵绳','可延长的纯白细绳及端部','当前为程序白线，与 Tail.png 的立绘宽尾不同']],
  devTitle:'开发说明',
  dev:'SpiderlingsSpinnerArt.js 直接解码这四张 PNG，以纹理网格铺带和变形尾端，以精灵显示成品与封口。SpiderlingsSpinnerCapture.js 提供阶段、进度和中断状态。前后覆盖层挂在原生人物 Mesh 中，采用各人物容器的 Zoom × MODEL_SCALE。新目录是实际磁盘资源；旧 Cocoon 及蛛丝图集仍供其他装备使用。',
  footer:'2026-09-19 · Spiderlings 0.92.36-test.10 · 正式基线 0.92.36'
 },
 en: {
  file:'ARTIST-HANDOFF.en.html', lang:'en', title:'Spinner leg bag · Replace these four images',
  intro:'test.10 uses real PNG test artwork. Follow the filenames, canvases and attachment directions below to replace each visible part directly.',
  notice:'The four samples were generated with Image Gen to test asset loading and animation. The artist’s Cocoon crops have not been delivered. They may provide material references, but do not establish that all four parts are available.',
  root:'All paths are relative to the Mod root. The artist kit uses exactly the same Models folder as the installable Mod.',
  guide:'The cyan rectangle marks the region read by the renderer. Pixels outside it are not displayed. Keep the full transparent canvas and the existing placement. Do not trim transparent margins or export the reference rectangle, labels or body guide into the PNG.',
  labels:['What to draw','Where the replacement appears','Canvas / sampled rectangle'],
  parts:[
   ['Finished','A07-L · Finished leg bag','One continuous bag enclosing both legs from soles to upper thighs. Close the bottom and show broad silk, fibres, overlaps and shadows. Exclude the body, torso, arms and head. Leave the top opening for Closure.','Fades in during the final stage and remains at 100%. This image does not supply the winding strip or moving tail.'],
   ['Band','A08-B · Wrapping band','One horizontal silk strip whose left and right ends join. Run fibres lengthwise, with thickness and slight fraying along the upper/lower edges. Keep its width consistent. Do not draw a complete leg silhouette. Check two copies joined end to end.','Contest preview, winding turns and retained partial wrapping after interruption. Code bends, repeats and places it in front of or behind the legs. One strip spans one turn.'],
   ['Tail','A08-T · Moving tail','Left end attaches to Band; right end is free. Match width, material and edges at the join. The free end may taper slightly. Keep it separate from Finished.','The loose tail at the active winding edge. Code moves and bends it and switches front/rear placement. It disappears on completion or interruption.'],
   ['Closure','A08-C · Upper-thigh rim','A shallow U-shaped front rim with thickness, an overlapping edge and shadow. Centre slightly lower than the ends. Match the width and material of the top of Finished. Paint the repeated turn edges in Band.','Overlays the finished bag at the final stage. Replacing it changes the top rim, not every seam between turns.']
  ],
  pipeline:'Replace → build → test in game',
  steps:[
   'Extract the artist kit and open the four originals in Models/SpiderlingsSpinnerLegbinder/. Replace one part with a rough sample first. Keep its filename, dimensions, transparent canvas and placement. Retain editable .clip / .psd source layers.',
   'Double-click BUILD-PREVIEW.cmd. It checks all four canvas sizes and writes them into the supplied Base-Mod.zip to create Preview.zip. Code, other assets and the manifest remain from the same test version.',
   'Fully reload or restart the game, disable other Spiderlings packages and load only Preview.zip. Start a new character with “Spinner field trial”. Observe the contest, wrapping and completed stages.',
   'Check Band joins, Tail attachment and front/rear occlusion, Finished sole/thigh coverage and Closure alignment. Interruption should retain existing wrapping and hide the tail. After changes, rebuild and reload the game.',
   'After the neutral version fits, enable pink webbing in Mod settings. This version tints the same four neutral PNGs; do not supply a separate Pink set. Independently painted pink art requires a later developer integration change.'
  ],
  contract:'The test.10 canvases are fixed: Finished is 1024×1536; the other three are 2172×724. These are local part canvases, replacing the earlier 2480×3508 full-body export guidance. Same-spec replacements require no JS or mod.json edits and no webbing atlas rebuild. Changes to proportions, anchors or export sizes need developer refitting.',
  evidence:'Native game rendering references',
  captions:['Wrapping: Band + Tail','Interrupted: retained Band, no Tail','Completed: Finished + Closure','Pink setting: the same tinted images'],
  evidenceNote:'These native character renders use the four test.10 PNGs shown above. Use them to identify parts and placement. The generated samples demonstrate the pipeline; the artist can refine their style and connecting edges. No frame-by-frame drawings are required.',
  mapTitle:'Four map items still need separate integration',
  mapNote:'This delivery fixes the four portrait replacement slots. The following map items remain in the original brief. test.10 does not yet give them equivalent direct replacement slots; send tile-size samples for separate developer integration.',
  maps:[['M01 Ground trap','A ground web fitting one tile','Currently procedural grid lines'],['M02 Trap connections','Extendable pure-white silk','Currently procedural white lines'],['M03 Boundary knots / patches','Transparent knots joining the silk','Currently borrows WebSprayTrail.png; do not overwrite this shared asset'],['M04 Spider-to-player tether','Extendable pure-white thin cord and ends','Currently procedural white lines; separate from the wide portrait Tail.png']],
  devTitle:'Developer notes',
  dev:'SpiderlingsSpinnerArt.js decodes the four PNGs directly, uses textured meshes for the band and tail, and sprites for the finished bag and rim. SpiderlingsSpinnerCapture.js supplies phase, progress and interruption state. Front/rear overlays attach to the native character Mesh, using each container’s Zoom × MODEL_SCALE. The new directory contains real files. Shared Cocoon assets and webbing atlases still serve other equipment.',
  footer:'2026-09-19 · Spiderlings 0.92.36-test.10 · Formal baseline 0.92.36'
 }
};
