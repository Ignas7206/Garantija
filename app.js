'use strict';

const STORAGE_KEY  = 'garantijos_v1';
const AUTH_KEY     = 'garantijos_session';
const BRUTE_KEY    = 'garantijos_brute';
const WORKER_URL   = 'https://muddy-sea-0563.ignas7206.workers.dev';
const CORRECT_HASH = 'b9cf4364491e63cac7f0668fd4df6457ba29575537bcae6be2c265d05bb926dc';
const CATEGORIES   = ['Elektronika','Buitinė technika','Avalynė / drabužiai','Baldai','Automobiliai','Kita'];
const DOC_TYPES    = ['Kvitas / čekis','Sąskaita-faktūra (SF)','Banko išrašas','Kita'];
const WARRANTY_OPTS= [{l:'6 mėnesiai',m:6},{l:'1 metai',m:12},{l:'2 metai',m:24},{l:'3 metai',m:36},{l:'5 metai',m:60},{l:'Kita data',m:null}];
const ALLOWED_IMG  = ['image/jpeg','image/png','image/webp','image/heic','image/heif'];
const MAX_IMG      = 4*1024*1024;
const MAX_PDF      = 5*1024*1024;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 5*60*1000;

let state = {
  view:'list', addMode:null,
  items:[], selected:null,
  search:'', filterCat:'Visos', sortBy:'newest',
  form:emptyForm(),
  lightbox:null, analyzing:false,
  authenticated:false, pwdError:'', docError:'',
  showWarranty:false,
};

function emptyForm(){return{name:'',category:'Elektronika',shop:'',purchaseDate:today(),warrantyEnd:addMonths(today(),24),warrantyMonths:24,docType:'Kvitas / čekis',docNumber:'',notes:'',docData:null,docMime:null,docFileName:null};}
function today(){return new Date().toISOString().slice(0,10);}
function addMonths(d,m){if(!d)return '';const r=new Date(d);r.setMonth(r.getMonth()+m);return r.toISOString().slice(0,10);}

// ── Auth ───────────────────────────────────────────────────────────────────
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function genToken(){const a=new Uint8Array(32);crypto.getRandomValues(a);return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');}
async function checkAuth(){const t=sessionStorage.getItem(AUTH_KEY),h=localStorage.getItem(AUTH_KEY+'_h');if(t&&h&&await sha256(t)===h)state.authenticated=true;}
async function createSession(){const t=genToken();sessionStorage.setItem(AUTH_KEY,t);localStorage.setItem(AUTH_KEY+'_h',await sha256(t));state.authenticated=true;state.pwdError='';render();}
function logout(){sessionStorage.removeItem(AUTH_KEY);localStorage.removeItem(AUTH_KEY+'_h');state.authenticated=false;render();}
function getBrute(){try{return JSON.parse(localStorage.getItem(BRUTE_KEY))||{a:0,u:0};}catch{return{a:0,u:0};}}
function setBrute(b){localStorage.setItem(BRUTE_KEY,JSON.stringify(b));}
function resetBrute(){localStorage.removeItem(BRUTE_KEY);}
function bruteStatus(){const b=getBrute(),n=Date.now();if(b.u>n)return{locked:true,secs:Math.ceil((b.u-n)/1000)};return{locked:false};}
async function tryLogin(pw){
  const bs=bruteStatus();
  if(bs.locked){state.pwdError=`Užblokuota. Palaukite ${bs.secs}s.`;render();return;}
  if(!pw){state.pwdError='Įveskite slaptažodį';render();return;}
  if(await sha256(pw)===CORRECT_HASH){resetBrute();await createSession();}
  else{const b=getBrute();b.a=(b.a||0)+1;if(b.a>=MAX_ATTEMPTS){b.u=Date.now()+LOCKOUT_MS;b.a=0;state.pwdError='Per daug bandymų. Užblokuota 5 min.';}else{state.pwdError=`Neteisingas slaptažodis (${b.a}/${MAX_ATTEMPTS})`;}setBrute(b);render();}
}

// ── Persist ────────────────────────────────────────────────────────────────
function load(){try{state.items=JSON.parse(localStorage.getItem(STORAGE_KEY))||[];}catch{state.items=[];}}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state.items));}catch(e){if(e.name==='QuotaExceededError')toast('Vieta baigiasi! Ištrinkite kai kuriuos įrašus.');}}

