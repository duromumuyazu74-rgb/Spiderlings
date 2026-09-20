import {readFile,writeFile} from 'node:fs/promises';
import {sections,content,table} from './source/content.mjs';
// Generate the standalone viewers before embedding them in the production plan.
import '../../.scratch/spiderlings-spinner-capture/build-artist-demo.mjs';
import {renderThickGuide} from '../../.scratch/spiderlings-spinner-capture/artist-thick-guide.mjs';
const here=new URL('./',import.meta.url);
const scratch=new URL('../../.scratch/spiderlings-spinner-capture/',here);
const read=p=>readFile(new URL(p,here),'utf8');
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
const sourceNames=['PRD.md','ALIGNMENT.zh-CN.md','ART-BRIEF.zh-CN.md','ANIMATION-DEMO.zh-CN.md','AGENTS.md','README.md'];
const sourceTexts=await Promise.all(sourceNames.map(p=>readFile(new URL(p,scratch),'utf8')));
const demos=await Promise.all(['artist-animation-demo.html','artist-animation-demo.en.html'].map(p=>readFile(new URL(p,scratch),'utf8')));
const [planCss,js,simulator]=await Promise.all(['source/plan.css','source/plan.js','source/simulator.html'].map(read));
const css=planCss+'\n'+await readFile(new URL('artist-thick-guide.css',scratch),'utf8');
content.art=content.art.replace('<!-- thick-parts-guide -->',renderThickGuide('zh-CN'));
const storyData=[...sourceTexts[0].matchAll(/### (US-\d+): ([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n### US-|\r?\n## 6\.)/g)];
if(storyData.length!==10)throw Error('Expected US-001–010');
const dependencies={'001':'无；O01 / O02 决定后锁定边界','002':'US-001；围场几何原型','003':'US-002；O03','004':'US-001 / 002；O01 / O02','005':'US-003 / 004 / 009；O03 / O04','006':'US-005；O05','007':'US-005 / 006；O04 与美术小样','008':'US-001–007 / 009 / 010 全部完成','009':'US-001 / 004；O02','010':'US-001；与 US-005 / 006 联合验收'};
const stories=storyData.map(([,id,title,body])=>{
  let description=body.match(/\*\*Description:\*\* ([^\r\n]+)/)?.[1]||'';
  if(id==='US-004')description='对抗中玩家用一次精力费用剔除牵制；其他原生合法行动保留效果与消耗，同时记为跳过。';
  const criteria=[...body.matchAll(/^- \[ \] (.+)$/gm)].map(m=>m[1].trim());
  if(id==='US-005')criteria[3]='原装备保留；外部打断保留已完成高度的半成品，撤掉遭遇固定和活动连线；失败升级不补满、不留隐形固定。';
  if(id==='US-006')criteria[1]='捕获物品完整状态接入23件自有内层门禁，自身保留脱困；半成品门禁和难度待 O05 决定。';
  return `<details class="story" id="${id}" open><summary>${id} · ${esc(title)}</summary><p class="story-meta">状态：待实现 / 验收 · 依赖：${dependencies[id.slice(-3)]}</p><p>${inline(description)}</p><ul class="check-list">${criteria.map((c,i)=>`<li><label><input type="checkbox" data-check="${id}-${i+1}"><span>${inline(c)}</span></label></li>`).join('')}</ul></details>`;
}).join('');
content.tasks=`<p>沿用原 PRD 的 US-001–010 编号，逐项列出验收，便于拆分实施和与画师交接。所有检查框初始为空；它们记录审阅者的核对状态，不会自动声称正式玩法已实现。</p><div class="toolbar"><button id="export-checks">导出核对记录</button><span id="check-feedback" role="status"></span></div>${stories}`;
content.behavior=simulator;
content.sources=`<p>以下原稿全文已经内嵌，离线可查阅或下载。它们保存讨论过程，存在尚未同步的旧说法；当前执行说明以上文规则、最新确认记录及现行画师目录约定为准。</p>
${table(['原稿差异','本手册采用的当前口径'],[['PRD §3.4 的收臂时点待定','对抗 / 下身保留合法手臂姿势，上身收至背后，来源 ALIGNMENT Q13'],['PRD §3.5 的胜负 / 半成品建议状态','主胜负已确认；半成品保留高度已确认，来源 Q8 / Q14'],['PRD US-004 的其他行动无额外效果','原生合法动作正常生效并消耗，算跳过，来源 Q11'],['历史美术稿要求所有方案新画 A07','当前细丝仅画活动线、复用 Cocoon；粗丝需要新部件与完成外观，来源当前 artist-demo-copy.mjs 与目录 AGENTS.md'],['历史源文件格式 / 17 或27张统计','当前交付为 .clip 与透明 PNG；数量随选型，不把圈数或帧数当订单']])}
<p>本手册是整理后的制作依据；逐轮记录保留其历史含义。原始三张示意附件未在本轮取得，不声明已重新查看。源码路径与网页中的本地历史链接需要工作区，内嵌动画与规则模拟不需要。</p>
${sourceNames.map((name,i)=>`<details class="source"><summary>${name} · 原稿全文</summary><button data-source-download="${name}" data-source-target="source-${i}">下载 Markdown 原稿</button><pre id="source-${i}">${esc(sourceTexts[i])}</pre></details>`).join('')}`;
const payload=JSON.stringify({'zh-CN':demos[0],en:demos[1]}).replaceAll('<','\\u003c');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Spinner 集体捕获：开发与画师制作手册、规则模拟、原生动画和实施验收清单"><title>Spinner 集体捕获 · 策划案与制作计划</title><style>${css}</style></head><body><a class="skip" href="#main">跳至正文</a><aside class="sidebar"><div class="brand">SPINNER<br><small>PRODUCTION BOOK</small></div><nav aria-label="章节目录">${sections.map(([id,n,title])=>`<a href="#${id}">${n} / ${title}</a>`).join('')}</nav><div class="nav-bottom"><small>开发 × 美术<br>设计细化基准 2026.09.12<br>离线单文件 · 中文正文</small></div></aside><main id="main"><header class="hero"><div class="eyebrow">SPIDERLINGS / NEXT FEATURE UPDATE</div><h1>集体结网，<br>逐层成茧。</h1><p class="lede">Spinner 捕获机制的详细策划案与制作计划。<br>从玩法决定，到可操作规则、原生动画与逐项验收。</p><div class="tags"><span class="tag confirmed">已确认规则</span><span class="tag pending">待定参数显式标记</span><span class="tag proof">KD 5.5 显示试片内嵌</span></div><div class="toolbar"><a href="#behavior">操作规则模拟 ↗</a><a href="#animation">观看美术试片 ↗</a><a href="#tasks">查看制作清单 ↗</a><button id="print-plan">打印 / 保存 PDF</button></div><p class="muted">本文件用于制作与评审。正式捕获玩法尚未实现；下方模拟用于解释设计，数值假设可调。</p></header>${sections.map(([id,n,title])=>`<section class="chapter" id="${id}"><div class="section-top"><span class="number">${n}</span><h2>${title}</h2></div>${content[id]}</section>`).join('')}<footer class="footer">Spinner 制作手册 · 文档、媒体与模拟均包含在此 HTML。媒体承载原型证据；实机交付以分版本验收与安装包为准。</footer></main><script id="embedded-demos" type="application/json">${payload}</script><script>${js}</script></body></html>`;
await writeFile(new URL('production-plan.zh-CN.html',here),html);
console.log(JSON.stringify({file:'docs/spiderlings-spinner-capture/production-plan.zh-CN.html',bytes:Buffer.byteLength(html),chapters:sections.length,stories:storyData.length,checks:(html.match(/data-check=/g)||[]).length,embeddedLanguages:2}));
