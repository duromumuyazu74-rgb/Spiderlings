import {chromium} from '../../node_modules/playwright/index.mjs';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const output=new URL('../../.scratch/spiderlings-spinner-capture/'+(process.argv.includes('--sync')?'plan-sync-20260912/':'plan-verification/'),import.meta.url);
await mkdir(output,{recursive:true});
await copyFile(new URL('./production-plan.zh-CN.html',import.meta.url),new URL('standalone.html',output));
const browser=await chromium.launch({headless:true});
const report={errors:[],externalRequests:[],scenarios:[],media:[],widths:[]};
try{
  const context=await browser.newContext({viewport:{width:1440,height:1024},offline:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
  await page.goto(new URL('standalone.html',output).href);
  assert.equal(await page.locator('.chapter').count(),11);
  assert.equal(await page.locator('details.story').count(),10);
  assert.equal(await page.locator('[data-check]').count(),36);
  assert.equal(await page.locator('#art .part-card').count(),4);
  const embedded=await page.locator('#embedded-demos').textContent();
  for(const [lang,name] of [['zh-CN','artist-animation-demo.html'],['en','artist-animation-demo.en.html']]){
    assert.equal(JSON.parse(embedded)[lang],await readFile(new URL('../../.scratch/spiderlings-spinner-capture/'+name,import.meta.url),'utf8'));
  }
  report.embeddedSourcesMatch=true;
  const broken=await page.locator('a[href^="#"]').evaluateAll(as=>as.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));
  assert.deepEqual(broken,[]);
  const action=async name=>page.locator(`[data-action="${name}"]`).click();
  const scenario=async name=>page.locator('#sim-scenario').selectOption(name);
  const state=()=>page.locator('#sim-state').textContent();
  for(let i=0;i<8;i++)await action('struggle');
  assert.match(await state(),/对抗成功/);assert.equal(await page.locator('#metric-energy').textContent(),'20');report.scenarios.push('8轮连续挣脱成功');
  await scenario('residual');for(let i=0;i<3;i++)await action('struggle');await action('potion');
  assert.equal(await page.locator('#metric-energy').textContent(),'100');assert.equal(await page.locator('#metric-round').textContent(),'4/8');
  for(let i=0;i<4;i++)await action('struggle');assert.match(await state(),/Wrapping/);report.scenarios.push('药水只计一回合；末回合残留失败');
  await scenario('exhaust');for(let i=0;i<5;i++)await action('struggle');assert.match(await state(),/Wrapping/);assert.equal(await page.locator('#metric-round').textContent(),'5/8');report.scenarios.push('20费用第五回合耗尽');
  await scenario('tie');for(let i=0;i<8;i++)await action('struggle');assert.match(await state(),/等待设计决定/);assert.match(await page.locator('#sim-boundary').textContent(),/优先级未确认/);report.scenarios.push('末次成功同时耗尽停在待定');
  await scenario('insufficient');await action('struggle');assert.equal(await page.locator('#metric-round').textContent(),'0/8');assert.equal(await page.locator('#metric-energy').textContent(),'5');await action('potion');assert.equal(await page.locator('#metric-energy').textContent(),'35');report.scenarios.push('费用不足提示待定，未重复收费');
  await scenario('partial');await action('blocked');assert.equal(await page.locator('.progress').getAttribute('aria-valuenow'),'40');await action('step');
  await page.locator('#save-sim').click();await action('interrupt');assert.match(await state(),/控制已归还/);assert.match(await page.locator('#sim-log').textContent(),/50% 半成品/);assert.equal(await page.locator('[data-action="cut"]').isDisabled(),true);
  await page.locator('#restore-sim').click();assert.match(await state(),/Wrapping/);assert.equal(await page.locator('.progress').getAttribute('aria-valuenow'),'50');for(let i=0;i<5;i++)await action('step');assert.match(await state(),/完整 Cocoon/);report.scenarios.push('阻塞不推进、半成品留存、快照恢复、完整后解锁');
  await scenario('cocoon');for(let i=0;i<3;i++)await action('cut');assert.match(await page.locator('#cocoon-state').textContent(),/待加固：是/);await action('quiet');assert.match(await page.locator('#cocoon-state').textContent(),/待加固：是.*停攻/);await action('hit');assert.match(await page.locator('#cocoon-state').textContent(),/已添加 \/ 固定/);assert.equal(await page.locator('#metric-escape').textContent(),'0.0%');await action('move');assert.match(await page.locator('#cocoon-state').textContent(),/警戒：活跃/);report.scenarios.push('待加固等待保留、命中加固修复、主动尝试唤醒');
  await scenario('cocoon');for(let i=0;i<20;i++)await action('cut');for(let i=0;i<25;i++)await action('remove');assert.match(await state(),/整体解除/);assert.match(await page.locator('#sim-log').textContent(),/原生回收/);report.scenarios.push('混用Cut和Remove共享整体进度');
  await scenario('two');assert.match(await state(),/未触发/);await scenario('success');await action('join');await action('struggle');assert.equal(await page.locator('#metric-tethers').textContent(),'0.33');report.scenarios.push('2只不触发；中途加入影响同一份强度');
  const checkbox=page.locator('[data-check]').first();await checkbox.check();await page.reload();assert.equal(await checkbox.isChecked(),true);
  const checksDownload=page.waitForEvent('download');await page.locator('#export-checks').click();assert.equal((await checksDownload).suggestedFilename(),'spinner-production-checks.json');report.checklistPersistence=true;
  await page.locator('#load-demo').click();
  const frame=()=>page.frames().find(f=>f.parentFrame());
  await page.waitForFunction(()=>document.querySelector('#demo-frame').contentDocument?.querySelector('#method'));
  for(const lang of ['zh-CN','en']){
    if(lang==='en'){await page.locator('[data-demo-lang="en"]').click();await page.waitForFunction(()=>document.querySelector('#demo-frame').contentDocument?.documentElement?.lang==='en');}
    const f=frame();await f.waitForFunction(()=>images.every(i=>i.complete&&i.naturalWidth===400));assert.equal(await f.locator('html').getAttribute('lang'),lang);
    await f.locator('#ribbon-progress').fill('96');await f.waitForFunction(()=>document.querySelector('#ribbon-image').complete);
    await f.locator('#restart').click();await f.waitForFunction(()=>Number(document.querySelector('#ribbon-progress').value)>1);await f.locator('#ribbon-pause').click();const paused=await f.locator('#ribbon-progress').inputValue();await page.waitForTimeout(150);assert.equal(await f.locator('#ribbon-progress').inputValue(),paused);
    if(await f.locator('#comparison-details').count())await f.locator('#comparison-details > summary').click();
    for(const mode of ['plain','steps','silk']){await f.locator('#method').selectOption(mode);await f.waitForFunction(()=>document.querySelector('video').readyState>=2);await f.locator('#restart').click();await f.waitForFunction(()=>document.querySelector('video').currentTime>0);await f.evaluate(()=>{video.pause();video.currentTime=video.duration*.6;});await f.waitForFunction(()=>!video.seeking&&video.readyState>=2);report.media.push({lang,mode,duration:await f.locator('video').evaluate(v=>v.duration)});}
    report.media.push({lang,mode:'ribbon',frames:await f.evaluate(()=>images.length),offlinePlayback:true});
  }
  await frame().locator('#language-link').click();await page.waitForFunction(()=>document.querySelector('#demo-frame').contentDocument?.documentElement?.lang==='zh-CN');report.embeddedLanguageLink=true;
  report.parts=[];
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:800});
    for(const lang of ['zh-CN','en']){
      await page.locator(`[data-demo-lang="${lang}"]`).click();
      await page.waitForFunction(lang=>document.querySelector('#demo-frame').contentDocument?.documentElement.lang===lang,lang);
      for(const selected of [72,98,150,160]){
        await page.locator(`#art [data-part-frame="${selected}"]`).click();
        await page.waitForFunction(({selected,lang})=>{
          const doc=document.querySelector('#demo-frame').contentDocument;
          return doc?.documentElement.lang===lang && doc.querySelector('#ribbon-progress')?.value===String(selected);
        },{selected,lang});
        const f=frame();
        assert.equal(await f.locator('.part-card').count(),4);
        assert.equal(await f.locator('#ribbon-pause').getAttribute('data-playing'),'false');
        const bounds=await page.evaluate(()=>{
          const f=document.querySelector('#demo-frame'),doc=f.contentDocument,offset=f.getBoundingClientRect().top+f.clientTop;
          return {top:offset+doc.querySelector('#ribbon-image').getBoundingClientRect().top,bottom:offset+doc.querySelector('#ribbon-progress').getBoundingClientRect().bottom,height:innerHeight};
        });
        assert.ok(bounds.top>=0&&bounds.bottom<=bounds.height,JSON.stringify({width,lang,selected,...bounds}));
      }
      report.parts.push({width,lang,frames:[72,98,150,160],visible:true});
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width===390)await page.locator('#art .thick-guide').screenshot({path:fileURLToPath(new URL('parts-mobile.png',output))});
  }
  await page.setViewportSize({width:1440,height:1024});
  await page.locator('#art .thick-guide').screenshot({path:fileURLToPath(new URL('parts-desktop.png',output))});
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL('desktop.png',output))});
  await page.locator('#behavior').screenshot({path:fileURLToPath(new URL('simulation.png',output))});
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.evaluate(()=>window.scrollTo(0,0));const content=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(content<=width,`${content} > ${width}`);report.widths.push({width,content});if(width===390)await page.screenshot({path:fileURLToPath(new URL('mobile.png',output))});}
  await page.setViewportSize({width:1440,height:1024});await frame().waitForFunction(()=>images.every(i=>i.complete));await page.locator('#animation').screenshot({path:fileURLToPath(new URL('animation.png',output))});
  await page.locator('details.source').first().locator('summary').click();const sourceDownload=page.waitForEvent('download');await page.locator('[data-source-download]').first().click();assert.equal((await sourceDownload).suggestedFilename(),'PRD.md');report.offlineSourceDownload=true;
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
  await writeFile(new URL('results.json',output),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