// ── Helpers ────────────────────────────────────────────────────────────────
function daysLeft(d){if(!d)return null;return Math.ceil((new Date(d)-new Date())/86400000);}
function fmtDate(d){if(!d)return '—';return new Date(d).toLocaleDateString('lt-LT');}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function safeId(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function fmtSize(b){return b<1024*1024?(b/1024).toFixed(0)+'KB':(b/1024/1024).toFixed(1)+'MB';}
function badgeHtml(days){
  if(days===null)return '';
  if(days<0)return`<span class="badge badge-exp">Baigėsi</span>`;
  if(days<=30)return`<span class="badge badge-warn">${days}d.</span>`;
  return`<span class="badge badge-ok">${days}d.</span>`;
}
function toast(msg){
  document.querySelectorAll('.toast').forEach(e=>e.remove());
  const el=document.createElement('div');el.className='toast';el.textContent=msg;
  document.getElementById('app').appendChild(el);
  setTimeout(()=>el.remove(),2400);
}

// ── Render ─────────────────────────────────────────────────────────────────
function render(){
  const scr=document.getElementById('screen');
  const nav=document.getElementById('bottomNav');
  if(state.lightbox){scr.innerHTML=renderLightbox();nav.style.display='none';attachLightboxEvents();return;}
  if(!state.authenticated){scr.innerHTML=renderLogin();nav.style.display='none';attachLoginEvents();return;}
  nav.style.display='flex';
  if(state.view==='list')          scr.innerHTML=renderList();
  else if(state.view==='search')   scr.innerHTML=renderSearch();
  else if(state.view==='add'&&!state.addMode) scr.innerHTML=renderPicker();
  else if(state.view==='add')      scr.innerHTML=renderAdd();
  else if(state.view==='detail')   scr.innerHTML=renderDetail();
  // sync nav active state
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.view));
  attachEvents();
}

// ── Lightbox ───────────────────────────────────────────────────────────────
function renderLightbox(){return`<div class="lightbox" id="lbOverlay"><div class="lightbox-bar"><button class="lightbox-close" id="lbClose"><i class="ti ti-x"></i></button></div><div class="lightbox-img"><img src="${esc(state.lightbox)}" /></div></div>`;}
function attachLightboxEvents(){
  document.getElementById('lbClose')?.addEventListener('click',()=>{state.lightbox=null;render();});
  document.getElementById('lbOverlay')?.addEventListener('click',e=>{if(e.target.id==='lbOverlay'){state.lightbox=null;render();}});
}

// ── Login ──────────────────────────────────────────────────────────────────
function renderLogin(){
  const bs=bruteStatus();
  return`<div class="login-wrap"><div class="login-card">
    <div class="login-logo"><span class="shield">🛡️</span><h1>Garantijos</h1><p>Įveskite slaptažodį</p></div>
    <input type="password" id="pwdInput" class="login-input${state.pwdError?' err':''}" placeholder="Slaptažodis" ${bs.locked?'disabled':''} />
    ${state.pwdError?`<p class="login-error">${esc(state.pwdError)}</p>`:''}
    <button id="loginBtn" class="login-btn" ${bs.locked?'disabled':''}>Prisijungti</button>
  </div></div>`;
}
function attachLoginEvents(){
  const btn=document.getElementById('loginBtn'),inp=document.getElementById('pwdInput');
  if(btn)btn.addEventListener('click',()=>tryLogin(inp?.value||''));
  if(inp){inp.addEventListener('keydown',e=>{if(e.key==='Enter')tryLogin(inp.value);});setTimeout(()=>inp.focus(),100);}
}

