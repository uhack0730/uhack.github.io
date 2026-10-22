(() => {
  'use strict';
  const LIMITS = { title: 40, season: 24, traits: 120, augments: 120, notes: 1200, gameCode: 2000 };
  const ROLES = { carry: '主 C', tank: '主坦', support: '辅助' };
  const COSTS = ['#718582', '#67a68b', '#69a3c2', '#b094d3', '#d6ae62'];
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const number = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || min)));
  const blank = () => ({ v: 1, title: '', season: '', traits: '', augments: '', notes: '', gameCode: '', units: Array(28).fill(null) });

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.units) || raw.units.length > 28) {
      throw new Error('阵容格式不正确，或链接版本暂不支持。');
    }
    const lineup = blank();
    for (const [key, max] of Object.entries(LIMITS)) lineup[key] = text(raw[key], max);
    raw.units.forEach((unit, position) => {
      if (!unit || typeof unit !== 'object') return;
      const name = text(unit.name, 20).trim();
      if (!name) return;
      lineup.units[position] = {
        name,
        cost: number(unit.cost, 1, 5),
        stars: number(unit.stars, 1, 3),
        role: Object.prototype.hasOwnProperty.call(ROLES, unit.role) ? unit.role : '',
        items: Array.from({ length: 3 }, (_, i) => text(Array.isArray(unit.items) ? unit.items[i] : '', 24).trim())
      };
    });
    return lineup;
  }

  function encode(lineup) {
    const bytes = new TextEncoder().encode(JSON.stringify(normalize(lineup)));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(value) {
    if (!value || value.length > 40000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('分享链接无效或内容过长。');
    try {
      const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
      return normalize(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)))));
    } catch (_) {
      throw new Error('无法读取阵容，请让分享者重新生成完整链接。');
    }
  }

  function toText(lineup) {
    const data = normalize(lineup);
    const lines = [data.title.trim() || '未命名阵容'];
    if (data.season) lines.push('赛季 / 版本：' + data.season);
    lines.push('');
    data.units.forEach((unit, i) => {
      if (!unit) return;
      const role = ROLES[unit.role] ? ' · ' + ROLES[unit.role] : '';
      const items = unit.items.filter(Boolean);
      lines.push(`${Math.floor(i / 7) + 1}排${i % 7 + 1}列：${unit.name} · ${unit.cost}费 · ${'★'.repeat(unit.stars)}${role}`);
      if (items.length) lines.push('装备：' + items.join(' / '));
    });
    if (data.traits) lines.push('\n核心羁绊：' + data.traits);
    if (data.augments) lines.push('\n强化符文：' + data.augments);
    if (data.notes) lines.push('\n运营思路：\n' + data.notes);
    if (data.gameCode) lines.push('\n游戏内阵容码：\n' + data.gameCode);
    return lines.join('\n');
  }

  // The codec also runs in Node so sharing can be checked independently of the UI.
  if (typeof module !== 'undefined' && module.exports) module.exports = { blank, normalize, encode, decode, toText };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const STORAGE = 'uhack.jcc.collection.v1';
  const DRAFT = 'uhack.jcc.draft.v1';
  let model = blank();
  let collection = [];
  let activeId = null;
  let selected = 0;
  let moveFrom = null;
  let dirty = false;
  let storageAvailable = true;
  let draftTimer;
  let toastTimer;
  let confirmAction = null;
  let shareSnapshot = null;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function notice(message) {
    $('notice').textContent = message;
    $('notice').hidden = !message;
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
  }

  function persist(key, value) {
    if (!storageAvailable) return false;
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) {
      storageAvailable = false;
      notice('浏览器存储不可用或空间不足。当前仍可编辑和分享；离开前请复制分享链接。');
      return false;
    }
  }

  function rememberDraft() {
    clearTimeout(draftTimer);
    persist(DRAFT, { lineup: model, activeId, dirty });
  }

  function changed() {
    dirty = true;
    $('draft-status').textContent = activeId ? '已修改' : '草稿';
    clearTimeout(draftTimer);
    draftTimer = setTimeout(rememberDraft, 350);
  }

  function confirm(title, message, action) {
    $('confirm-heading').textContent = title;
    $('confirm-copy').textContent = message;
    confirmAction = action;
    $('confirm-dialog').showModal();
  }

  function replaceDraft(action) {
    if (dirty) confirm('替换当前草稿？', '当前改动还没有保存到本机阵容。继续后会替换这份草稿。', action);
    else action();
  }

  function renderBoard(focusSelected = false) {
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < 4; row++) {
      const rowNode = element('div', 'board-row');
      for (let col = 0; col < 7; col++) {
        const position = row * 7 + col;
        const unit = model.units[position];
        const cell = element('button', 'hex' + (unit ? '' : ' empty') + (position === selected ? ' selected' : '') + (position === moveFrom ? ' moving' : ''));
        cell.type = 'button';
        cell.dataset.position = String(position);
        cell.tabIndex = position === selected ? 0 : -1;
        cell.setAttribute('aria-pressed', String(position === selected));
        let label = `${row + 1}排${col + 1}列，${unit ? unit.name : '空位'}`;
        if (unit) {
          label += `，${unit.cost}费，${unit.stars}星`;
          if (unit.items.some(Boolean)) label += '，装备：' + unit.items.filter(Boolean).join('、');
          cell.style.setProperty('--cost', COSTS[unit.cost - 1]);
          if (unit.role) cell.append(element('span', 'hex-role ' + unit.role));
          cell.append(element('span', 'hex-stars', '★'.repeat(unit.stars)), element('span', 'hex-name', unit.name));
          const items = element('span', 'hex-equipment');
          unit.items.filter(Boolean).forEach(() => items.append(element('i')));
          cell.append(items);
        } else cell.textContent = '+';
        cell.setAttribute('aria-label', label);
        cell.title = label;
        rowNode.append(cell);
      }
      fragment.append(rowNode);
    }
    $('board').replaceChildren(fragment);
    $('unit-count').textContent = String(model.units.filter(Boolean).length);
    if (focusSelected) $('board').querySelector(`[data-position="${selected}"]`).focus();
    $('board-tip').textContent = moveFrom === null ? '点击格子编辑棋子。选中已有棋子，可以移动或交换站位。' : '请选择目标格子；已有棋子会互换站位。再次点击「取消移动」或按 Esc 取消。';
  }

  function renderUnit() {
    const unit = model.units[selected];
    $('position-label').textContent = `${Math.floor(selected / 7) + 1} 排 · ${selected % 7 + 1} 列`;
    $('unit-name').value = unit ? unit.name : '';
    $('unit-cost').value = String(unit ? unit.cost : 1);
    $('unit-stars').value = String(unit ? unit.stars : 1);
    $('unit-role').value = unit ? unit.role : '';
    for (let i = 0; i < 3; i++) $('item-' + i).value = unit ? unit.items[i] : '';
    updateUnitButtons();
  }

  function updateUnitButtons() {
    $('move-unit').disabled = !model.units[selected];
    $('clear-unit').disabled = !model.units[selected];
    $('move-unit').textContent = moveFrom === null ? '移动棋子' : '取消移动';
  }

  function updateUnit() {
    const name = $('unit-name').value.trim();
    model.units[selected] = name ? {
      name, cost: Number($('unit-cost').value), stars: Number($('unit-stars').value), role: $('unit-role').value,
      items: [0, 1, 2].map(i => $('item-' + i).value.trim())
    } : null;
    moveFrom = null;
    changed();
    renderBoard();
    updateUnitButtons();
  }

  function chooseCell(position) {
    if (moveFrom !== null && moveFrom !== position) {
      [model.units[position], model.units[moveFrom]] = [model.units[moveFrom], model.units[position]];
      changed();
    }
    moveFrom = null;
    selected = position;
    renderBoard(true);
    renderUnit();
  }

  function renderCollection() {
    $('saved-count').textContent = String(collection.length);
    const query = $('search').value.trim().toLowerCase();
    const filtered = collection.filter(entry => [entry.lineup.title, entry.lineup.season, ...entry.lineup.units.filter(Boolean).map(u => u.name)].join(' ').toLowerCase().includes(query));
    const fragment = document.createDocumentFragment();
    if (!filtered.length) {
      const empty = element('div', 'empty-collection');
      empty.append(element('div', 'empty-symbol', '◇'), element('p', '', query ? '没有匹配的阵容' : '还没有收藏'), element('small', '', query ? '试试阵容名或棋子名' : '编辑完成后，点击「保存到本机」'));
      fragment.append(empty);
    }
    filtered.forEach(entry => {
      const card = element('div', 'saved-card' + (entry.id === activeId ? ' selected' : ''));
      const open = element('button', 'saved-card-open');
      open.type = 'button';
      open.append(element('strong', '', entry.lineup.title), element('small', '', `${entry.lineup.season || '未填赛季'} · ${entry.lineup.units.filter(Boolean).length} 个棋子`));
      open.addEventListener('click', () => {
        if (entry.id === activeId) return;
        replaceDraft(() => loadLineup(entry.lineup, entry.id));
      });
      const bottom = element('div', 'saved-card-bottom');
      const remove = element('button', 'text-button danger', '删除');
      remove.type = 'button';
      remove.setAttribute('aria-label', '删除阵容：' + entry.lineup.title);
      remove.addEventListener('click', () => confirm('删除本机阵容？', `将删除「${entry.lineup.title}」。已发出的分享链接仍然可用。`, () => {
        const next = collection.filter(item => item.id !== entry.id);
        if (!persist(STORAGE, next)) { toast('删除未完成：浏览器存储不可用'); return; }
        collection = next;
        if (activeId === entry.id) { activeId = null; dirty = true; $('draft-status').textContent = '草稿'; rememberDraft(); }
        renderCollection();
        toast('已删除本机收藏');
      }));
      bottom.append(remove);
      card.append(open, bottom);
      fragment.append(card);
    });
    $('saved-list').replaceChildren(fragment);
  }

  function render() {
    $('lineup-title').value = model.title;
    for (const key of ['season', 'traits', 'augments', 'notes']) $(key).value = model[key];
    $('game-code').value = model.gameCode;
    $('draft-status').textContent = activeId ? (dirty ? '已修改' : '已保存') : '草稿';
    renderBoard(); renderUnit(); renderCollection();
  }

  function loadLineup(value, id = null) {
    model = normalize(value);
    activeId = id;
    selected = Math.max(0, model.units.findIndex(Boolean));
    moveFrom = null;
    dirty = false;
    render(); rememberDraft();
  }

  function canShare() {
    if (!model.units.some(Boolean) && !model.gameCode.trim()) {
      toast('先添加一个棋子，或粘贴已有的游戏阵容码');
      $('unit-name').focus();
      return false;
    }
    return true;
  }

  async function copy(value, fallbackField) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        toast('已复制'); return true;
      }
    } catch (_) { /* Use the selection-based fallback on HTTP and denied clipboard access. */ }
    const field = element('textarea');
    field.value = value;
    field.setAttribute('aria-label', '待复制内容');
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;width:1px;height:1px';
    const focused = document.activeElement;
    const host = document.querySelector('dialog[open]') || document.body;
    host.append(field); field.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { /* Show manual selection. */ }
    field.remove();
    if (focused && typeof focused.focus === 'function') focused.focus();
    if (ok) toast('已复制');
    else {
      if (fallbackField) { fallbackField.focus(); fallbackField.select(); }
      toast('自动复制不可用，请选中文字后手动复制');
    }
    return ok;
  }

  function openShare() {
    if (!canShare()) return;
    shareSnapshot = normalize(model);
    if (!shareSnapshot.title.trim()) shareSnapshot.title = '未命名阵容';
    $('share-url').value = location.origin + location.pathname + '#lineup=' + encode(shareSnapshot);
    $('share-dialog').showModal();
    $('native-share').hidden = !(navigator.share && window.isSecureContext);
  }

  function readHash() {
    if (!location.hash.startsWith('#lineup=')) return false;
    try {
      $('editor-section').hidden = false;
      $('toggle-editor').setAttribute('aria-expanded', 'true');
      loadLineup(decode(location.hash.slice(8)));
      notice('正在查看分享的阵容。可以直接调整，或点击「保存到本机」收藏。');
    } catch (error) { notice(error.message); }
    return true;
  }

  // Load only this app's records; storage errors never prevent editing or sharing.
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error('Invalid collection');
      collection = parsed.slice(0, 50).flatMap(entry => {
        try { return [{ id: text(entry.id, 80), lineup: normalize(entry.lineup) }]; } catch (_) { return []; }
      }).filter(entry => entry.id);
    }
    const draft = localStorage.getItem(DRAFT);
    if (draft) {
      const parsed = JSON.parse(draft);
      model = normalize(parsed.lineup);
      activeId = collection.some(entry => entry.id === parsed.activeId) ? parsed.activeId : null;
      dirty = Boolean(parsed.dirty);
    }
  } catch (_) {
    storageAvailable = false;
    notice('暂时无法读取本机记录，原有记录未覆盖。仍可编辑阵容并生成分享链接。');
  }

  render();
  readHash();
  $('board').addEventListener('click', event => {
    const cell = event.target.closest('button[data-position]');
    if (cell) chooseCell(Number(cell.dataset.position));
  });
  $('board').addEventListener('keydown', event => {
    const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!Object.prototype.hasOwnProperty.call(deltas, event.key)) return;
    event.preventDefault();
    selected = Math.max(0, Math.min(27, selected + deltas[event.key]));
    renderBoard(true);
    if (moveFrom === null) renderUnit();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && moveFrom !== null) { moveFrom = null; renderBoard(); renderUnit(); }
  });
  for (const id of ['unit-name', 'unit-cost', 'unit-stars', 'unit-role', 'item-0', 'item-1', 'item-2']) $(id).addEventListener('input', updateUnit);
  for (const [id, key] of Object.entries({ 'lineup-title': 'title', season: 'season', traits: 'traits', augments: 'augments', notes: 'notes', 'game-code': 'gameCode' })) {
    $(id).addEventListener('input', () => { model[key] = $(id).value; changed(); });
  }
  $('move-unit').addEventListener('click', () => {
    moveFrom = moveFrom === null ? selected : null;
    renderBoard(true); updateUnitButtons();
  });
  $('clear-unit').addEventListener('click', () => { model.units[selected] = null; moveFrom = null; changed(); renderBoard(); renderUnit(); });
  $('new-lineup').addEventListener('click', () => replaceDraft(() => {
    history.replaceState(null, '', location.pathname + location.search);
    notice(''); loadLineup(blank()); $('lineup-title').focus();
  }));
  $('save-lineup').addEventListener('click', () => {
    if (!model.title.trim()) { toast('先给阵容起个名字'); $('lineup-title').focus(); return; }
    if (!canShare()) return;
    if (!activeId && collection.length >= 50) { toast('本机最多保存 50 套阵容，请先删除不用的收藏'); return; }
    const id = activeId || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    const snapshot = normalize(model);
    snapshot.title = snapshot.title.trim();
    const next = [{ id, lineup: snapshot }, ...collection.filter(entry => entry.id !== id)];
    if (!persist(STORAGE, next)) { toast('未保存，请复制分享链接保留阵容'); return; }
    collection = next; activeId = id; model = snapshot; dirty = false;
    render(); rememberDraft(); toast('已保存到本机');
  });
  $('search').addEventListener('input', renderCollection);
  $('share-lineup').addEventListener('click', openShare);
  $('copy-link').addEventListener('click', () => copy($('share-url').value, $('share-url')));
  $('copy-text').addEventListener('click', async () => {
    const value = toText(shareSnapshot);
    if (!await copy(value)) {
      $('share-url').value = value;
      $('share-url').focus(); $('share-url').select();
      $('copy-link').hidden = true;
      $('native-share').hidden = true;
      toast('阵容文字已显示，请手动复制；重新打开窗口可恢复链接');
    }
  });
  $('share-dialog').addEventListener('close', () => { $('copy-link').hidden = false; });
  $('copy-game-code').addEventListener('click', () => {
    if (!model.gameCode.trim()) { toast('请先粘贴游戏内的阵容码'); $('game-code').focus(); return; }
    copy(model.gameCode, $('game-code'));
  });
  $('native-share').addEventListener('click', async () => {
    try { await navigator.share({ title: shareSnapshot.title, text: '金铲铲阵容：' + shareSnapshot.title, url: $('share-url').value }); }
    catch (error) { if (error.name !== 'AbortError') toast('系统分享不可用，请复制链接'); }
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('confirm-action').addEventListener('click', () => {
    const action = confirmAction;
    confirmAction = null;
    $('confirm-dialog').close();
    if (action) action();
  });
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#lineup=')) replaceDraft(readHash);
  });
  window.addEventListener('jcc-recommendation', event => {
    if (event.detail.share) {
      shareSnapshot = normalize(event.detail.lineup);
      $('share-url').value = location.origin + location.pathname + '#lineup=' + encode(shareSnapshot);
      $('native-share').hidden = !(navigator.share && window.isSecureContext);
      $('share-dialog').showModal();
    } else replaceDraft(() => {
      loadLineup(event.detail.lineup);
      $('editor-section').hidden = false;
      $('toggle-editor').setAttribute('aria-expanded', 'true');
      $('editor-section').scrollIntoView({behavior:'smooth'});
    });
  });
  $('toggle-editor').addEventListener('click', () => {
    $('editor-section').hidden = !$('editor-section').hidden;
    $('toggle-editor').setAttribute('aria-expanded', String(!$('editor-section').hidden));
    if (!$('editor-section').hidden) $('editor-section').scrollIntoView({behavior:'smooth'});
  });
  window.addEventListener('pagehide', rememberDraft);
})();
