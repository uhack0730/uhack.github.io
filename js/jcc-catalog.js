(() => {
  'use strict';
  const SOURCE = 'https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m19/11/18/lineup_detail_total.json';
  function convert(rows, heroes, items) {
    if (!Array.isArray(rows) || rows.length > 500) throw new Error('Invalid feed');
    return rows.flatMap(row => {
      try {
        const detail = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail;
        if (!detail || !Array.isArray(detail.hero_location)) return [];
        const title = String(detail.line_name || '').slice(0, 120);
        const match = title.match(/^【([^】]+)】(.*)$/);
        const three = String(detail.level_3_heros || '').split(',');
        const units = Array(28).fill(null);
        for (const unit of detail.hero_location) {
          if (unit.chess_type === 'pet') continue;
          const hero = heroes[unit.hero_id];
          const pos = String(unit.location).split(',').map(Number);
          if (!hero || pos.length !== 2 || !pos.every(Number.isInteger) || pos[0] < 1 || pos[0] > 4 || pos[1] < 1 || pos[1] > 7) throw new Error('Unknown hero or position');
          units[(pos[0] - 1) * 7 + pos[1] - 1] = {name:hero.name,cost:hero.cost,stars:three.includes(String(unit.hero_id))?3:2,role:unit.is_carry_hero?'carry':'',items:String(unit.equipment_id || '').split(',').filter(Boolean).map(id=>items[id] || '待核对装备').slice(0,3),icon:hero.icon};
        }
        if (!units.some(Boolean)) return [];
        return [{id:String(row.id),title:match?match[1]:title,traits:match?match[2]:'',patch:String(row.simulator_edition || '').replace(/^18\./,''),date:String(row.rel_time || '').slice(0,10),quality:/^[SABC]$/.test(row.quality)?row.quality:'',units}];
      } catch (_) { return []; }
    });
  }
  if (typeof module !== 'undefined') module.exports = {convert};
  if (typeof document === 'undefined') return;
  const data = window.JCC_DATA;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let comps=convert(data.rows,data.heroes,data.items), filter='all', limit=12, current=null;
  function portrait(unit) {
    const box=el('div','champion');box.style.setProperty('--cost', ['#81938e','#70b993','#75b9df','#c19deb','#e9be72'][Math.max(0,Math.min(4,unit.cost-1))]);
    const img=el('img');
    if (/^https:\/\/game\.gtimg\.cn\//.test(unit.icon)) img.src=unit.icon;
    img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>{img.hidden=true;},{once:true});
    box.append(img,el('span','champion-name',unit.name));return box;
  }
  function show(comp) {
    current=comp;$('comp-title').textContent=comp.title;$('comp-meta').textContent='官网攻略 · '+comp.patch+' · '+comp.date;$('comp-traits').textContent=comp.traits;
    const board=$('comp-board');board.replaceChildren();
    comp.units.forEach((unit,i)=>{const cell=el('div','comp-cell');cell.title=(Math.floor(i/7)+1)+'排'+(i%7+1)+'列';if(unit){cell.append(portrait(unit));if(unit.stars===3)cell.append(el('span','three-star','★★★'));if(unit.role==='carry')cell.classList.add('main-carry');}board.append(cell);});
    const equip=$('comp-equipment');equip.replaceChildren();
    for(const unit of comp.units.filter(u=>u&&u.items.length)){
      const row=el('div','equipment-row');row.append(el('strong','',unit.name+(unit.role==='carry'?' · 主 C':'')),el('span','',unit.items.join(' / ')));equip.append(row);
    }
    if(!equip.children.length)equip.append(el('p','catalog-disclaimer','该攻略未标注装备，请查看官网详情。'));
    $('comp-dialog').showModal();
  }
  function render() {
    const query=$('catalog-search').value.trim().toLowerCase();
    const list=comps.filter(c=>(filter==='all'||(filter==='S'?c.quality==='S':c.units.some(u=>u&&u.stars===3)))&&[c.title,c.traits,...c.units.filter(Boolean).map(u=>u.name)].join(' ').toLowerCase().includes(query));
    $('catalog-count').textContent=list.length;
    const grid=$('catalog-grid');grid.replaceChildren();
    list.slice(0,limit).forEach(c=>{
      const card=el('article','comp-card');
      const head=el('div','comp-card-heading');head.append(el('span','grade',c.quality||'攻略'),el('span','card-patch','攻略 '+c.patch),el('span','card-date',c.date));card.append(head);
      card.append(el('h3','',c.title),el('p','card-traits',c.traits));
      const roster=el('div','champion-list');c.units.filter(Boolean).sort((a,b)=>(b.role==='carry')-(a.role==='carry')).forEach(u=>roster.append(portrait(u)));card.append(roster);
      const carry=c.units.find(u=>u&&u.role==='carry');card.append(el('p','carry-note',carry?'主 C · '+carry.name+(carry.items.length?'  /  '+carry.items.join(' · '):''):'查看完整站位与装备'));
      const bottom=el('div','comp-card-bottom');bottom.append(el('span','',c.units.some(u=>u&&u.stars===3)?'有追三目标':'等级运营'));
      const button=el('button','text-button','查看阵容 →');button.setAttribute('aria-label','查看'+c.title);button.addEventListener('click',()=>show(c));bottom.append(button);card.append(bottom);grid.append(card);
    });
    if(!list.length)grid.append(el('p','catalog-empty','没有匹配的阵容，换个英雄或羁绊试试。'));
    $('more-comps').hidden=list.length<=limit;
  }
  function status(prefix) {
    const versions=[...new Set(comps.map(c=>c.patch))].join(' / ');
    $('catalog-status').textContent=prefix+' · 攻略版本 '+versions;
  }
  async function refresh() {
    const button=$('refresh-catalog');button.disabled=true;button.textContent='正在同步…';
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(SOURCE,{signal:controller.signal,cache:'no-cache',credentials:'omit'});
      if(!response.ok)throw new Error('Feed unavailable');
      const raw=await response.json();const next=convert(raw.lineup_list,data.heroes,data.items);
      if(next.length<3)throw new Error('Incomplete feed');
      comps=next;render();status('已同步官网 · '+new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}));
    } catch (_) { status('官网暂未连通，显示 '+data.checkedAt+' 收录内容'); }
    finally {clearTimeout(timeout);button.disabled=false;button.textContent='刷新阵容 ↻';}
  }
  $('catalog-search').addEventListener('input',()=>{limit=12;render();});
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;limit=12;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});render();}));
  $('more-comps').addEventListener('click',()=>{limit+=12;render();});$('refresh-catalog').addEventListener('click',refresh);
  function use(share) {
    if(!current)return;
    const c=current;const lineup={v:1,title:c.title,season:'自然之力 '+c.patch,traits:c.traits,augments:'',gameCode:'',notes:'来源：金铲铲之战官网阵容攻略\n攻略版本：'+c.patch+'；发布日期：'+c.date+'\nhttps://jcc.qq.com/#/lineup\n站位与装备按攻略记录，未包含小精灵等召唤单位。',units:c.units};
    $('comp-dialog').close();window.dispatchEvent(new CustomEvent('jcc-recommendation',{detail:{lineup,share}}));
  }
  $('share-recommendation').addEventListener('click',()=>use(true));$('edit-recommendation').addEventListener('click',()=>use(false));
  render();status('已收录 '+data.checkedAt+' 官网内容');refresh();
})();