// ── List ───────────────────────────────────────────────────────────────────
function renderList(){
  const{items,filterCat,sortBy}=state;
  const expired =items.filter(i=>{const d=daysLeft(i.warrantyEnd);return d!==null&&d<0;}).length;
  const expiring=items.filter(i=>{const d=daysLeft(i.warrantyEnd);return d!==null&&d>=0&&d<=30;}).length;
  const valid   =items.length-expired;

  const filtered=items
    .filter(i=>filterCat==='Visos'||i.category===filterCat)
    .sort((a,b)=>{
      if(sortBy==='name')return a.name.localeCompare(b.name,'lt');
      if(sortBy==='expiring'){const da=daysLeft(a.warrantyEnd)??99999,db=daysLeft(b.warrantyEnd)??99999;return da-db;}
      return b.id-a.id;
    });

  const statsHtml=items.length>0?`<div class="stats-row">
    <div class="stat-tile"><div class="n" style="color:var(--green)">${valid}</div><div class="l">Galioja</div></div>
    <div class="stat-tile"><div class="n" style="color:var(--orange)">${expiring}</div><div class="l">Baigiasi</div></div>
    <div class="stat-tile"><div class="n" style="color:var(--red)">${expired}</div><div class="l">Baigėsi</div></div>
  </div>`:'';

  const chips=['Visos',...CATEGORIES].map(c=>`<button class="chip${filterCat===c?' active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('');

  const cardsHtml=filtered.map(item=>{
    const days=daysLeft(item.warrantyEnd);
    let thumb;
    if(item.docData&&item.docMime==='application/pdf')
      thumb=`<div class="card-icon" style="background:var(--red-bg)"><i class="ti ti-file-type-pdf" style="color:var(--red)"></i></div>`;
    else if(item.docData)
      thumb=`<img class="card-thumb" src="${esc(item.docData)}" alt="" loading="lazy" />`;
    else
      thumb=`<div class="card-icon"><i class="ti ti-receipt"></i></div>`;
    return`<button class="card" data-id="${esc(String(item.id))}">
      ${thumb}
      <div class="card-body">
        <div class="card-top"><span class="card-name">${esc(item.name)}</span>${badgeHtml(days)}</div>
        <div class="card-sub">${esc(item.shop||item.category)}</div>
        ${item.warrantyEnd?`<div class="card-date"><i class="ti ti-calendar" style="font-size:12px"></i>Iki ${fmtDate(item.warrantyEnd)}</div>`:''}
      </div>
    </button>`;
  }).join('');

  const emptyHtml=items.length===0?`<div class="empty-state">
    <div class="empty-icon"><i class="ti ti-shield-check"></i></div>
    <h3>Dar nėra garantijų</h3>
    <p>Pridėkite pirmą daiktą paspausdami + mygtuką apačioje</p>
  </div>`:filtered.length===0?`<div class="empty-state"><div class="empty-icon"><i class="ti ti-filter-off"></i></div><h3>Nieko nerasta</h3><p>Pabandykite kitą kategoriją</p></div>`:'';

  return`<div>
    <div class="page-header">
      <span class="page-title">Garantijos</span>
      <button class="icon-btn" id="logoutBtn"><i class="ti ti-logout" style="font-size:18px"></i></button>
    </div>
    <div style="height:14px"></div>
    ${statsHtml}
    <div class="chips">${chips}</div>
    <div style="padding:0 16px 10px;display:flex;gap:8px;align-items:center">
      <span style="font-size:12px;color:var(--text3)">Rikiuoti:</span>
      <button class="chip${sortBy==='newest'?' active':''}" data-sort="newest" style="font-size:12px;padding:4px 10px">Naujausi</button>
      <button class="chip${sortBy==='expiring'?' active':''}" data-sort="expiring" style="font-size:12px;padding:4px 10px">Baigiasi</button>
      <button class="chip${sortBy==='name'?' active':''}" data-sort="name" style="font-size:12px;padding:4px 10px">A–Z</button>
    </div>
    <div class="cards">${emptyHtml}${cardsHtml}</div>
    <div style="height:8px"></div>
  </div>`;
}

// ── Search ─────────────────────────────────────────────────────────────────
function renderSearch(){
  const q=state.search;
  const results=!q?[]:state.items.filter(i=>{const s=q.toLowerCase();return i.name.toLowerCase().includes(s)||(i.shop||'').toLowerCase().includes(s)||(i.docNumber||'').toLowerCase().includes(s)||(i.notes||'').toLowerCase().includes(s);});
  const cardsHtml=results.map(item=>{
    const days=daysLeft(item.warrantyEnd);
    const thumb=item.docData&&item.docMime!=='application/pdf'?`<img class="card-thumb" src="${esc(item.docData)}" alt="" loading="lazy" />`:`<div class="card-icon"><i class="ti ti-receipt"></i></div>`;
    return`<button class="card" data-id="${esc(String(item.id))}">
      ${thumb}
      <div class="card-body">
        <div class="card-top"><span class="card-name">${esc(item.name)}</span>${badgeHtml(days)}</div>
        <div class="card-sub">${esc(item.shop||item.category)}</div>
        ${item.docNumber?`<div class="card-date"><i class="ti ti-hash" style="font-size:12px"></i>${esc(item.docNumber)}</div>`:''}
      </div>
    </button>`;
  }).join('');

  return`<div>
    <div class="page-header" style="padding-bottom:14px">
      <span class="page-title">Ieškoti</span>
    </div>
    <div style="padding:12px 16px 4px">
      <div class="search-bar" style="margin:0">
        <i class="ti ti-search"></i>
        <input type="search" id="searchInput" placeholder="Pavadinimas, dok. numeris..." value="${esc(q)}" autofocus />
      </div>
    </div>
    <div class="cards" style="margin-top:12px">
      ${!q?`<div class="empty-state" style="padding:40px 32px"><div class="empty-icon"><i class="ti ti-search"></i></div><p>Įveskite paieškos žodį</p></div>`:results.length===0?`<div class="empty-state" style="padding:40px 32px"><div class="empty-icon"><i class="ti ti-mood-sad"></i></div><h3>Nieko nerasta</h3></div>`:cardsHtml}
    </div>
  </div>`;
}

// ── Add picker ─────────────────────────────────────────────────────────────
function renderPicker(){
  return`<div>
    <div class="page-header-sm">
      <button class="back-btn" id="backBtn"><i class="ti ti-x"></i></button>
      <h2>Pridėti garantiją</h2>
    </div>
    <div class="picker-cards">
      <button class="picker-card" id="modePhoto">
        <div class="picker-icon" style="background:var(--accent-bg)"><i class="ti ti-camera" style="color:var(--accent)"></i></div>
        <div><h3>Su dokumentu + AI</h3><p>Nufotografuok arba įkelk – AI ištrauks informaciją automatiškai</p></div>
      </button>
      <button class="picker-card" id="modeManual">
        <div class="picker-icon" style="background:var(--green-bg)"><i class="ti ti-pencil" style="color:var(--green)"></i></div>
        <div><h3>Rankiniu būdu</h3><p>Suveskite informaciją patys. Dokumentą galima prisegti</p></div>
      </button>
    </div>
  </div>`;
}

// ── Add form ───────────────────────────────────────────────────────────────
function renderAdd(){
  const f=state.form;
  const isPhoto=state.addMode==='photo';
  const selOpt=WARRANTY_OPTS.find(o=>o.m===f.warrantyMonths)||WARRANTY_OPTS[WARRANTY_OPTS.length-1];
  const hasPdf=f.docData&&f.docMime==='application/pdf';
  const hasImg=f.docData&&f.docMime!=='application/pdf';

  let docAreaHtml='';
  if(hasPdf){
    docAreaHtml=`<div class="doc-preview-pdf"><i class="ti ti-file-type-pdf"></i><div><div class="pdf-name">${esc(f.docFileName||'dokumentas.pdf')}</div><div class="pdf-hint">PDF išsaugotas</div></div></div>`;
  }else if(hasImg){
    docAreaHtml=`<div style="position:relative"><img class="doc-preview-img" id="docThumb" src="${esc(f.docData)}" alt="" /><div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.55);border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;pointer-events:none"><i class="ti ti-zoom-in" style="font-size:14px;color:#fff"></i></div></div>`;
  }else{
    docAreaHtml=`<label class="doc-drop-zone" for="docInput">
      <i class="ti ti-${isPhoto?'camera':'paperclip'}"></i>
      <p>${isPhoto?'Fotografuoti arba įkelti':'Prisegti dokumentą (neprivaloma)'}</p>
      <small>JPG, PNG, PDF · max ${isPhoto?'4MB / 5MB PDF':'4MB / 5MB PDF'}</small>
    </label>`;
  }

  const warrantySheet=state.showWarranty?`<div class="warranty-sheet" id="warrantySheet">
    <div class="warranty-overlay" id="warrantyOverlay"></div>
    <div class="warranty-panel">
      <div class="warranty-handle"></div>
      <div class="warranty-title">Garantijos trukmė</div>
      ${WARRANTY_OPTS.map(o=>`<button class="warranty-opt${f.warrantyMonths===o.m?' selected':''}" data-wm="${o.m??'x'}">
        ${esc(o.l)}${f.warrantyMonths===o.m?`<i class="ti ti-check"></i>`:''}
      </button>`).join('')}
    </div>
  </div>`:'';

  return`<div>
    <div class="page-header-sm">
      <button class="back-btn" id="backBtn"><i class="ti ti-arrow-left"></i></button>
      <h2>${isPhoto?'Pridėti su dokumentu':'Įvesti rankiniu būdu'}</h2>
    </div>
    <div class="form-body">

      <div class="doc-upload-area">
        ${docAreaHtml}
        <input type="file" id="docInput" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" ${isPhoto?'capture="environment"':''} style="display:none" />
        ${f.docData?`<button class="doc-remove-btn" id="removeDoc"><i class="ti ti-trash" style="font-size:14px"></i>Pašalinti dokumentą</button>`:''}
        ${state.docError?`<p class="doc-error">${esc(state.docError)}</p>`:''}
        ${state.analyzing?`<div class="analyzing-row"><div class="spinner"></div><span style="font-size:13px;color:var(--text2)">AI analizuoja dokumentą...</span></div>`:''}
      </div>

      <p class="form-label-section">Pagrindinė informacija</p>
      <div class="form-section">
        <div class="form-row"><label>Pavadinimas</label><input type="text" id="f_name" placeholder="Būtina" value="${esc(f.name)}" /></div>
        <div class="form-row"><label>Parduotuvė</label><input type="text" id="f_shop" placeholder="Neprivaloma" value="${esc(f.shop)}" /></div>
        <div class="form-row"><label>Kategorija</label><select id="f_category">${CATEGORIES.map(c=>`<option${c===f.category?' selected':''}>${esc(c)}</option>`).join('')}</select><i class="ti ti-chevron-right form-row-chevron"></i></div>
      </div>

      <p class="form-label-section">Datos</p>
      <div class="form-section">
        <div class="form-row"><label>Pirkimo data</label><input type="date" id="f_purchaseDate" value="${esc(f.purchaseDate)}" /></div>
        <div class="form-row" id="warrantyBtn" style="cursor:pointer"><label>Garantija</label><span style="font-size:15px;color:var(--text2)">${esc(selOpt.l)}</span><i class="ti ti-chevron-right form-row-chevron"></i></div>
        ${f.warrantyMonths===null?`<div class="form-row"><label>Galioja iki</label><input type="date" id="f_warrantyEnd" value="${esc(f.warrantyEnd)}" /></div>`:''}
      </div>

      <p class="form-label-section">Dokumentas</p>
      <div class="form-section">
        <div class="form-row"><label>Tipas</label><select id="f_docType">${DOC_TYPES.map(d=>`<option${d===f.docType?' selected':''}>${esc(d)}</option>`).join('')}</select><i class="ti ti-chevron-right form-row-chevron"></i></div>
        <div class="form-row"><label>Numeris</label><input type="text" id="f_docNumber" placeholder="pvz. SF-2025-001" value="${esc(f.docNumber)}" /></div>
      </div>

      <p class="form-label-section">Pastabos</p>
      <div class="form-section">
        <div class="form-row"><textarea id="f_notes" rows="3" placeholder="Papildoma informacija...">${esc(f.notes)}</textarea></div>
      </div>

      <button class="save-btn" id="saveBtn" ${f.name.trim()?'':'disabled'}>Išsaugoti</button>
    </div>
    ${warrantySheet}
  </div>`;
}

