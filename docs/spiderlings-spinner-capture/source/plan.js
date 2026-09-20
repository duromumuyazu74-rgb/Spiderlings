(() => {
  const $ = id => document.getElementById(id);
  let state, config, snapshot;
  const log = message => { state.log.push(message); };
  const num = (id, fallback, min, max) => { const v = Number($(id).value); return Number.isFinite(v) ? Math.max(min,Math.min(max,v)) : fallback; };
  function reset(useForm = false) {
    const scenario = $('sim-scenario').value;
    if (!useForm) {
      const values = {energy:100, spiders:3, cost:10, remove:1, regen:0, wait:10};
      if (scenario === 'exhaust') values.cost=20;
      if (scenario === 'tie') values.energy=80;
      if (scenario === 'insufficient') values.energy=5;
      if (scenario === 'two') values.spiders=2;
      for (const [k,v] of Object.entries(values)) $('cfg-'+k).value=v;
    }
    config={energy:num('cfg-energy',100,0,100),spiders:num('cfg-spiders',3,2,8),cost:num('cfg-cost',10,1,30),remove:num('cfg-remove',1,.1,5),regen:num('cfg-regen',0,0,20),wait:num('cfg-wait',10,0,30)};
    state={phase:config.spiders>=3?'contest':'idle',round:0,energy:config.energy,spiders:Math.floor(config.spiders),tethers:0,wrap:0,escape:0,tick:0,quiet:0,activeTurns:[],pending:false,outer:false,alert:true,boundary:'',log:[]};
    if (!useForm && scenario==='partial') {state.phase='wrap';state.wrap=.4;}
    if (!useForm && scenario==='cocoon') {state.phase='complete';state.wrap=1;}
    log('开始说明场景：'+$('sim-scenario').selectedOptions[0].textContent+'。参数均为上方标注的演示假设。');
    if (scenario==='residual') log('建议先挣脱3次，第4回合喝药，再继续挣脱至第8回合。');
    if (state.phase==='contest' && state.energy===0) {state.phase='wrap';log('初始精力已耗尽：示意进入包裹；触发时零精力的具体时序仍需实机细化。');}
    render();
  }
  function act(action) {
    if (!allowed(action)) return;
    state.boundary='';
    if(action==='join'){state.spiders++;log('一只加入；示意强度按人数/3提高，整组仍每回合只一份。');}
    else if(action==='interrupt'){state.phase='interrupt';log('外部打断：撤除遭遇固定与活动连线；'+(state.wrap?'保留 '+Math.round(state.wrap*100)+'% 半成品，难度与门禁待定。':'恢复控制；临时对象清理采用当前建议。'));}
    else if(state.phase==='contest') {
      if (action==='struggle' && state.energy<config.cost) {state.boundary='待定 O02：精力非零但不足一次费用。本模拟不扣费、不推进；可比较等待或喝药。';render();return;}
      state.round++; state.tick++;
      const applied=state.spiders/3;
      state.tethers+=applied;
      if(action==='struggle'){state.energy-=config.cost;state.tethers=Math.max(0,state.tethers-config.remove);}
      if(action==='potion') state.energy=Math.min(100,state.energy+30);
      state.energy=Math.min(100,state.energy+(action==='wait'?config.wait:config.regen));
      state.tethers=Math.round(state.tethers*1000)/1000;
      log(`第${state.round}回合：${{struggle:'挣脱',wait:'原生等待（恢复为模拟输入）',potion:'药水已消耗并恢复；算跳过',attack:'合法攻击结算；算跳过'}[action]}；一份强度 ${applied.toFixed(2)}，残留 ${state.tethers}，精力 ${state.energy}。`);
      if(state.round===8 && state.tethers===0 && state.energy===0){state.phase='decision';state.boundary='待定 O02：最后一次成功且精力耗尽，胜负优先级未确认。';log(state.boundary);}
      else if(state.energy<=0 || (state.round===8 && state.tethers>0)){state.phase='wrap';log('对抗失败：自动包裹，持续固定；世界正常运行。');}
      else if(state.round===8){state.phase='won';log('八回合结束无残留：对抗成功，清除本遭遇控制。');}
    } else if(state.phase==='wrap') {
      if(action==='blocked') log('路线阻塞：没有有效协作步，包裹高度不增加；超时策略待定。');
      if(action==='step'){state.tick++;state.wrap=Math.min(1,Math.round((state.wrap+.1)*10)/10);log('模拟全组完成合法协作步：覆盖 '+Math.round(state.wrap*100)+'%。');if(state.wrap===1){state.phase='complete';state.tethers=0;log('完整结茧：释放遭遇固定与活动丝；初始慢移，无外网。');}}
    } else if(state.phase==='complete') {
      if(action==='quiet'){state.tick+=25;state.quiet+=25;state.alert=false;log('25 回合无主动行动：停攻并开始逐渐散开；待加固标记保留。');}
      else if(action==='hit'){state.escape=Math.max(0,state.escape-.1);if(state.pending){state.outer=true;state.pending=false;}log('合格直接命中：最多修复10%总进度；若待加固则添加外网并固定。该事件不作为玩家主动行动。');}
      else {
        state.tick++;state.quiet=0;state.alert=true;
        if(action==='cut'||action==='remove'){
          state.escape=Math.min(1,state.escape+(action==='cut'?1/40:1/50));
          state.activeTurns=state.activeTurns.filter(t=>state.tick-t<12);state.activeTurns.push(state.tick);
          if(state.activeTurns.length>=3&&!state.outer)state.pending=true;
          log(`${action==='cut'?'Cut':'Remove'}：共享脱困 ${(state.escape*100).toFixed(1)}%；每次按钮在本模拟折算一回合，原生时长需实机结算。`);
          if(state.escape>=1-1e-9){state.escape=1;state.phase='escaped';state.outer=false;state.pending=false;log('整件脱困成功：'+(action==='cut'?'按最终切割动作销毁。':'按最终 Remove 动作走原生回收。'));}
        } else log(state.outer?'被外网固定阻止的移动尝试：恢复警戒。':'慢移 / 主动移动：恢复警戒。');
      }
    }
    render();
  }
  function allowed(action){
    if(action==='join')return state.phase==='contest'&&state.spiders<8;
    if(action==='interrupt')return ['contest','wrap'].includes(state.phase);
    if(state.phase==='contest')return ['struggle','wait','potion','attack'].includes(action);
    if(state.phase==='wrap')return ['step','blocked'].includes(action);
    if(state.phase==='complete')return ['cut','remove','hit','move','quiet'].includes(action);
    return false;
  }
  function render(){
    const names={idle:'未触发：参与者不足',contest:'Contest · 固定原地 / 玩家提交',wrap:'Wrapping · 自动包裹 / 固定',complete:'Finished · 完整 Cocoon',interrupt:'Interrupted · 控制已归还',won:'对抗成功 · 控制已归还',escaped:'整体解除',decision:'等待设计决定'};
    $('sim-state').textContent=names[state.phase];$('sim-boundary').textContent=state.boundary;
    $('metric-round').textContent=state.round+'/8';$('metric-energy').textContent=state.energy;
    $('metric-tethers').textContent=state.tethers.toFixed(2);$('metric-escape').textContent=(state.escape*100).toFixed(1)+'%';
    $('wrap-progress').style.width=state.wrap*100+'%';$('wrap-progress').parentElement.setAttribute('aria-valuenow',Math.round(state.wrap*100));
    $('cocoon-state').textContent=state.phase==='complete'?`待加固：${state.pending?'是':'否'} · 外网：${state.outer?'已添加 / 固定':'无 / 慢移'} · 警戒：${state.alert?'活跃':'停攻并渐散'}。`:'半成品与完整状态分开；按钮只开放当前阶段适用事件。';
    $('sim-log').replaceChildren(...state.log.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));$('sim-log').parentElement.scrollTop=$('sim-log').parentElement.scrollHeight;
    document.querySelectorAll('[data-action]').forEach(b=>b.disabled=!allowed(b.dataset.action));
    const branch={decision:'contest',won:'idle',escaped:'idle',interrupt:'interrupt',contest:'contest',wrap:'wrap',complete:'complete',idle:'idle'}[state.phase];
    document.querySelectorAll('[data-node]').forEach(n=>n.classList.toggle('active',n.dataset.node===branch));
    let svg='';for(let y=0;y<7;y++)for(let x=0;x<7;x++)svg+=`<rect class="cell" x="${5+x*50}" y="${5+y*50}" width="50" height="50"/>`;
    const ongoing=['contest','wrap','decision'].includes(state.phase);
    if(ongoing)svg+='<rect x="31" y="31" width="298" height="298" fill="none" stroke="#71885c" stroke-width="8" stroke-dasharray="13 5"/>';
    for(let i=0;i<state.spiders;i++){const a=i/state.spiders*Math.PI*2+state.wrap*4;const x=180+Math.cos(a)*112,y=180+Math.sin(a)*112;if(ongoing)svg+=`<line class="tether" x1="180" y1="180" x2="${x}" y2="${y}"/>`;svg+=`<circle class="spider" cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y+4}" font-size="11" fill="white" text-anchor="middle">${i+1}</text>`;}
    svg+='<circle class="player" cx="180" cy="180" r="23"/>';
    if(state.wrap&&state.phase!=='escaped')svg+=`<path d="M157 186h46M158 194h44M160 178h40" stroke="#fffdf7" stroke-width="5"/><text x="180" y="224" text-anchor="middle" font-size="14">${Math.round(state.wrap*100)}% 包裹</text>`;
    $('sim-map').innerHTML=svg;
  }
  $('reset-sim').onclick=()=>reset();$('sim-scenario').onchange=()=>reset();$('apply-config').onclick=()=>reset(true);
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action));
  $('save-sim').onclick=()=>{snapshot=structuredClone({state,config});$('restore-sim').disabled=false;log('已保存本页模拟快照。');render();};
  $('restore-sim').onclick=()=>{if(snapshot){({state,config}=structuredClone(snapshot));log('从快照恢复：不重置对抗回合或包裹高度。');render();}};
  reset();

  let demoLang='zh-CN',demoLoaded=false;
  const embedded=JSON.parse($('embedded-demos').textContent);
  function loadDemo(lang,partFrame){
    demoLang=lang;demoLoaded=true;
    const bridge=`<script>document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&/artist-animation-demo(?:\\.en)?\\.html/.test(a.getAttribute('href')||'')){e.preventDefault();parent.postMessage({spinnerDemoLanguage:${JSON.stringify(lang==='en'?'zh-CN':'en')}},'*');}});<\/script>`;
    // srcdoc cannot replace its URL with the standalone viewer's query string.
    const viewer=embedded[lang].replace("history.replaceState(null, '', url);", "if (location.href !== 'about:srcdoc') history.replaceState(null, '', url);");
    $('demo-frame').onload=()=>{
      const f=$('demo-frame');
      if(partFrame!==undefined){
        f.scrollIntoView({block:'start',behavior:'instant'});
        f.contentDocument.querySelector(`[data-part-frame="${partFrame}"]`).click();
      }else{
        const target=f.contentDocument.getElementById('animation');
        if(target)f.contentWindow.scrollTo({top:target.offsetTop,behavior:'instant'});
      }
    };
    $('demo-frame').srcdoc=viewer.replace('</body>',bridge+'</body>');$('demo-frame').hidden=false;$('demo-placeholder').hidden=true;$('load-demo').textContent='重新加载试片';
    document.querySelectorAll('[data-demo-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.demoLang===lang)));
  }
  $('load-demo').onclick=()=>loadDemo(demoLang);
  document.querySelectorAll('#art [data-part-frame]').forEach(button=>button.onclick=()=>loadDemo(demoLang,Number(button.dataset.partFrame)));
  document.querySelectorAll('[data-demo-lang]').forEach(b=>b.onclick=()=>{demoLang=b.dataset.demoLang;if(demoLoaded)loadDemo(demoLang);else document.querySelectorAll('[data-demo-lang]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  window.addEventListener('message',e=>{if(e.source===$('demo-frame').contentWindow&&['en','zh-CN'].includes(e.data?.spinnerDemoLanguage))loadDemo(e.data.spinnerDemoLanguage);});
  const key='spinner-production-plan-checks-v1';
  let checked={};try{checked=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
  const boxes=[...document.querySelectorAll('[data-check]')];
  function feedback(saved=true){$('check-feedback').textContent=`已核对 ${boxes.filter(b=>b.checked).length} / ${boxes.length} 项。`+(saved?'保存在当前浏览器。':'浏览器未提供持久存储，请导出核对记录。');}
  boxes.forEach(b=>{b.checked=checked[b.dataset.check]===true;b.onchange=()=>{checked[b.dataset.check]=b.checked;let saved=true;try{localStorage.setItem(key,JSON.stringify(checked));}catch{saved=false;}feedback(saved);};});feedback();
  function download(name,text,type){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('export-checks').onclick=()=>download('spinner-production-checks.json',JSON.stringify({document:'spinner-production-plan',exportedAt:new Date().toISOString(),checked},null,2),'application/json');
  document.querySelectorAll('[data-source-download]').forEach(b=>b.onclick=()=>download(b.dataset.sourceDownload,$(b.dataset.sourceTarget).textContent,'text/markdown;charset=utf-8'));
  $('print-plan').onclick=()=>window.print();
  let openedBeforePrint=[];
  window.addEventListener('beforeprint',()=>{openedBeforePrint=[...document.querySelectorAll('details')].filter(d=>d.open);document.querySelectorAll('details.story').forEach(d=>d.open=true);});
  window.addEventListener('afterprint',()=>document.querySelectorAll('details.story').forEach(d=>d.open=openedBeforePrint.includes(d)));
})();
