'use strict';

const STORAGE_KEY = 'garantijos_v1';
const CATEGORIES = ['Elektronika', 'Buitinė technika', 'Avalynė / drabužiai', 'Baldai', 'Automobiliai', 'Kita'];

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  view: 'list',       // list | add | detail
  items: [],
  selected: null,
  search: '',
  filterCat: 'Visos',
  sortBy: 'name',
  form: emptyForm(),
  imagePreview: null,
  analyzing: false,
};

function emptyForm() {
  return { name: '', category: 'Elektronika', purchaseDate: '', warrantyEnd: '', shop: '', notes: '', imageData: null };
}

// ── Persist ────────────────────────────────────────────────────────────────
function load() {
  try { state.items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { state.items = []; }
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); } catch {}
}

// ── Helpers ────────────────────────────────────────────────────────────────
function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('lt-LT');
}
function badgeHtml(days) {
  if (days === null) return '';
  if (days < 0)  return `<span class="badge badge-exp">Baigėsi</span>`;
  if (days <= 30) return `<span class="badge badge-warn">${days}d. liko</span>`;
  return `<span class="badge badge-ok">${days}d. liko</span>`;
}
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('root');
  if (state.view === 'list')   root.innerHTML = renderList();
  if (state.view === 'add')    root.innerHTML = renderAdd();
  if (state.view === 'detail') root.innerHTML = renderDetail();
  attachEvents();
}