// ── Detail ─────────────────────────────────────────────────────────────────
function renderDetail(){
  const item=state.items.find(i=>i.id===state.selected);
  if(!item){state.view='list';render();return '';}
  const days=daysLeft(item.warrantyEnd);
  let sc,si,sv;
  if(days===null){sc='var(--bg2)';si='ti-shield';sv='Nenurodyta';}
  else if(days<0){sc='var(--red-bg)';si='ti-shield-x';sv='Garantija baigėsi';}
  else if(days<=30){sc='var(--orange-bg)';si='ti-shield-exclamation';sv=`Liko ${days} d.`;}
  else{sc='var(--green-bg)';si='ti-shield-check';sv=`Liko ${days} d.`;}

  const textColor=days===null?'var(--text2)':days<0?'var(--red)':days<=30?'var(--orange)':'var(--green)';

  let docHtml='';
  if(item.docData&&item.docMime==='application/pdf'){
    const blob=b64toBlob(item.docData,'application/pdf');
    const url=URL.createObjectURL(blob);
    docHtml=`<div class="detail-section"><a class="doc-preview-pdf" href="${url}" target="_blank"><i class="ti ti-file-type-pdf"></i><div><div class="pdf-name">${esc(item.docFileName||'dokumentas.pdf')}</div><div class="pdf-hint">Spustelkite peržiūrėti</div></div><i class="ti ti-external-link" style="font-size:18px;color:var(--red);flex-shrink:0"></i></a></div>`;
  }else if(item.docData){
    docHtml=`<div class="detail-section"><img src="${esc(item.docData)}" id="docImg" style="width:100%;border-radius:var(--radius);max-height:200px;object-fit:cover;cursor:pointer;display:block" /></div>`;
  }

  const rows=[
    {i:'ti-tag',l:'Pavadinimas',v:item.name},
    {i:'ti-building-store',l:'Parduotuvė',v:item.shop||'—'},
    {i:'ti-category',l:'Kategorija',v:item.category},
    {i:'ti-file-description',l:'Dok. tipas',v:item.docType||'—'},
    {i:'ti-hash',l:'Dok. numeris',v:item.docNumber||'—'},
    {i:'ti-calendar',l:'Pirkimo data',v:fmtDate(item.purchaseDate)},
    {i:'ti-calendar-due',l:'Garantija iki',v:fmtDate(item.warrantyEnd)},
  ].map(r=>`<div class="detail-row"><i class="ti ${r.i}"></i><span class="dr-label">${esc(r.l)}</span><span class="dr-val">${esc(r.v)}</span></div>`).join('');

  return`<div>
    <div class="page-header-sm">
      <button class="back-btn" id="backBtn"><i class="ti ti-arrow-left"></i></button>
      <h2>${esc(item.name)}</h2>
      <button class="icon-btn" id="deleteBtn" style="color:var(--red)"><i class="ti ti-trash" style="font-size:18px"></i></button>
    </div>
    <div class="detail-status" style="background:${sc}">
      <i class="ti ${si}" style="font-size:36px;color:${textColor}"></i>
      <div><div class="ds-label" style="color:${textColor}">Garantijos statusas</div><div class="ds-val" style="color:${textColor}">${sv}</div></div>
    </div>
    ${docHtml}
    <div class="detail-section"><div class="detail-rows">${rows}</div></div>
    ${item.notes?`<div class="detail-section"><div class="notes-card"><div class="nc-label">Pastabos</div><p>${esc(item.notes)}</p></div></div>`:''}
    <div class="detail-section"><button class="delete-btn" id="deleteBtn2"><i class="ti ti-trash"></i>Ištrinti įrašą</button></div>
    <div style="height:8px"></div>
  </div>`;
}

