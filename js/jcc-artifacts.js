(() => {
  'use strict';
  function rank(comps, artifacts) {
    if(!artifacts.length)return [];
    return comps.map(comp=>{
      const matches=artifacts.map(artifact=>{
        const candidates=comp.units.filter(u=>u&&artifact.heroes.includes(u.name)).sort((a,b)=>(b.role==='carry')-(a.role==='carry')||b.cost-a.cost);
        return {artifact,candidates,holder:candidates[0]||null};
      });
      const matched=matches.filter(m=>m.holder).length;
      const carries=matches.filter(m=>m.holder?.role==='carry').length;
      return {comp,matches,matched,complete:matched===artifacts.length,carries};
    }).filter(r=>r.matched).sort((a,b)=>b.matched-a.matched||b.carries-a.carries||a.comp.title.localeCompare(b.comp.title,'zh-CN'));
  }
  if(typeof module!=='undefined')module.exports={rank};
  if(typeof document==='undefined')return;
  const data=window.JCC_ARTIFACTS;
  const $=id=>document.getElementById(id);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let comps=[],selected=[],category='全部',limit=6,mode='catalog';
  const selectedItems=()=>selected.map(id=>data.items.find(a=>a.id===id)).filter(Boolean);
  function setMode(next) {
    mode=next;$('artifact-section').hidden=mode!=='artifacts';$('recommendations').hidden=mode==='artifacts';
    for(const [id,name] of [['mode-artifacts','artifacts'],['mode-catalog','catalog']]){$(id).classList.toggle('active',mode===name);$(id).setAttribute('aria-pressed',String(mode===name));}
  }
  function select(id) {
    if(selected.includes(id))selected=selected.filter(x=>x!==id);
    else if(selected.length<3)selected.push(id);
    else{$('artifact-feedback').textContent='已选 3 件，请先取消一件再选择。';return;}
    limit=6;$('artifact-feedback').textContent='';$('artifact-link-field').hidden=true;$('artifact-share-feedback').textContent='';
    renderOptions();renderResults();
  }
  function renderOptions() {
    const q=$('artifact-search').value.trim().toLowerCase();
    const list=data.items.filter(a=>(category==='全部'||a.kind===category)&&[a.name,a.aliases].join(' ').toLowerCase().includes(q));
    const options=$('artifact-options');options.replaceChildren();
    list.forEach(a=>{const b=el('button','artifact-option'+(selected.includes(a.id)?' selected':''));b.type='button';b.setAttribute('aria-pressed',String(selected.includes(a.id)));b.setAttribute('aria-label',a.name);b.append(el('span','artifact-symbol','◇'),el('span','',a.name),el('small','',a.kind));b.addEventListener('click',()=>select(a.id));options.append(b);});
    if(!list.length)options.append(el('p','artifact-no-options','没有找到神器。可换个名称，或切换到「全部」。'));
    const tray=$('artifact-selected');tray.replaceChildren();
    if(!selected.length)tray.append(el('span','artifact-placeholder','还没选择神器'));
    selectedItems().forEach(a=>{const b=el('button','artifact-chip',a.name+' ×');b.setAttribute('aria-label','取消'+a.name);b.addEventListener('click',()=>select(a.id));tray.append(b);});
    $('clear-artifacts').hidden=!selected.length;$('artifact-share-panel').hidden=!selected.length;
  }
  function renderResults() {
    const root=$('artifact-results');root.replaceChildren();const arts=selectedItems();
    if(!arts.length){$('artifact-summary').textContent='先选一件神器';root.append(el('div','artifact-empty','例如选择「疾射火炮」，查看可利用攻速与射程的阵容。'));$('more-artifacts').hidden=true;return;}
    const ranked=rank(comps,arts);const complete=ranked.filter(r=>r.complete).length;
    $('artifact-summary').textContent=complete?complete+' 套阵容可分配全部已选神器':ranked.length?'暂时没有同时适配的阵容，以下只匹配部分神器':'当前收录阵容中没有找到适配方案';
    if(!ranked.length)root.append(el('div','artifact-empty','尝试减少一件神器。没有匹配不代表游戏里一定不能玩，只代表本站还没有相应搭配。'));
    ranked.slice(0,limit).forEach(result=>{
      const c=result.comp;const card=el('article','artifact-result');
      const top=el('div','artifact-result-top');top.append(el('span','artifact-match'+(result.complete?' complete':''),result.complete?'全部可分配':result.matched+' / '+arts.length+' 件可分配'),el('span','card-patch','基础攻略 '+c.patch));card.append(top,el('h3','',c.title),el('p','card-traits',c.traits));
      result.matches.forEach(m=>{
        const row=el('div','artifact-assignment');
        row.append(el('strong','',m.artifact.name+' → '+(m.holder?m.holder.name:'未找到适配携带者')));
        if(m.holder){row.append(el('p','',m.artifact.reason),el('p','artifact-condition','条件：'+m.artifact.condition));if(m.candidates.length>1)row.append(el('p','artifact-alternatives','同阵容可考虑：'+m.candidates.slice(1).map(u=>u.name).join('、')));}
        else row.append(el('p','artifact-condition','这套阵容没有本站已整理的适配棋子，不为凑齐神器硬推荐。'));
        card.append(row);
      });
      const bottom=el('div','artifact-result-bottom');bottom.append(el('span','',result.carries?'已匹配主 C':'前排 / 辅助补强'));
      const open=el('button','text-button','查看基础阵容 →');open.setAttribute('aria-label','神器搭配查看'+c.title);open.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('jcc-show-comp',{detail:c.id})));bottom.append(open);card.append(bottom);root.append(card);
    });
    $('more-artifacts').hidden=ranked.length<=limit;
  }
  const cats=$('artifact-categories');
  ['全部','攻速','物理','法术','战士','坦克','通用'].forEach(name=>{const b=el('button','filter'+(name===category?' active':''),name);b.setAttribute('aria-pressed',String(name===category));b.addEventListener('click',()=>{category=name;cats.querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderOptions();});cats.append(b);});
  $('artifact-search').addEventListener('input',renderOptions);
  $('clear-artifacts').addEventListener('click',()=>{selected=[];limit=6;$('artifact-feedback').textContent='';renderOptions();renderResults();});
  $('more-artifacts').addEventListener('click',()=>{limit+=6;renderResults();});
  $('mode-artifacts').addEventListener('click',()=>setMode('artifacts'));
  $('mode-catalog').addEventListener('click',()=>setMode('catalog'));
  window.addEventListener('jcc-catalog-ready',event=>{comps=event.detail;renderResults();});
  window.addEventListener('jcc-comp-detail',event=>{
    let box=$('detail-artifact-notes');if(!box){box=el('section','detail-artifact-notes');box.id='detail-artifact-notes';$('comp-equipment').after(box);}
    box.replaceChildren();const comp=event.detail;
    const arts=selected.length&&mode==='artifacts'?selectedItems():data.items;
    const relevant=arts.flatMap(a=>{const r=rank([comp],[a])[0];return r?r.matches.filter(m=>m.holder):[];}).slice(0,selected.length||4);
    box.hidden=!relevant.length;
    if(relevant.length){box.append(el('h3','equip-title','神器搭配建议'),el('p','catalog-disclaimer','以下为机制推导。上方仍是原攻略配装，神器需要替换装备位；替换时保留必要的启动、续航与输出。'));relevant.forEach(m=>{const r=el('div','artifact-assignment');r.append(el('strong','',m.artifact.name+' → '+m.holder.name),el('p','',m.artifact.reason),el('p','artifact-condition','条件：'+m.artifact.condition));box.append(r);});}
  });
  $('share-artifacts').addEventListener('click',async()=>{
    const url=new URL(location.href);url.hash='artifacts='+selected.join(',');
    const input=$('artifact-link');input.value=url.href;
    try {await navigator.clipboard.writeText(url.href);$('artifact-share-feedback').textContent='链接已复制，打开即可恢复神器选择。';}
    catch(_){$('artifact-link-field').hidden=false;input.focus();input.select();$('artifact-share-feedback').textContent='请复制上方链接。';}
  });
  function readHash(){if(!location.hash.startsWith('#artifacts='))return;selected=[...new Set(location.hash.slice(11).split(','))].filter(id=>data.items.some(a=>a.id===id)).slice(0,3);limit=6;setMode('artifacts');renderOptions();renderResults();}
  window.addEventListener('hashchange',readHash);renderOptions();renderResults();readHash();
})();