function renderList() {
  const { items, search, filterCat, sortBy } = state;
  const expired    = items.filter(i => { const d = daysLeft(i.warrantyEnd); return d !== null && d < 0; }).length;
  const expiring   = items.filter(i => { const d = daysLeft(i.warrantyEnd); return d !== null && d >= 0 && d <= 30; }).length;
  const valid      = items.length - expired;

  const filtered = items
    .filter(i => {
      const q = search.toLowerCase();
      return (i.name.toLowerCase().includes(q) || (i.shop||'').toLowerCase().includes(q) || (i.notes||'').toLowerCase().includes(q));
    })
    .filter(i => filterCat === 'Visos' || i.category === filterCat)
    .sort((a, b) => {
      if (sortBy === 'name')    return a.name.localeCompare(b.name, 'lt');
      if (sortBy === 'expiring') { const da = daysLeft(a.warrantyEnd)??99999, db = daysLeft(b.warrantyEnd)??99999; return da - db; }
      if (sortBy === 'newest')  return b.id - a.id;
      return 0;
    });

  const statsHtml = items.length > 0 ? `
    <div class="stats">
      <div class="stat-card" style="background:var(--green-bg)"><div class="num" style="color:var(--green)">${valid}</div><div class="lbl" style="color:var(--green)">Galioja</div></div>
      <div class="stat-card" style="background:var(--orange-bg)"><div class="num" style="color:var(--orange)">${expiring}</div><div class="lbl" style="color:var(--orange)">Baigiasi</div></div>
      <div class="stat-card" style="background:var(--red-bg)"><div class="num" style="color:var(--red)">${expired}</div><div class="lbl" style="color:var(--red)">Baigėsi</div></div>
    </div>` : '';

  const filtersHtml = ['Visos', ...CATEGORIES].map(c =>
    `<button class="filter-chip${filterCat===c?' active':''}" data-filter="${esc(c)}">${esc(c)}</button>`
  ).join('');

  const sortHtml = items.length > 1 ? `
    <div class="sort-row">
      <span>Rikiuoti:</span>
      <button class="sort-chip${sortBy==='name'?' active':''}" data-sort="name">A–Z</button>
      <button class="sort-chip${sortBy==='expiring'?' active':''}" data-sort="expiring">Baigiasi greičiau</button>
      <button class="sort-chip${sortBy==='newest'?' active':''}" data-sort="newest">Naujausi</button>
    </div>` : '';

  const emptyHtml = items.length === 0 ? `
    <div class="empty">
      <i class="ti ti-shield-check"></i>
      <h3>Dar nėra garantijų</h3>
      <p>Pridėkite pirmą daiktą ir įkelkite pirkimo čekį</p>
      <button class="btn-primary" id="addFirst"><i class="ti ti-plus"></i> Pridėti daiktą</button>
    </div>` : '';

  const noResultsHtml = filtered.length === 0 && items.length > 0
    ? `<p style="text-align:center;color:var(--text2);font-size:14px;margin-top:40px">Nieko nerasta.</p>` : '';

  const cardsHtml = filtered.map(item => {
    const days = daysLeft(item.warrantyEnd);
    const thumb = item.imageData
      ? `<img class="item-thumb" src="${esc(item.imageData)}" alt="" />`
      : `<div class="item-icon"><i class="ti ti-receipt"></i></div>`;
    return `
      <div class="item-card" data-id="${item.id}">
        ${thumb}
        <div class="item-info">
          <div class="item-top">
            <span class="item-name">${esc(item.name)}</span>
            ${badgeHtml(days)}
          </div>
          <div class="item-meta">${esc(item.shop||'')}${item.shop?` · `:''}${esc(item.category)}</div>
          ${item.warrantyEnd ? `<div class="item-date"><i class="ti ti-calendar" style="font-size:12px;margin-right:4px;vertical-align:-1px"></i>Garantija iki ${fmtDate(item.warrantyEnd)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="view">
      <div class="header">
        <div class="header-row">
          <div>
            <h1>Mano garantijos</h1>
            <div class="subtitle">${items.length} daiktas${items.length===1?'':'(-ai)'} išsaugota</div>
          </div>
          <button class="btn-primary" id="addBtn"><i class="ti ti-plus"></i> Pridėti</button>
        </div>
        ${statsHtml}
        <div class="search-wrap">
          <i class="ti ti-search"></i>
          <input type="search" id="searchInput" placeholder="Ieškoti..." value="${esc(search)}" />
        </div>
        <div class="filter-row">${filtersHtml}</div>
      </div>
      ${sortHtml}
      <div class="item-list">${emptyHtml}${cardsHtml}${noResultsHtml}</div>
    </div>`;
}

function renderAdd() {
  const f = state.form;
  const imgHtml = state.imagePreview
    ? `<img src="${esc(state.imagePreview)}" alt="Čekis" />`
    : `<div class="img-upload-placeholder">
         <i class="ti ti-camera"></i>
         <p>Įkelkite čekio nuotrauką</p>
         <small>AI automatiškai ištrauks informaciją</small>
       </div>`;

  const analyzingHtml = state.analyzing
    ? `<div class="analyzing"><div class="spinner"></div><span style="font-size:13px;color:var(--text2)">AI analizuoja čekį...</span></div>` : '';

  const catOptions = CATEGORIES.map(c => `<option${c===f.category?' selected':''}>${esc(c)}</option>`).join('');

  return `
    <div class="view">
      <div class="header" style="display:flex;align-items:center;gap:10px;padding:16px;">
        <button class="btn-back" id="backBtn"><i class="ti ti-arrow-left" style="font-size:20px"></i></button>
        <h1 style="font-size:17px">Naujas daiktas</h1>
      </div>
      <div class="form-wrap">
        <div class="field">
          <label>Čekis / sąskaita</label>
          <label class="img-upload" id="imgUploadLabel">
            ${imgHtml}
            <input type="file" id="imgInput" accept="image/*" capture="environment" style="display:none" />
          </label>
          ${analyzingHtml}
        </div>
        <div class="field">
          <label>Pavadinimas *</label>
          <input type="text" id="f_name" placeholder='pvz. Samsung TV 55"' value="${esc(f.name)}" />
        </div>
        <div class="field">
          <label>Parduotuvė</label>
          <input type="text" id="f_shop" placeholder="pvz. Pigu.lt, Euronics..." value="${esc(f.shop)}" />
        </div>
        <div class="field">
          <label>Pirkimo data</label>
          <input type="date" id="f_purchaseDate" value="${esc(f.purchaseDate)}" />
        </div>
        <div class="field">
          <label>Garantija galioja iki</label>
          <input type="date" id="f_warrantyEnd" value="${esc(f.warrantyEnd)}" />
        </div>
        <div class="field">
          <label>Kategorija</label>
          <select id="f_category">${catOptions}</select>
        </div>
        <div class="field">
          <label>Pastabos</label>
          <textarea id="f_notes" rows="3" placeholder="Papildoma informacija...">${esc(f.notes)}</textarea>
        </div>
        <button class="btn-save" id="saveBtn" ${f.name.trim()?'':'disabled'}>Išsaugoti</button>
      </div>
    </div>`;
}

function renderDetail() {
  const item = state.items.find(i => i.id === state.selected) || {};
  const days = daysLeft(item.warrantyEnd);

  let statusBg, statusColor, statusIcon, statusText;
  if (days === null)      { statusBg='var(--bg2)'; statusColor='var(--text2)'; statusIcon='ti-shield'; statusText='Nenurodyta'; }
  else if (days < 0)      { statusBg='var(--red-bg)'; statusColor='var(--red)'; statusIcon='ti-shield-x'; statusText='Garantija baigėsi'; }
  else if (days <= 30)    { statusBg='var(--orange-bg)'; statusColor='var(--orange)'; statusIcon='ti-shield-exclamation'; statusText=`Liko ${days} dienos`; }
  else                    { statusBg='var(--green-bg)'; statusColor='var(--green)'; statusIcon='ti-shield-check'; statusText=`Liko ${days} dienos`; }

  const imgHtml = item.imageData
    ? `<img src="${esc(item.imageData)}" alt="Čekis" style="width:100%;border-radius:12px;max-height:240px;object-fit:cover;margin-bottom:16px" />` : '';

  const rows = [
    { icon:'ti-tag', label:'Pavadinimas', val: item.name },
    { icon:'ti-building-store', label:'Parduotuvė', val: item.shop||'—' },
    { icon:'ti-category', label:'Kategorija', val: item.category },
    { icon:'ti-calendar', label:'Pirkimo data', val: fmtDate(item.purchaseDate) },
    { icon:'ti-calendar-due', label:'Garantija iki', val: fmtDate(item.warrantyEnd) },
  ].map(r => `
    <div class="detail-row">
      <i class="ti ${r.icon}"></i>
      <span class="dl">${esc(r.label)}</span>
      <span class="dv">${esc(r.val)}</span>
    </div>`).join('');

  const notesHtml = item.notes ? `
    <div class="notes-box">
      <div class="notes-lbl">Pastabos</div>
      <p>${esc(item.notes)}</p>
    </div>` : '';

  return `
    <div class="view">
      <div class="detail-header">
        <button class="btn-back" id="backBtn"><i class="ti ti-arrow-left" style="font-size:20px"></i></button>
        <h2>${esc(item.name)}</h2>
        <button class="btn-back" id="deleteBtn" style="color:var(--red)"><i class="ti ti-trash" style="font-size:20px"></i></button>
      </div>
      <div style="padding:16px">
        ${imgHtml}
        <div class="status-card" style="background:${statusBg}">
          <div>
            <div class="status-label" style="color:${statusColor}">Garantijos statusas</div>
            <div class="status-val" style="color:${statusColor}">${statusText}</div>
          </div>
          <i class="ti ${statusIcon}" style="font-size:32px;color:${statusColor}"></i>
        </div>
        <div class="detail-rows">${rows}</div>
        ${notesHtml}
        <button class="btn-danger" id="deleteBtn2"><i class="ti ti-trash" style="margin-right:6px;vertical-align:-1px"></i>Ištrinti</button>
      </div>
    </div>`;
}

// ── Events ─────────────────────────────────────────────────────────────────
function attachEvents() {
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  const onAll = (sel, ev, fn) => document.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));

  // List
  on('addBtn',    'click', () => { state.form = emptyForm(); state.imagePreview = null; state.view = 'add'; render(); });
  on('addFirst',  'click', () => { state.form = emptyForm(); state.imagePreview = null; state.view = 'add'; render(); });
  on('searchInput', 'input', e => { state.search = e.target.value; render(); });

  onAll('.filter-chip', 'click', e => { state.filterCat = e.target.dataset.filter; render(); });
  onAll('.sort-chip',   'click', e => { state.sortBy = e.target.dataset.sort; render(); });
  onAll('.item-card',   'click', e => {
    const id = parseInt(e.currentTarget.dataset.id);
    state.selected = id; state.view = 'detail'; render();
  });

  // Add
  on('backBtn', 'click', () => { state.view = 'list'; render(); });
  on('imgInput', 'change', handleImageUpload);

  ['name','shop','purchaseDate','warrantyEnd','category','notes'].forEach(k => {
    on(`f_${k}`, 'input',  e => { state.form[k] = e.target.value; syncSaveBtn(); });
    on(`f_${k}`, 'change', e => { state.form[k] = e.target.value; syncSaveBtn(); });
  });

  on('saveBtn', 'click', saveItem);

  // Detail
  on('deleteBtn',  'click', () => deleteItem(state.selected));
  on('deleteBtn2', 'click', () => deleteItem(state.selected));
}

function syncSaveBtn() {
  const btn = document.getElementById('saveBtn');
  if (btn) btn.disabled = !state.form.name.trim();
}

function deleteItem(id) {
  if (!confirm('Ištrinti šį įrašą?')) return;
  state.items = state.items.filter(i => i.id !== id);
  persist();
  state.view = 'list';
  render();
}

function saveItem() {
  if (!state.form.name.trim()) return;
  state.items.unshift({ ...state.form, id: Date.now() });
  persist();
  state.form = emptyForm();
  state.imagePreview = null;
  state.view = 'list';
  render();
}

// ── Image + AI ─────────────────────────────────────────────────────────────
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    const dataUrl = ev.target.result;
    const base64  = dataUrl.split(',')[1];
    const mime    = file.type;
    state.imagePreview = dataUrl;
    state.form.imageData = dataUrl;
    state.analyzing = true;
    render();
    await analyzeReceipt(base64, mime);
    state.analyzing = false;
    render();
  };
  reader.readAsDataURL(file);
}

async function analyzeReceipt(base64, mimeType) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: `Tai yra pirkimo čekis arba sąskaita. Ištraukite informaciją ir grąžinkite TIK JSON (be paaiškinimų, be markdown):
{
  "name": "produkto pavadinimas",
  "shop": "parduotuvė",
  "purchaseDate": "YYYY-MM-DD arba null",
  "price": "kaina su valiuta arba null",
  "notes": "trumpas aprašymas"
}
Jei informacijos nėra – naudokite null.` }
          ]
        }]
      })
    });
    const data = await res.json();
    const text  = (data.content || []).map(c => c.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const p     = JSON.parse(clean);
    if (p.name)         state.form.name         = p.name;
    if (p.shop)         state.form.shop         = p.shop;
    if (p.purchaseDate) state.form.purchaseDate = p.purchaseDate;
    if (p.price || p.notes) {
      state.form.notes = [p.price ? `Kaina: ${p.price}` : '', p.notes || ''].filter(Boolean).join('\n');
    }
  } catch (err) {
    console.warn('AI analizė nepavyko:', err);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
load();
render();