function b64toBlob(b64,mime){const s=atob(b64),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Blob([a],{type:mime});}

// ── Events ─────────────────────────────────────────────────────────────────
function attachEvents(){
  const on=(id,ev,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener(ev,fn);};
  const onAll=(sel,ev,fn)=>document.querySelectorAll(sel).forEach(el=>el.addEventListener(ev,fn));

  // Bottom nav
  document.getElementById('navList')?.addEventListener('click',()=>{state.view='list';render();});
  document.getElementById('navAdd')?.addEventListener('click',()=>{state.form=emptyForm();state.docError='';state.addMode=null;state.view='add';render();});
  document.getElementById('navSearch')?.addEventListener('click',()=>{state.view='search';render();});

  // List
  on('logoutBtn','click',()=>{if(confirm('Atsijungti?'))logout();});
  onAll('.chip[data-filter]','click',e=>{state.filterCat=e.currentTarget.dataset.filter;render();});
  onAll('.chip[data-sort]','click',e=>{state.sortBy=e.currentTarget.dataset.sort;render();});
  onAll('.card[data-id]','click',e=>{const id=safeId(e.currentTarget.dataset.id);if(id===null)return;state.selected=id;state.view='detail';render();});

  // Search
  on('searchInput','input',e=>{state.search=e.target.value;render();});

  // Picker
  on('modePhoto','click',()=>{state.addMode='photo';render();});
  on('modeManual','click',()=>{state.addMode='manual';render();});

  // Back
  on('backBtn','click',()=>{
    if(state.view==='add'&&state.addMode){state.addMode=null;render();}
    else if(state.view==='add'){state.view='list';render();}
    else{state.view='list';render();}
  });

  // Warranty sheet
  on('warrantyBtn','click',()=>{state.showWarranty=true;render();});
  on('warrantyOverlay','click',()=>{state.showWarranty=false;render();});
  onAll('.warranty-opt','click',e=>{
    const v=e.currentTarget.dataset.wm;
    if(v==='x'){state.form.warrantyMonths=null;state.form.warrantyEnd='';}
    else{const m=parseInt(v);state.form.warrantyMonths=m;if(state.form.purchaseDate)state.form.warrantyEnd=addMonths(state.form.purchaseDate,m);}
    state.showWarranty=false;render();
  });
  on('f_warrantyEnd','change',e=>{state.form.warrantyEnd=e.target.value;});

  // Form fields
  ['name','shop','purchaseDate','docType','docNumber','category','notes'].forEach(k=>{
    on(`f_${k}`,'input',e=>{state.form[k]=e.target.value;if(k==='purchaseDate'&&state.form.warrantyMonths)state.form.warrantyEnd=addMonths(e.target.value,state.form.warrantyMonths);syncSave();});
    on(`f_${k}`,'change',e=>{state.form[k]=e.target.value;if(k==='purchaseDate'&&state.form.warrantyMonths)state.form.warrantyEnd=addMonths(e.target.value,state.form.warrantyMonths);syncSave();});
  });

  // Doc
  on('docInput','change',handleDoc);
  on('removeDoc','click',()=>{state.form.docData=null;state.form.docMime=null;state.form.docFileName=null;state.docError='';render();});
  on('docThumb','click',()=>{if(state.form.docData)state.lightbox=state.form.docData;render();});
  on('docImg','click',()=>{const it=state.items.find(i=>i.id===state.selected);if(it?.docData)state.lightbox=it.docData;render();});

  on('saveBtn','click',saveItem);
  on('deleteBtn','click',()=>deleteItem(state.selected));
  on('deleteBtn2','click',()=>deleteItem(state.selected));
}

function syncSave(){const b=document.getElementById('saveBtn');if(b)b.disabled=!state.form.name.trim();}

function deleteItem(id){
  if(!confirm('Ištrinti šį įrašą?'))return;
  state.items=state.items.filter(i=>i.id!==id);persist();
  toast('Ištrinta');state.view='list';render();
}
function saveItem(){
  if(!state.form.name.trim())return;
  state.items.unshift({...state.form,id:Date.now()});persist();
  toast('Išsaugota ✓');state.form=emptyForm();state.docError='';state.addMode=null;state.view='list';render();
}

// ── Document ───────────────────────────────────────────────────────────────
function handleDoc(e){
  const file=e.target.files[0];if(!file)return;
  const isPdf=file.type==='application/pdf';
  const isImg=ALLOWED_IMG.includes(file.type);
  if(!isPdf&&!isImg){state.docError='Leidžiami formatai: JPG, PNG, WebP, HEIC, PDF';render();return;}
  if(isPdf&&file.size>MAX_PDF){state.docError=`PDF per didelis (max 5MB, jūsų: ${fmtSize(file.size)})`;render();return;}
  if(isImg&&file.size>MAX_IMG){state.docError=`Per didelė (max 4MB, jūsų: ${fmtSize(file.size)})`;render();return;}
  state.docError='';
  const reader=new FileReader();
  reader.onload=async ev=>{
    const dataUrl=ev.target.result,b64=dataUrl.split(',')[1];
    if(isPdf){
      state.form.docData=b64;state.form.docMime='application/pdf';state.form.docFileName=file.name;render();
    }else{
      const img=new Image();
      img.onload=async()=>{
        state.form.docData=dataUrl;state.form.docMime=file.type;state.form.docFileName=file.name;
        if(state.addMode==='photo'){state.analyzing=true;render();await analyzeDoc(b64,file.type);state.analyzing=false;}
        render();
      };
      img.onerror=()=>{state.docError='Failas neatpažintas kaip nuotrauka';render();};
      img.src=dataUrl;
    }
  };
  reader.readAsDataURL(file);
}

async function analyzeDoc(b64,mime){
  try{
    const res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:mime,data:b64}},
        {type:'text',text:`Pirkimo dokumentas. Grąžink TIK JSON be markdown:
{"name":"produktas","shop":"parduotuvė arba null","purchaseDate":"YYYY-MM-DD arba null","docNumber":"dok.nr arba null","docType":"Kvitas / čekis|Sąskaita-faktūra (SF)|Banko išrašas|Kita","price":"kaina arba null","warrantyMonths":24}
warrantyMonths: 6/12/24/36/60 pagal produktą. Nežinant – 24.`}
      ]}]})
    });
    if(!res.ok)return;
    const data=await res.json();
    const p=JSON.parse((data.content||[]).map(c=>c.text||'').join('').replace(/```json|```/g,'').trim());
    if(typeof p.name==='string')state.form.name=p.name.slice(0,200);
    if(typeof p.shop==='string')state.form.shop=p.shop.slice(0,100);
    if(typeof p.purchaseDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.purchaseDate))state.form.purchaseDate=p.purchaseDate;
    if(typeof p.docNumber==='string')state.form.docNumber=p.docNumber.slice(0,100);
    if(DOC_TYPES.includes(p.docType))state.form.docType=p.docType;
    const wm=WARRANTY_OPTS.find(o=>o.m===p.warrantyMonths);
    if(wm){state.form.warrantyMonths=p.warrantyMonths;if(state.form.purchaseDate)state.form.warrantyEnd=addMonths(state.form.purchaseDate,p.warrantyMonths);}
    if(p.price)state.form.notes=`Kaina: ${String(p.price).slice(0,50)}`;
  }catch(err){console.warn('AI:',err);}
}

// ── Boot ───────────────────────────────────────────────────────────────────
load();
checkAuth().then(()=>render());
