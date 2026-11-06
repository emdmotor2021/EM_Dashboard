/* ============================================================
   Electrical Maintenance Department — Motors / Lifts / Workshop
   Application logic. Data persists in this browser via localStorage.
   ============================================================ */

/* ---------------- Utilities ---------------- */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const uid = () => 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtBytes = (n) => n < 1024 ? n+' B' : n < 1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(1)+' MB';

/* LS_get / LS_set are now defined in firebase-sync.js (Firestore-backed, loaded before this file).
   Every call site below is unchanged — the storage layer underneath is what changed. */

/* ---------------- Storage keys ---------------- */
const KEYS = {
  htMotors:'em_ht_motors', ltMotors:'em_lt_motors',
  htBearings:'em_ht_bearings', ltBearings:'em_lt_bearings',
  dailyHT:'em_daily_ht', dailyLT:'em_daily_lt',
  dailyHTFiles:'em_daily_ht_files', dailyLTFiles:'em_daily_lt_files',
  preservationForms:'em_preservation_forms', preservationFiles:'em_preservation_files',
  ohHTForms:'em_oh_ht_forms', ohHTFiles:'em_oh_ht_files',
  ohLTForms:'em_oh_lt_forms', ohLTFiles:'em_oh_lt_files',
  rewindForms:'em_rewind_forms', rewindFiles:'em_rewind_files',
  workshop:'em_workshop',
  equipHistory:'em_equip_history',
  lubEquip:'em_lub_equipment',
};
/* Seeding (first-ever load populates starter data) now happens once, cloud-side,
   inside initCloudSync() in firebase-sync.js — guarded by a Firestore transaction
   so it can never run twice even if several people open the site for the first time
   at once. */

function toast(msg, isErr){
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.innerHTML = (isErr ? ICONS.alert : ICONS.check) + `<span>${escapeHtml(msg)}</span>`;
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 2600);
}

/* ---------------- Icon set (inline SVG, stroke style) ---------------- */
const ICONS = {
  drop:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7c3.6 4.2 6 7.4 6 10.3a6 6 0 0 1-12 0c0-2.9 2.4-6.1 6-10.3z"/></svg>`,
  history:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/><polyline points="12 7 12 12 15 14"/></svg>`,
  bolt:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  motor:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="13" height="10" rx="1.5"/><circle cx="9.5" cy="12" r="2.2"/><path d="M16 10h2l3 -2.2v8.4L18 14h-2"/></svg>`,
  checklist:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M9 3v2h6V3"/></svg>`,
  shield:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>`,
  wrench:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2z"/></svg>`,
  coil:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c0-2 1.5-3 3-3s3 1 3 3-1.5 3-3 3M9 12c0-2 1.5-3 3-3s3 1 3 3-1.5 3-3 3M15 12c0-2 1.5-3 3-3s3 1 3 3-1.5 3-3 3"/></svg>`,
  toolbox:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="9" width="19" height="11" rx="1.5"/><path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M2.5 14h19"/></svg>`,
  bearing:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/><circle cx="12" cy="4.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="19.4" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="19.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  chev:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  plus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/></svg>`,
  trash:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12z"/></svg>`,
  edit:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  upload:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`,
  file:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  download:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 12l6 6 6-6"/><path d="M4 20h16"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L14.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`,
  gauge:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15l3.5-5"/><path d="M4 15a8 8 0 1 1 16 0"/></svg>`,
  print:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  eye:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  lift:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="1.5"/><polyline points="10 8 12 6 14 8"/><polyline points="10 14 12 16 14 14"/></svg>`,
  clip:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
};

/* ---------------- Access control ---------------- */
/* ---------------- Editor sign-in modal ---------------- */
/* Anyone can view the dashboard freely. Only someone who enters the correct password here
   gets write access — this calls signInEditor() in firebase-sync.js, which signs in to the
   one shared Firebase account behind the scenes. */
function openSignInModal(){
  openModal({
    title: 'Sign In to Edit',
    submitLabel: 'Sign In',
    bodyHtml: `
      <p class="hint" style="margin-bottom:12px;">Enter the editor password to add, edit, or delete anything on this dashboard. Viewing doesn't require this.</p>
      <input class="field" type="password" id="editorPw" maxlength="40" placeholder="Password" style="letter-spacing:.2em;text-align:center;">
      <div class="err-msg" id="editorErr" style="color:var(--safety-red);font-size:12px;margin-top:8px;min-height:16px;"></div>
    `,
    onMount:(overlay)=>{
      overlay.querySelector('.modal-box').classList.add('signin-modal');
      const inp = overlay.querySelector('#editorPw');
      inp.focus();
      inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ overlay.querySelector('[data-submit]').click(); } });
    },
    onSubmit:(overlay)=>{
      const val = overlay.querySelector('#editorPw').value;
      const errEl = overlay.querySelector('#editorErr');
      const btn = overlay.querySelector('[data-submit]');
      btn.disabled = true; btn.textContent = 'Checking…';
      signInEditor(val).then(()=>{
        toast('Signed in — you can now add, edit, and delete.');
      }).catch(e=>{
        errEl.textContent = 'Incorrect password, or not connected — try again.';
        btn.disabled = false; btn.textContent = 'Sign In';
      });
      return false; // keep modal open until we know the result; close it manually on success
    }
  });
  // Close the modal automatically once sign-in actually succeeds.
  const off = () => {
    if(isEditor){ document.querySelectorAll('.modal-overlay').forEach(o=>o.remove()); }
  };
  const check = setInterval(()=>{
    if(isEditor){ off(); clearInterval(check); }
    if(!document.querySelector('.modal-overlay')){ clearInterval(check); }
  }, 200);
}

/* Runs a protected action only if currently signed in as editor; otherwise nudges
   the person to sign in first. Every add/edit/delete call site uses this. */
function requireEdit(actionLabel, onConfirm){
  if(isEditor){ onConfirm(); return; }
  toast(`Sign in to edit (top right) before you can ${actionLabel}.`, true);
  openSignInModal();
}

function updateAuthBadge(){
  const el = document.getElementById('authBadge');
  if(!el) return;
  if(isEditor){
    el.innerHTML = `<span class="edit-badge on">${ICONS.check} Editing enabled</span><button class="btn btn-ghost btn-sm" id="btnSignOut" type="button">Sign out</button>`;
    const so = document.getElementById('btnSignOut');
    if(so) so.addEventListener('click', ()=> signOutEditor().then(()=> toast('Signed out — now in view-only mode.')));
  } else {
    el.innerHTML = `<button class="btn btn-amber btn-sm" id="btnSignIn" type="button">${ICONS.edit} Sign In to Edit</button>`;
    const si = document.getElementById('btnSignIn');
    if(si) si.addEventListener('click', openSignInModal);
  }
}
function onAuthChange(){ updateAuthBadge(); }

/* ---------------- Modal helper ---------------- */
function openModal({title, bodyHtml, onMount, onSubmit, submitLabel='Save', wide=false}){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="${wide?'width:min(920px,96vw)':''}">
      <div class="modal-head"><h3>${title}</h3><button data-close type="button">&times;</button></div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close type="button">Cancel</button>
        <button class="btn btn-amber" data-submit type="button">${submitLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(); });
  overlay.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', close));
  function close(){ overlay.remove(); }
  overlay.querySelector('[data-submit]').addEventListener('click', async ()=>{
    const submitBtn = overlay.querySelector('[data-submit]');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = 'Saving…';
    try{
      const ok = await onSubmit(overlay);
      if(ok !== false) close();
      else { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }catch(e){
      console.error('Modal submit failed', e);
      if(typeof toast==='function') toast('Something went wrong saving this — please try again.', true);
      submitBtn.disabled = false; submitBtn.textContent = originalLabel;
    }
  });
  if(onMount) onMount(overlay);
  return overlay;
}

/* ---------------- File storage ----------------
   idbPut(id, file) / idbGet(id) -> Blob / idbDelete(id) are now defined in firebase-sync.js,
   backed by Firebase Storage instead of IndexedDB, so uploaded files are shared across everyone
   too — same function names/signatures, so nothing below this line needed to change. */

const OH_UNITS = ['Unit 1','Unit 2','Unit 3','Unit 4','Unit 5','Unit 6'];
const UNIT_UI = {};          // per-upload-list memory: {up: unit chosen for next upload, filter: unit filter}
const OH_LOG_FILTER = { ht:'All', lt:'All' };   // unit filter for the saved OH form records

function unitOptionsHtml(selected, opts={}){
  const first = opts.all ? `<option value="All" ${selected==='All'?'selected':''}>All Units</option>`
                         : `<option value="">— Select unit —</option>`;
  const extra = opts.unassigned ? `<option value="__none" ${selected==='__none'?'selected':''}>Unassigned (older records)</option>` : '';
  return first + OH_UNITS.map(u=>`<option value="${u}" ${u===selected?'selected':''}>${u}</option>`).join('') + extra;
}
function unitMatches(rec, filter){
  if(!filter || filter==='All') return true;
  if(filter==='__none') return !rec.unit;
  return rec.unit === filter;
}

function fileChipHtml(f){
  return `<div class="file-chip" data-file-id="${f.id}">
    ${ICONS.file}
    <span class="fname">${escapeHtml(f.name)}</span>
    ${f.unit ? `<span class="unit-badge">${escapeHtml(f.unit)}</span>` : ''}
    <span class="fmeta">${f.date} · ${fmtBytes(f.size)}</span>
    <button class="btn btn-ghost btn-sm" data-download-file="${f.id}" data-fname="${escapeHtml(f.name)}" type="button">${ICONS.download}</button>
    <button class="btn btn-danger btn-sm" data-del-file="${f.id}" type="button">${ICONS.trash}</button>
  </div>`;
}

function renderUploadBlock(container, filesKey, opts={}){
  const maxMB = opts.maxMB || 20;
  const allFiles = LS_get(filesKey, []);
  const byUnit = !!opts.byUnit;
  const ui = byUnit ? (UNIT_UI[filesKey] = UNIT_UI[filesKey] || {up:'', filter:'All'}) : null;
  const files = byUnit ? allFiles.filter(f=>unitMatches(f, ui.filter)) : allFiles;
  const hasUnassigned = byUnit && allFiles.some(f=>!f.unit);
  container.innerHTML = `
    ${byUnit ? `<div class="unit-bar"><label>Which unit is this record for? <span style="color:var(--danger,#c0392b);">*</span></label>
      <select class="sel" id="upUnitSel">${unitOptionsHtml(ui.up)}</select></div>` : ''}
    <div class="upload-zone" tabindex="0">
      ${ICONS.upload}
      <p><strong>Click to upload</strong> or drag a scanned report here</p>
      <p style="font-size:11px;color:var(--steel-500);margin-top:4px;">Up to ${maxMB} MB per file — shared with everyone (stored in the free database)</p>
      <input type="file" accept="${opts.accept||'.pdf,.jpg,.jpeg,.png'}" style="display:none" ${opts.multiple?'multiple':''}>
      <div class="btn btn-ghost btn-sm" style="margin-top:12px;pointer-events:none;">Choose file</div>
    </div>
    ${byUnit ? `<div class="unit-bar" style="margin-top:16px;"><label>Filter uploaded records by unit</label>
      <select class="sel" id="fltUnitSel">${unitOptionsHtml(ui.filter, {all:true, unassigned:hasUnassigned})}</select>
      <span class="fmeta">${files.length} of ${allFiles.length} shown</span></div>` : ''}
    <div class="file-list">${files.map(fileChipHtml).join('') || (byUnit && allFiles.length ? '<p class="hint">No uploaded records for this unit.</p>' : '')}</div>
  `;
  const zone = container.querySelector('.upload-zone');
  const input = container.querySelector('input[type=file]');
  if(byUnit){
    container.querySelector('#upUnitSel').addEventListener('change', e=>{ ui.up = e.target.value; });
    container.querySelector('#fltUnitSel').addEventListener('change', e=>{ ui.filter = e.target.value; renderUploadBlock(container, filesKey, opts); });
  }
  const needUnit = ()=>{ if(byUnit && !ui.up){ toast('Please select which unit (Unit 1 – Unit 6) this record is for before uploading.', true); return true; } return false; };
  zone.addEventListener('click', ()=>{ if(!isEditor){ requireEdit('upload a file', ()=>{}); return; } if(needUnit()) return; input.click(); });
  zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', ()=> zone.classList.remove('drag'));
  zone.addEventListener('drop', async e=>{
    e.preventDefault(); zone.classList.remove('drag');
    if(!isEditor){ requireEdit('upload a file', ()=>{}); return; }
    if(needUnit()) return;
    await handleFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', async ()=>{ await handleFiles(input.files); input.value=''; });

  async function handleFiles(fileList){
    let anySuccess = false;
    for(const file of fileList){
      if(file.size > maxMB*1024*1024){
        toast(`"${file.name}" is ${(file.size/1024/1024).toFixed(1)} MB — over the ${maxMB} MB shared-storage limit. Try a smaller/compressed file.`, true);
        continue;
      }
      const id = uid();
      toast(`Uploading "${file.name}"…`);
      try{ await idbPut(id, file); }
      catch(e){ toast(e.message || `Could not store "${file.name}".`, true); continue; }
      try{ await cloudAddRecord(filesKey, {id, name:file.name, size:file.size, date:todayISO(), ...(byUnit ? {unit: ui.up} : {})}); }
      catch(e){ toast('The file was stored, but its listing failed to save — please retry.', true); continue; }
      anySuccess = true;
    }
    renderUploadBlock(container, filesKey, opts);
    if(anySuccess) toast('File(s) uploaded and saved — visible to everyone using this dashboard.');
  }

  container.querySelectorAll('[data-del-file]').forEach(btn=>{
    btn.addEventListener('click', () => {
      requireEdit('remove this uploaded file', async () => {
        if(!confirm('Remove this uploaded file?')) return;
        await idbDelete(btn.dataset.delFile).catch(()=>{});
        await cloudDeleteRecord(filesKey, btn.dataset.delFile).catch(()=>{});
        renderUploadBlock(container, filesKey, opts);
      });
    });
  });
  container.querySelectorAll('[data-download-file]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      let blob;
      try{ blob = await idbGet(btn.dataset.downloadFile); }
      catch(e){ toast(e.message || 'File not found in the shared database.', true); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = btn.dataset.fname || 'file';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 4000);
    });
  });
}

/* ---------------- Navigation model ---------------- */
const NAV = [
  { id:'motors', label:'Motors', icon:'motor', sub:[
    { id:'motors-ht', label:'HT Motors Details' },
    { id:'motors-lt', label:'LT Motors Details' },
    { id:'bearings-ht', label:'HT Motor Bearings' },
    { id:'bearings-lt', label:'LT Motor Bearings' },
  ]},
  { id:'daily', label:'Daily Checklist', icon:'checklist', sub:[
    { id:'daily-ht', label:'HT Motor Daily Checklist' },
    { id:'daily-lt', label:'LT Motor Daily Checklist' },
  ]},
  { id:'preservation', label:'HT Motor Preservation', icon:'shield', sub:[] },
  { id:'oh', label:'OH Records', icon:'wrench', sub:[
    { id:'oh-ht', label:'HT Motor OH Checklist' },
    { id:'oh-lt', label:'LT Motor OH Checklist' },
  ]},
  { id:'rewinding', label:'LT Motor Rewinding', icon:'coil', sub:[] },
  { id:'equiphist', label:'Equipment History', icon:'history', sub:[] },
  { id:'lubrication', label:'Lubrication Details', icon:'lube', sub:[] },
  { id:'autolub', label:'Auto Lubricator Details', icon:'drop', sub:[], href:'https://perma-connect.com/#/login' },   // external link — opens in a new tab
  { id:'workshop', label:'Workshop', icon:'toolbox', sub:[] },
];

const DASH_META = {
  motors:{desc:'HT & LT motor master data, unit-wise listing and spare status', icon:'motor'},
  daily:{desc:'Daily running checklist for HT & LT motors', icon:'checklist'},
  preservation:{desc:'Preservation testing log for stored/standby HT motors', icon:'shield'},
  oh:{desc:'Overhaul inspection & test records for HT and LT motors', icon:'wrench'},
  rewinding:{desc:'LT motor rewinding checklist & report', icon:'coil'},
  equiphist:{desc:'Event & maintenance history of individual HT / LT motors, sortable by unit and equipment name', icon:'history'},
  lubrication:{desc:'Unit-wise greasing / oil-filling schedule, history and entry log for motors (Units 1-6, Stage Offsites, Station Common)', icon:'lube'},
  autolub:{desc:'Opens the Perma-Connect auto lubricator portal (login required) in a new tab', icon:'drop'},
  workshop:{desc:"Equipment & instruments available in the workshop", icon:'toolbox'},
};

let STATE = { section:'dashboard', sub:null };

function setRoute(section, sub){
  STATE = { section, sub: sub || null };
  location.hash = sub ? `#${section}/${sub}` : `#${section}`;
  render();
}

window.addEventListener('hashchange', ()=>{
  const h = location.hash.replace('#','');
  if(!h){ STATE = {section:'dashboard', sub:null}; render(); return; }
  const [section, sub] = h.split('/');
  STATE = { section, sub: sub || null };
  render();
});

/* ---------------- Shell render ---------------- */
function renderShell(){
  document.getElementById('app').innerHTML = `
    <div class="brandbar">
      <span class="bolt">${ICONS.bolt}</span>
      <div class="brand-text">EM CONTROL<small>Electrical Maintenance Dept · Motors / Lifts / Workshop</small></div>
    </div>
    <div class="topbar">
      <div class="crumbs" id="crumbs"></div>
      <div class="meta">
        <span id="authBadge"></span>
        <span class="station-badge">FGUTPP</span>
        <span class="clock" id="clock"></span>
      </div>
    </div>
    <div class="sidebar" id="sidebar"></div>
    <div class="main" id="main"></div>
  `;
  tickClock();
  setInterval(tickClock, 1000);
  renderSidebar();
  updateAuthBadge();
}

function tickClock(){
  const el = document.getElementById('clock');
  if(el) el.textContent = new Date().toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'medium'});
}

function renderSidebar(){
  const sb = document.getElementById('sidebar');
  sb.innerHTML = `
    <button class="nav-btn ${STATE.section==='dashboard'?'active':''}" data-nav="dashboard">
      <span class="ic">${ICONS.gauge}</span> Dashboard
    </button>
    ${NAV.map(n => `
      <div class="nav-group">
        <button class="nav-btn ${STATE.section===n.id?'active open':''}" data-nav="${n.id}" ${n.sub.length? 'data-toggle="1"':''}>
          <span class="ic">${ICONS[n.icon]}</span> ${n.label}
          ${n.sub.length? `<span class="chev">${ICONS.chev}</span>`:''}
        </button>
        ${n.sub.length? `
        <div class="subnav ${STATE.section===n.id?'open':''}">
          ${n.sub.map(s=>`
            <button class="subnav-btn ${STATE.section===n.id && STATE.sub===s.id?'active':''}" data-nav="${n.id}" data-sub="${s.id}">
              <span class="dot"></span>${s.label}
            </button>`).join('')}
        </div>`:''}
      </div>
    `).join('')}
  `;
  sb.querySelectorAll('[data-nav]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const section = btn.dataset.nav;
      const sub = btn.dataset.sub;
      if(sub){ setRoute(section, sub); return; }
      const navItem = NAV.find(n=>n.id===section);
      if(navItem && navItem.href){ window.open(navItem.href, '_blank', 'noopener,noreferrer'); return; }
      if(navItem && navItem.sub.length){
        setRoute(section, navItem.sub[0].id);
      } else {
        setRoute(section);
      }
    });
  });
}

function crumbHtml(parts){
  return parts.map((p,i)=> `<span class="seg ${i===parts.length-1?'current':''}">${escapeHtml(p)}</span>` +
    (i<parts.length-1? `<span class="sep">${ICONS.chev}</span>`:'')).join('');
}

/* ---------------- Main render dispatch ---------------- */
function render(){
  renderSidebar();
  const main = document.getElementById('main');
  const crumbs = document.getElementById('crumbs');

  if(STATE.section === 'dashboard'){
    crumbs.innerHTML = crumbHtml(['Dashboard']);
    main.innerHTML = renderDashboardHtml();
    bindDashboardCards();
    return;
  }

  const navItem = NAV.find(n=>n.id===STATE.section);
  if(!navItem){ setRoute('dashboard'); return; }
  const subItem = navItem.sub.find(s=>s.id===STATE.sub);
  crumbs.innerHTML = crumbHtml(subItem ? [navItem.label, subItem.label] : [navItem.label]);

  const routeKey = STATE.sub || STATE.section;
  const renderer = SECTION_RENDERERS[routeKey];
  if(renderer){ renderer(main); }
  else { main.innerHTML = `<div class="empty-state">${ICONS.alert}<h4>Not found</h4></div>`; }
}

/* Counts actual physical motors using the Population Qty column (a register row can represent
   several identical motors, e.g. "2 nos FD Fan Motor"). Falls back to 1 per row if left blank.
   Checks both known header spellings ("POPULATION QTY." and "POPULATION (QTY.)") since source
   spreadsheets have used both across different sheets. */
function sumPopulation(rows){
  return rows.reduce((total, r)=>{
    const raw = String(r['POPULATION QTY.'] ?? r['POPULATION (QTY.)'] ?? '').trim();
    const n = parseFloat(raw);
    return total + (raw !== '' && !isNaN(n) ? n : 1);
  }, 0);
}

function renderDashboardHtml(){
  const htCount = sumPopulation(LS_get(KEYS.htMotors, []));
  const ltCount = sumPopulation(Object.values(LS_get(KEYS.ltMotors, {})).flat());
  const htB = LS_get(KEYS.htBearings, []).length;
  const ltB = LS_get(KEYS.ltBearings, []).length;
  const wsCount = LS_get(KEYS.workshop, []).length;

  const cards = NAV.map(n=>{
    const meta = DASH_META[n.id];
    let subCount = '';
    if(n.id==='motors') subCount = `${htCount+ltCount} motors · ${htB+ltB} bearing types`;
    if(n.id==='daily') subCount = `${LS_get(KEYS.dailyHT,[]).length + LS_get(KEYS.dailyLT,[]).length} entries · ${LS_get(KEYS.dailyHTFiles,[]).length + LS_get(KEYS.dailyLTFiles,[]).length} files`;
    if(n.id==='preservation') subCount = `${LS_get(KEYS.preservationForms,[]).length} records · ${LS_get(KEYS.preservationFiles,[]).length} files`;
    if(n.id==='oh') subCount = `${LS_get(KEYS.ohHTForms,[]).length + LS_get(KEYS.ohLTForms,[]).length} records · ${LS_get(KEYS.ohHTFiles,[]).length + LS_get(KEYS.ohLTFiles,[]).length} files`;
    if(n.id==='rewinding') subCount = `${LS_get(KEYS.rewindForms,[]).length} records · ${LS_get(KEYS.rewindFiles,[]).length} files`;
    if(n.id==='equiphist') subCount = `${LS_get(KEYS.equipHistory,[]).length} entries logged`;
    if(n.id==='lubrication') subCount = (typeof lubDashSummary==='function') ? lubDashSummary() : '';
    if(n.id==='autolub') subCount = 'perma-connect.com ↗';
    if(n.id==='workshop') subCount = `${wsCount} items registered`;
    return `
      <div class="dash-card" data-card="${n.id}">
        <div class="ic-wrap">${ICONS[meta.icon]}</div>
        <h3>${n.label}</h3>
        <p>${meta.desc}</p>
        <div class="sub-count">${subCount}</div>
      </div>`;
  }).join('');

  return `
    <div class="hero-panel">
      <h1>Motors · Lifts · Workshop — Control Dashboard</h1>
      <p>Central record for HT/LT motor master data, bearing spares, daily checklists, preservation testing, overhaul &amp; rewinding history, and workshop instrumentation for the Electrical Maintenance Department.</p>
      <div class="hero-stats">
        <div class="hero-stat"><div class="n">${htCount}</div><div class="l">HT Motors</div></div>
        <div class="hero-stat"><div class="n">${ltCount}</div><div class="l">LT Motors</div></div>
        <div class="hero-stat"><div class="n">${htB+ltB}</div><div class="l">Bearing Types Tracked</div></div>
        <div class="hero-stat"><div class="n">${wsCount}</div><div class="l">Workshop Items</div></div>
      </div>
    </div>
    <div class="card-grid">${cards}</div>
    ${galleryPanelHtml()}
    <div class="info-band" style="margin-top:20px;">
      ${ICONS.alert}
      <div>Everyone who opens this page can view all data live — nothing to install, no sign-in needed to browse. Only someone signed in with the editor password (top right) can add, edit, or delete anything. Data lives in a shared cloud database, so it's always the same for everyone.</div>
    </div>
  `;
}

function galleryPanelHtml(){
  const count = 17;
  const files = Array.from({length: count}, (_,i)=> `images/gallery-${String(i+1).padStart(2,'0')}.jpg`);
  // duplicate the list once so the CSS animation (translateX -50%) loops seamlessly
  const cardsHtml = [...files, ...files].map(src =>
    `<div class="gallery-card"><img src="${src}" alt="Workshop / motor overhaul record"></div>`
  ).join('');
  return `
    <div class="gallery-panel">
      <div class="gallery-head">
        <div>
          <h3>${ICONS.wrench} Field &amp; Workshop Snapshots</h3>
          <p>Motor overhaul, rewinding, and dispatch records from the EM workshop</p>
        </div>
      </div>
      <div class="gallery-strip">
        <div class="gallery-track">${cardsHtml}</div>
      </div>
    </div>`;
}
function bindDashboardCards(){
  $$('[data-card]').forEach(card=>{
    card.addEventListener('click', ()=>{
      const id = card.dataset.card;
      const navItem = NAV.find(n=>n.id===id);
      if(navItem.href){ window.open(navItem.href, '_blank', 'noopener,noreferrer'); return; }
      setRoute(id, navItem.sub.length ? navItem.sub[0].id : null);
    });
  });
}

/* ============================================================
   MOTORS — HT & LT details tables
   ============================================================ */
// field tuple: [dataKey, label, editable?, isStatusQty?]
const HT_MOTOR_FIELDS = [
  ['STATION','Station'],['STAGE','Stage'],['UNIT NO','Unit No'],['EQUIPMENT','Equipment'],
  ['RATING (KW)','Rating (kW)'],['VOLTAGE (KV)','Voltage (kV)'],['FL CURRENT (AMP)','FL Current (A)'],
  ['SPEED (RPM)','Speed (RPM)'],['MAKE','Make'],['FRAME SIZE','Frame Size'],['TYPE OF COOLING','Cooling Type'],
  ['SERIAL NO.','Serial No.', true],['DE BRG NO','DE Brg No'],['NDE BRG NO','NDE Brg No'],
  ['POPULATION QTY.','Population Qty'],
  ['COMPLETE ASSEMBLY SPARE STATUS','Complete Assy Spare Status', false, true],
  ['PROCUREMENT PIPE LINE, IF ANY','Procurement Pipeline', true],
];
const LT_MOTOR_FIELDS = [
  ['SL.NO.','Sl No'],['MOTOR NAME','Motor Name'],['RATING (KW)','Rating (kW)'],['VOLTAGE (V)','Voltage (V)'],
  ['FL CURRENT (AMP)','FL Current (A)'],['SPEED (RPM)','Speed (RPM)'],['MAKE','Make'],['FRAME SIZE','Frame Size'],
  ['MOUNTING','Mounting'],['SERIAL NO.','Serial No.'],['DE BRG NO','DE Brg No'],['NDE BRG NO','NDE Brg No'],
  ['POPULATION QTY.','Population Qty'],
  ['COMPLETE  SPARE MOTOR STATUS','Spare Motor Status', false, true],
  ['PROCUREMENT PIPE LINE, IF ANY','Procurement Pipeline', true],
];

function spareBadge(qty){
  qty = Number(qty)||0;
  const cls = qty>=1 ? 'ok' : 'none';
  return `<span class="spare-pill ${cls}" data-spare-view>${qty} in stock</span>`;
}

/* Generic click-to-edit text cell (styled prompt via modal) */
function promptEdit(title, currentValue, onSave){
  if(!isEditor){ requireEdit('edit this field', ()=>{}); return; }
  openModal({
    title, submitLabel:'Save',
    bodyHtml: `<div class="f-item"><label>New Value</label><input class="field" id="editVal" value="${escapeHtml(currentValue||'')}"></div>`,
    onMount:(overlay)=>{ const i = overlay.querySelector('#editVal'); i.focus(); i.select();
      i.addEventListener('keydown', e=>{ if(e.key==='Enter') overlay.querySelector('[data-submit]').click(); }); },
    onSubmit:(overlay)=>{ onSave(overlay.querySelector('#editVal').value); }
  });
}

function historyFilesKey(motorId){ return 'em_history_'+motorId; }
function openHistoryModal(motorId, motorLabel){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-box">
    <div class="modal-head"><h3>Equipment History — ${escapeHtml(motorLabel)}</h3><button data-close type="button">&times;</button></div>
    <div class="modal-body">
      <p class="hint">Upload equipment history documents (text, Word, or Excel) for this motor.</p>
      <div id="histUpZone"></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close type="button">Close</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', ()=>overlay.remove()));
  renderUploadBlock(overlay.querySelector('#histUpZone'), historyFilesKey(motorId), {accept:'.txt,.doc,.docx,.xls,.xlsx', multiple:true});
}
function historyBtnHtml(motorId){
  /* Deliberately doesn't call LS_get here — doing so for every row in a 200+ row
     table would attach a permanent Firestore listener per motor just to show a
     count badge. The upload modal itself still shows the real file list live. */
  return `<button class="hist-btn" data-hist="${motorId}" title="Equipment history" type="button">${ICONS.clip}</button>`;
}

/* Sync a slim scrollbar above a table with the table's own horizontal scroll */
function wireTopScroll(root){
  const wrap = root.querySelector('.table-wrap');
  const top = root.querySelector('.topscroll');
  if(!wrap || !top) return;
  const table = wrap.querySelector('table');
  const inner = top.querySelector('.topscroll-inner');
  if(!table || !inner) return; // empty-state markup has no <table> — nothing to sync
  inner.style.width = table.scrollWidth + 'px';
  let syncing = false;
  top.addEventListener('scroll', ()=>{ if(syncing) return; syncing=true; wrap.scrollLeft = top.scrollLeft; syncing=false; });
  wrap.addEventListener('scroll', ()=>{ if(syncing) return; syncing=true; top.scrollLeft = wrap.scrollLeft; syncing=false; });
}

function renderMotorFormFields(fields, values={}){
  return `<div class="grid-2">${fields.map(([key,label])=>`
    <div class="f-item">
      <label>${escapeHtml(label)}</label>
      <input class="field" type="text" data-key="${escapeHtml(key)}" value="${escapeHtml(values[key] ?? '')}">
    </div>`).join('')}</div>`;
}

function openAddMotorModal(fields, onSave, title){
  openModal({
    title,
    wide:true,
    submitLabel:'Add Motor',
    bodyHtml: `
      <p class="hint">Fill in the fields below exactly as they should appear in the register. Leave blank if not applicable.</p>
      ${renderMotorFormFields(fields)}
    `,
    onSubmit: async (overlay)=>{
      const rec = { id: uid() };
      overlay.querySelectorAll('[data-key]').forEach(inp=>{ rec[inp.dataset.key] = inp.value; });
      await onSave(rec);
      toast('Motor added to register.');
    }
  });
}

function motorLabelOf(r){ return r.EQUIPMENT || r['MOTOR NAME'] || 'Motor'; }

function motorTableHtml(fields, rows, opts={}){
  if(!rows.length){
    return `<div class="topscroll"><div class="topscroll-inner"></div></div><div class="table-wrap compact"><div class="empty-state">${ICONS.motor}<h4>No motors in this list yet</h4><p>Use "Add Motor" to register the first entry.</p></div></div>`;
  }
  return `
    <div class="topscroll"><div class="topscroll-inner"></div></div>
    <div class="table-wrap compact"><table class="dgrid compact">
    <thead><tr>
      ${fields.map(([k,l])=>`<th class="wrap">${escapeHtml(l)}</th>`).join('')}
      <th>History</th>
      <th>Actions</th>
    </tr></thead>
    <tbody>
      ${rows.map(r=>`
        <tr data-row-id="${r.id}">
          ${fields.map(([k,l,editable,isQty])=>{
            const val = r[k] ?? '';
            if(isQty){
              return `<td><div class="status-adjust" data-qty-row="${r.id}" data-qty-key="${escapeHtml(k)}">
                <button data-qty-dec type="button">−</button>
                <span class="val" data-qty-val>${Number(val)||0}</span>
                <button data-qty-inc type="button">+</button>
              </div></td>`;
            }
            if(editable){
              return `<td class="wrap editable-cell" data-edit-row="${r.id}" data-edit-key="${escapeHtml(k)}">${escapeHtml(val)}</td>`;
            }
            return `<td class="wrap">${escapeHtml(val)}</td>`;
          }).join('')}
          <td>${historyBtnHtml(r.id)}</td>
          <td class="row-actions">
            <button class="btn btn-danger btn-sm" data-del-row="${r.id}" type="button">${ICONS.trash}</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

function bindMotorTableEvents(container, storeKey, rerender){
  function findRecord(id){
    return (CLOUD_CACHE[storeKey] || []).find(r=>r.id===id);
  }
  container.querySelectorAll('[data-qty-row]').forEach(wrap=>{
    const id = wrap.dataset.qtyRow, key = wrap.dataset.qtyKey;
    const adjust = async (delta)=>{
      const r = findRecord(id);
      if(!r) return;
      const newVal = Math.max(0, (Number(r[key])||0) + delta);
      await cloudUpdateRecord(storeKey, id, { [key]: newVal });
      wrap.querySelector('[data-qty-val]').textContent = newVal;
    };
    wrap.querySelector('[data-qty-inc]').addEventListener('click', ()=>adjust(1));
    wrap.querySelector('[data-qty-dec]').addEventListener('click', ()=>adjust(-1));
  });
  container.querySelectorAll('[data-edit-row]').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      const id = cell.dataset.editRow, key = cell.dataset.editKey;
      const r = findRecord(id);
      promptEdit('Edit ' + key, r ? r[key] : '', async (newVal)=>{
        await cloudUpdateRecord(storeKey, id, { [key]: newVal });
        cell.textContent = newVal;
      });
    });
  });
  container.querySelectorAll('[data-hist]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = findRecord(btn.dataset.hist);
      openHistoryModal(btn.dataset.hist, motorLabelOf(r||{}));
      // refresh badge count when the history modal closes
      const check = setInterval(()=>{
        if(!document.body.contains(document.querySelector('.modal-overlay'))){
          clearInterval(check);
          btn.outerHTML = historyBtnHtml(btn.dataset.hist);
        }
      }, 300);
    });
  });
  container.querySelectorAll('[data-del-row]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      requireEdit('delete this motor from the register', async ()=>{
        await cloudDeleteRecord(storeKey, btn.dataset.delRow);
        rerender();
        toast('Motor removed.');
      });
    });
  });
  wireTopScroll(container);
}

function filterRows(rows, fields, query, unitFilter){
  let out = rows;
  if(unitFilter && unitFilter !== 'ALL'){
    out = out.filter(r => (r['UNIT NO']||'') === unitFilter || (r['STAGE']||'')===unitFilter);
  }
  if(query){
    const q = query.toLowerCase();
    out = out.filter(r => fields.some(([k]) => String(r[k]||'').toLowerCase().includes(q)));
  }
  return out;
}

function renderHTMotors(main){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.motor} HT Motors — Master Register</h2><div class="desc">All high-tension motors across stages/units. Spare availability is editable per motor. <strong id="htCountLine"></strong></div></div>
      <button class="btn btn-amber" id="btnAddHT">${ICONS.plus} Add Motor</button>
    </div>
    <div class="toolbar">
      <div class="grow"><input class="search-input" id="htSearch" placeholder="Search equipment, make, serial no, unit..."></div>
      <select class="sel" id="htUnitFilter" style="max-width:220px;"><option value="ALL">All Units / Stages</option></select>
    </div>
    <div id="htTableHost"></div>
  `;
  const unitSel = $('#htUnitFilter', main);
  const units = Array.from(new Set(LS_get(KEYS.htMotors,[]).map(r=>r['UNIT NO']).filter(Boolean)));
  units.forEach(u=> unitSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`));

  function updateCountLine(){
    const all = LS_get(KEYS.htMotors,[]);
    $('#htCountLine',main).textContent = `${all.length} register entries · ${sumPopulation(all)} total motors (per Population Qty column)`;
  }
  function draw(){
    updateCountLine();
    const rows = filterRows(LS_get(KEYS.htMotors,[]), HT_MOTOR_FIELDS, $('#htSearch',main).value, unitSel.value);
    const host = $('#htTableHost', main);
    host.innerHTML = motorTableHtml(HT_MOTOR_FIELDS, rows);
    bindMotorTableEvents(host, KEYS.htMotors, draw);
  }
  $('#htSearch',main).addEventListener('input', draw);
  unitSel.addEventListener('change', draw);
  $('#btnAddHT',main).addEventListener('click', ()=>{
    if(!isEditor){ requireEdit('add a motor', ()=>{}); return; }
    openAddMotorModal(HT_MOTOR_FIELDS, async (rec)=>{
      await cloudAddRecord(KEYS.htMotors, rec); draw();
    }, 'Add New HT Motor');
  });
  draw();
}

function renderLTMotors(main){
  const dataObj = LS_get(KEYS.ltMotors, {});
  const unitTabs = Object.keys(dataObj);
  const allRatings = Array.from(new Set(
    Object.values(dataObj).flat().map(r=>String(r['RATING (KW)']||'').trim()).filter(Boolean)
  )).sort((a,b)=>parseFloat(a)-parseFloat(b));

  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.motor} LT Motors — Master Register</h2><div class="desc">Unit/area-wise LT motor listing. Spare motor status is editable per motor. <strong id="ltCountLine"></strong></div></div>
      <button class="btn btn-amber" id="btnAddLT">${ICONS.plus} Add Motor</button>
    </div>
    <div class="tabbar" id="ltTabs">
      ${unitTabs.map((u,i)=>`<button data-tab="${escapeHtml(u)}" class="${i===0?'active':''}">${escapeHtml(u)}</button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="grow"><input class="search-input" id="ltSearch" placeholder="Search motor name, make, serial no..."></div>
      <select class="sel" id="ltRatingFilter" style="max-width:240px;">
        <option value="">Filter: Similar Rating (kW) — All Units</option>
        ${allRatings.map(r=>`<option value="${escapeHtml(r)}">${escapeHtml(r)} kW — across all units</option>`).join('')}
      </select>
    </div>
    <div id="ltTableHost"></div>
  `;
  let activeUnit = unitTabs[0];

  function updateCountLine(){
    const all = Object.values(LS_get(KEYS.ltMotors,{})).flat();
    $('#ltCountLine',main).textContent = `${all.length} register entries · ${sumPopulation(all)} total motors (per Population Qty column)`;
  }

  function drawRatingView(rating){
    updateCountLine();
    const combined = [];
    Object.keys(dataObj).forEach(unit=>{
      (LS_get(KEYS.ltMotors,{})[unit]||[]).forEach(r=>{
        if(String(r['RATING (KW)']||'').trim() === rating) combined.push({...r, __unit:unit});
      });
    });
    const fieldsWithUnit = [['__unit','Unit / Area'], ...LT_MOTOR_FIELDS];
    $('#ltTableHost',main).innerHTML = motorTableHtml(fieldsWithUnit, combined);
    bindMotorTableEvents($('#ltTableHost',main), KEYS.ltMotors, ()=>drawRatingView(rating));
  }

  function draw(){
    updateCountLine();
    const ratingSel = $('#ltRatingFilter',main).value;
    if(ratingSel){ drawRatingView(ratingSel); return; }
    const freshData = LS_get(KEYS.ltMotors, {}); // re-fetch fresh — never reuse the outer, point-in-time dataObj here
    const rows = filterRows(freshData[activeUnit]||[], LT_MOTOR_FIELDS, $('#ltSearch',main).value, null);
    $('#ltTableHost',main).innerHTML = motorTableHtml(LT_MOTOR_FIELDS, rows);
    bindMotorTableEvents($('#ltTableHost',main), KEYS.ltMotors, draw);
  }
  $$('#ltTabs button', main).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('#ltTabs button',main).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); activeUnit = btn.dataset.tab;
      $('#ltRatingFilter',main).value = '';
      draw();
    });
  });
  $('#ltSearch',main).addEventListener('input', draw);
  $('#ltRatingFilter',main).addEventListener('change', draw);
  $('#btnAddLT',main).addEventListener('click', ()=>{
    if(!isEditor){ requireEdit('add a motor', ()=>{}); return; }
    openModal({
      title:'Add New LT Motor', wide:true, submitLabel:'Add Motor',
      bodyHtml: `
        <div class="f-item" style="margin-bottom:14px;">
          <label>Unit / Area</label>
          <select class="sel" id="ltUnitPick">${unitTabs.map(u=>`<option value="${escapeHtml(u)}" ${u===activeUnit?'selected':''}>${escapeHtml(u)}</option>`).join('')}</select>
        </div>
        ${renderMotorFormFields(LT_MOTOR_FIELDS)}
        <div class="f-item" style="margin-top:12px;">
          <label>Initial Spare Availability (Qty)</label>
          <input class="field" type="number" min="0" data-key="SPARE_QTY" value="0" style="max-width:160px;">
        </div>
      `,
      onSubmit: async (overlay)=>{
        const rec = { id: uid() };
        overlay.querySelectorAll('[data-key]').forEach(inp=>{ rec[inp.dataset.key] = inp.value; });
        const unit = overlay.querySelector('#ltUnitPick').value;
        await cloudAddRecord(KEYS.ltMotors, { ...rec, __unit: unit });
        if(unit===activeUnit) draw();
        toast('Motor added to '+unit+'.');
      }
    });
  });
  draw();
}

/* ============================================================
   BEARINGS — HT & LT availability status
   ============================================================ */
const BEARING_FIELDS = [
  ['Sr','Sr'],['Matl. Code','Material Code'],['Matl. Desc.','Bearing No / Description'],
  ['Equipment of Use','Equipment of Use'],['Area/stage','Area / Stage'],
  ['Population of bearing in equipment','Population in Equipment'],
  ['Category Type A1HS, A1LS, A2, B , C','Category Type'],
  ['If Plummer block,Housing etc mention below','Plummer Block / Housing'],
  ['ANNUAL BEARING REQUIREMENT','Annual Requirement'],
  ['Remarks if Material PO text is not sufficient','Remarks'],
];
// LT sheet has slightly different key spelling for the housing column — normalized at render time.

function normBearing(b){
  const housingKey = 'If Plummer block,Housing etc mention below' in b ? 'If Plummer block,Housing etc mention below' : 'If Plummer block, Housing etc mention below';
  // material codes: may already be an array (new entries) or a single legacy string
  let codes = b.codes;
  if(!codes){
    const legacy = String(b['Matl. Code']||'').trim();
    codes = legacy ? legacy.split(/[,;\/]+/).map(s=>s.trim()).filter(Boolean) : [];
  }
  return {
    id: b.id, Sr: b.Sr, codes, desc: b['Matl. Desc.'],
    use: b['Equipment of Use'], area: b['Area/stage'], population: b['Population of bearing in equipment'],
    category: b['Category Type A1HS, A1LS, A2, B , C'], housing: b[housingKey],
    annualReq: b['ANNUAL BEARING REQUIREMENT'], remarks: b['Remarks if Material PO text is not sufficient'],
    central: Number(b['Bearing Stock in Central Store as on 13.04.2023'] ?? b['Bearing Stock in Central Store as on 18.04.2023'] ?? b.central ?? 0) || 0,
    workshop: Number(b['Bearing Stock at workshop as on 13.04.2023'] ?? b['Bearing Stock at workshop as on 18.04.2023'] ?? b.workshop ?? 0) || 0,
  };
}

function bearingTableHtml(rows, opts={}){
  if(!rows.length) return `<div class="topscroll"><div class="topscroll-inner"></div></div><div class="table-wrap compact"><div class="empty-state">${ICONS.bearing}<h4>No bearings registered</h4></div></div>`;
  const w = opts.narrow;
  return `
  <div class="topscroll"><div class="topscroll-inner"></div></div>
  <div class="table-wrap compact"><table class="dgrid compact">
    <thead><tr>
      <th>Sr</th><th class="wrap" style="${w?'min-width:150px;':''}">Material Code(s)</th><th class="wrap">Bearing No</th><th class="wrap">Equipment of Use</th>
      <th class="wrap">Area / Stage</th><th>Popn</th><th>Category</th><th class="wrap">Housing</th>
      <th>Annual Req</th><th class="wrap" style="min-width:180px;">Remarks</th>
      <th>Central Store</th><th>Workshop</th><th>Actions</th>
    </tr></thead>
    <tbody>
      ${rows.map(nb=>`
        <tr data-brg-id="${nb.id}">
          <td>${escapeHtml(nb.Sr)}</td>
          <td class="wrap" data-codes-cell="${nb.id}">
            ${nb.codes.map((c,ci)=>`<span class="code-chip">${escapeHtml(c)}<button data-rm-code="${nb.id}" data-ci="${ci}" type="button" title="Remove code">&times;</button></span>`).join('')}
            <button class="hist-btn" data-add-code="${nb.id}" title="Add another material code" type="button" style="vertical-align:middle;">${ICONS.plus}</button>
          </td>
          <td class="wrap"><strong>${escapeHtml(nb.desc)}</strong></td>
          <td class="wrap">${escapeHtml(nb.use)}</td>
          <td class="wrap">${escapeHtml(nb.area)}</td>
          <td class="num">${escapeHtml(nb.population)}</td>
          <td>${escapeHtml(nb.category)}</td>
          <td class="wrap">${escapeHtml(nb.housing)}</td>
          <td class="num">${escapeHtml(nb.annualReq)}</td>
          <td class="wrap editable-cell" data-edit-remarks="${nb.id}">${escapeHtml(nb.remarks)}</td>
          <td><div class="status-adjust" data-stock="central" data-id="${nb.id}">
            <button data-dec type="button">−</button><span class="val" data-val>${nb.central}</span><button data-inc type="button">+</button>
          </div></td>
          <td><div class="status-adjust" data-stock="workshop" data-id="${nb.id}">
            <button data-dec type="button">−</button><span class="val" data-val>${nb.workshop}</span><button data-inc type="button">+</button>
          </div></td>
          <td class="row-actions"><button class="btn btn-danger btn-sm" data-del-brg="${nb.id}" type="button">${ICONS.trash}</button></td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

function renderBearingSection(main, storeKey, title, stampLabel, opts={}){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.bearing} ${title}</h2><div class="desc">Bearing spare status — use +/− to adjust stock counts as bearings are issued or received (password required). ${stampLabel}</div></div>
      <button class="btn btn-amber" id="btnAddBrg">${ICONS.plus} Add Bearing</button>
    </div>
    <div class="toolbar"><div class="grow"><input class="search-input" id="brgSearch" placeholder="Search bearing no, material code, equipment, area..."></div></div>
    <div id="brgHost"></div>
  `;
  function getRaw(){ return LS_get(storeKey, []); }

  function draw(){
    const q = ($('#brgSearch',main).value||'').toLowerCase();
    const norm = getRaw().map(normBearing).filter(nb=>{
      if(!q) return true;
      return [nb.desc,nb.use,nb.area,...(nb.codes||[])].some(v=>String(v||'').toLowerCase().includes(q));
    });
    $('#brgHost',main).innerHTML = bearingTableHtml(norm, opts);
    bindBearingEvents();
  }
  function bindBearingEvents(){
    $$('.status-adjust',main).forEach(wrap=>{
      const id = wrap.dataset.id, field = wrap.dataset.stock;
      const rawKeyCentral = getRaw().find(r=>r.id===id) ? Object.keys(getRaw().find(r=>r.id===id)).find(k=>k.startsWith('Bearing Stock in Central Store')) : null;
      const rawKeyWorkshop = getRaw().find(r=>r.id===id) ? Object.keys(getRaw().find(r=>r.id===id)).find(k=>k.startsWith('Bearing Stock at workshop')) : null;
      const adjust = (delta)=>{
        requireEdit('adjust bearing stock quantity', async ()=>{
          const r = getRaw().find(x=>x.id===id);
          const key = field==='central' ? (rawKeyCentral || 'Bearing Stock in Central Store as on '+todayISO()) : (rawKeyWorkshop || 'Bearing Stock at workshop as on '+todayISO());
          const newVal = Math.max(0, (Number(r[key])||0) + delta);
          await cloudUpdateRecord(storeKey, id, { [key]: newVal });
          wrap.querySelector('[data-val]').textContent = newVal;
        });
      };
      wrap.querySelector('[data-inc]').addEventListener('click', ()=>adjust(1));
      wrap.querySelector('[data-dec]').addEventListener('click', ()=>adjust(-1));
    });
    $$('[data-edit-remarks]',main).forEach(cell=>{
      cell.addEventListener('click', ()=>{
        const id = cell.dataset.editRemarks;
        const r = getRaw().find(x=>x.id===id);
        promptEdit('Edit Remarks', r['Remarks if Material PO text is not sufficient'], async (val)=>{
          await cloudUpdateRecord(storeKey, id, { 'Remarks if Material PO text is not sufficient': val });
          cell.textContent = val;
        });
      });
    });
    $$('[data-add-code]',main).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.addCode;
        promptEdit('Add Material Code', '', async (val)=>{
          if(!val) return;
          const r = getRaw().find(x=>x.id===id);
          const nb = normBearing(r);
          const codes = [...nb.codes, val];
          await cloudUpdateRecord(storeKey, id, { codes, 'Matl. Code': codes.join(', ') });
          draw();
        });
      });
    });
    $$('[data-rm-code]',main).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        requireEdit('remove this material code', async ()=>{
          const id = btn.dataset.rmCode, ci = Number(btn.dataset.ci);
          const r = getRaw().find(x=>x.id===id);
          const nb = normBearing(r);
          const codes = nb.codes.filter((_,i)=>i!==ci);
          await cloudUpdateRecord(storeKey, id, { codes, 'Matl. Code': codes.join(', ') });
          draw();
        });
      });
    });
    $$('[data-del-brg]',main).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        requireEdit('delete this bearing entry from the register', async ()=>{
          await cloudDeleteRecord(storeKey, btn.dataset.delBrg);
          draw();
          toast('Bearing removed.');
        });
      });
    });
    wireTopScroll(main);
  }
  $('#brgSearch',main).addEventListener('input', draw);
  $('#btnAddBrg',main).addEventListener('click', ()=>{
    if(!isEditor){ requireEdit('add a bearing', ()=>{}); return; }
    openModal({
      title:'Add New Bearing', wide:true, submitLabel:'Add Bearing',
      bodyHtml: `
        <div class="grid-2">
          <div class="f-item" style="grid-column:1/-1;">
            <label>Material Code(s) — add one, more can be added later from the table</label>
            <input class="field" id="bf_code" placeholder="e.g. M1920662412">
          </div>
          <div class="f-item"><label>Bearing No / Description</label><input class="field" id="bf_desc"></div>
          <div class="f-item" style="grid-column:1/-1;"><label>Equipment of Use</label><input class="field" id="bf_use"></div>
          <div class="f-item"><label>Area / Stage</label><input class="field" id="bf_area"></div>
          <div class="f-item"><label>Population in Equipment</label><input class="field" type="number" id="bf_pop"></div>
          <div class="f-item"><label>Category Type (A1HS / A1LS / A2 / B / C)</label><input class="field" id="bf_cat"></div>
          <div class="f-item"><label>Plummer Block / Housing (if any)</label><input class="field" id="bf_house"></div>
          <div class="f-item"><label>Annual Requirement</label><input class="field" type="number" id="bf_req"></div>
          <div class="f-item" style="grid-column:1/-1;"><label>Remarks</label><input class="field" id="bf_remarks"></div>
          <div class="f-item"><label>Initial Stock — Central Store</label><input class="field" type="number" id="bf_central" value="0"></div>
          <div class="f-item"><label>Initial Stock — Workshop</label><input class="field" type="number" id="bf_workshop" value="0"></div>
        </div>
      `,
      onSubmit: async (overlay)=>{
        const g = sel=>overlay.querySelector(sel).value;
        const stamp = todayISO();
        const codeVal = g('#bf_code');
        await cloudAddRecord(storeKey, {
          id: uid(), Sr: getRaw().length+1,
          codes: codeVal ? [codeVal] : [],
          'Matl. Code': codeVal, 'Matl. Desc.': g('#bf_desc'), 'Equipment of Use': g('#bf_use'),
          'Area/stage': g('#bf_area'), 'Population of bearing in equipment': g('#bf_pop'),
          'Category Type A1HS, A1LS, A2, B , C': g('#bf_cat'),
          'If Plummer block,Housing etc mention below': g('#bf_house'),
          'ANNUAL BEARING REQUIREMENT': g('#bf_req'), 'Remarks if Material PO text is not sufficient': g('#bf_remarks'),
          ['Bearing Stock in Central Store as on '+stamp]: g('#bf_central'),
          ['Bearing Stock at workshop as on '+stamp]: g('#bf_workshop'),
        });
        draw();
        toast('Bearing added to register.');
      }
    });
  });
  draw();
}

/* ============================================================
   DAILY CHECKLIST — HT & LT
   ============================================================ */
// HT daily checklist keeps only these fields per department instruction
// (current, voltage, vibration and winding temp were removed; motor/unit are picked from master data instead of free text)
const HT_DAILY_FIELDS = [
  ['shift','Shift','select:A,B,C,General'],
  ['bearingTempDE','Bearing Temp — DE (°C)','text'],
  ['bearingTempNDE','Bearing Temp — NDE (°C)','text'],
  ['sound','Abnormal Sound / Vibration','select:No,Yes'],
  ['oilLevel','Oil Level / Lubrication OK','select:OK,Top-up done,NA'],
  ['cleanliness','Cleanliness Around Equipment','select:OK,Needs attention'],
  ['remarks','Remarks','textarea'],
  ['checkedBy','Checked By','text'],
];

function exportCSV(filename, headers, rows){
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const csv = [headers.map(esc).join(','), ...rows.map(r=>r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

function htMotorOptionsHtml(){
  const rows = LS_get(KEYS.htMotors, []);
  const byUnit = {};
  rows.forEach(r=>{ const u = r['UNIT NO']||'Unspecified'; (byUnit[u]=byUnit[u]||[]).push(r); });
  return Object.keys(byUnit).map(u=>`<optgroup label="${escapeHtml(u)}">
    ${byUnit[u].map(r=>`<option value="${r.id}">${escapeHtml(r.EQUIPMENT||'')} (${escapeHtml(r['UNIT NO']||'')})</option>`).join('')}
  </optgroup>`).join('');
}

function fieldInputHtml(key, label, type, val=''){
  if(type.startsWith('select:')){
    const opts = type.split(':')[1].split(',');
    return `<div class="f-item"><label>${escapeHtml(label)}</label>
      <select class="sel" data-key="${key}">${opts.map(o=>`<option value="${escapeHtml(o)}" ${o===val?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select></div>`;
  }
  if(type==='textarea'){
    return `<div class="f-item" style="grid-column:1/-1;"><label>${escapeHtml(label)}</label><textarea class="field" rows="2" data-key="${key}">${escapeHtml(val)}</textarea></div>`;
  }
  if(type==='date'){
    return `<div class="f-item"><label>${escapeHtml(label)}</label><input class="field" type="date" data-key="${key}" value="${escapeHtml(val)}"></div>`;
  }
  return `<div class="f-item"><label>${escapeHtml(label)}</label><input class="field" type="text" data-key="${key}" value="${escapeHtml(val)}"></div>`;
}

/* ---------------- HT Daily Checklist — motor picked from master data ---------------- */
let dailyHTMode = 'form';   // remembered across live re-renders so uploading doesn't bounce you back to the form
let dailyLTMode = 'unit';
function renderDailyChecklistHT(main){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.checklist} HT Motor Daily Checklist</h2><div class="desc">Select the unit &amp; motor from the HT motor register, fill the daily check, and submit — or upload a scanned copy of the filled checklist. Entries are logged below and can be downloaded.</div></div>
    </div>
    <div class="mode-toggle" id="dhtMode">
      <button data-mode="form">Fill Daily Entry</button>
      <button data-mode="upload">Upload Scanned Copy</button>
    </div>
    <div style="height:16px;"></div>
    <div id="dhtUploadView" style="display:none;">
      <div class="form-card"><h3><span class="tagnum">UPLOAD</span> Scanned HT Motor Daily Checklist</h3>
        <p class="hint">Upload the filled &amp; signed daily checklist sheet (PDF or image, up to 20 MB). Multiple files allowed.</p>
        <div id="dhtUploadZone"></div></div>
    </div>
    <div id="dhtFormView">
    <div class="form-card">
      <h3><span class="tagnum">FORM</span> New Daily Entry</h3>
      <div class="grid-3" id="dailyForm">
        <div class="f-item"><label>Date</label><input class="field" type="date" id="dhtDate" value="${todayISO()}"></div>
        <div class="f-item" style="grid-column:span 2;">
          <label>Unit &amp; Motor (from HT Motors register)</label>
          <select class="sel" id="dhtMotor"><option value="">— Select motor —</option>${htMotorOptionsHtml()}</select>
        </div>
        ${HT_DAILY_FIELDS.map(([k,l,t])=>fieldInputHtml(k,l,t)).join('')}
      </div>
      <div style="margin-top:14px;"><button class="btn btn-amber" id="btnSubmitDaily">${ICONS.plus} Submit Entry</button></div>
    </div>
    <div class="section-head">
      <h2 style="font-size:18px;">Logged Entries</h2>
      <button class="btn btn-teal btn-sm" id="btnExportDaily">${ICONS.download} Download as Excel/CSV</button>
    </div>
    <div id="dailyLogHost"></div>
    </div>
  `;
  renderUploadBlock($('#dhtUploadZone', main), KEYS.dailyHTFiles, {multiple:true});
  const dhtBtns = $$('#dhtMode button', main);
  function setDhtMode(m){
    dailyHTMode = m;
    dhtBtns.forEach(x=>x.classList.toggle('active', x.dataset.mode===m));
    $('#dhtFormView', main).style.display = m==='form' ? '' : 'none';
    $('#dhtUploadView', main).style.display = m==='upload' ? '' : 'none';
  }
  dhtBtns.forEach(b=>b.addEventListener('click', ()=>setDhtMode(b.dataset.mode)));
  setDhtMode(dailyHTMode);
  function draw(){
    const rows = LS_get(KEYS.dailyHT, []).slice().reverse();
    const host = $('#dailyLogHost', main);
    if(!rows.length){ host.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.checklist}<h4>No entries yet</h4><p>Submit the form above to log the first daily check.</p></div></div>`; return; }
    host.innerHTML = `<div class="topscroll"><div class="topscroll-inner"></div></div>
    <div class="table-wrap compact"><table class="dgrid compact"><thead><tr>
      <th>Date</th><th class="wrap">Unit</th><th class="wrap">Motor</th>${HT_DAILY_FIELDS.map(([k,l])=>`<th class="wrap">${escapeHtml(l)}</th>`).join('')}<th>Actions</th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr>
        <td>${escapeHtml(r.date)}</td><td class="wrap">${escapeHtml(r.unit)}</td><td class="wrap">${escapeHtml(r.equipment)}</td>
        ${HT_DAILY_FIELDS.map(([k])=>`<td class="wrap">${escapeHtml(r[k]||'')}</td>`).join('')}
        <td><button class="btn btn-danger btn-sm" data-del="${r.id}" type="button">${ICONS.trash}</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
    $$('[data-del]', host).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('delete this daily checklist entry', ()=>{
        cloudDeleteRecord(KEYS.dailyHT, b.dataset.del);
        draw();
      });
    }));
    wireTopScroll(host);
  }
  $('#btnSubmitDaily', main).addEventListener('click', async ()=>{
    if(!isEditor){ requireEdit('submit this entry', ()=>{}); return; }
    const motorSel = $('#dhtMotor', main);
    if(!motorSel.value){ toast('Please select a motor.', true); return; }
    const motor = LS_get(KEYS.htMotors,[]).find(m=>m.id===motorSel.value);
    const rec = { id: uid(), date: $('#dhtDate',main).value, unit: motor?motor['UNIT NO']:'', equipment: motor?motor.EQUIPMENT:'' };
    $$('#dailyForm [data-key]', main).forEach(inp=>{ rec[inp.dataset.key]=inp.value; });
    await cloudAddRecord(KEYS.dailyHT, rec);
    toast('Daily checklist entry saved.');
    draw();
    $$('#dailyForm [data-key]', main).forEach(inp=>{ inp.value=''; });
  });
  $('#btnExportDaily', main).addEventListener('click', ()=>{
    const rows = LS_get(KEYS.dailyHT, []);
    if(!rows.length){ toast('No entries to export yet.', true); return; }
    const headers = ['Date','Unit','Motor', ...HT_DAILY_FIELDS.map(([,l])=>l)];
    const data = rows.map(r=>[r.date, r.unit, r.equipment, ...HT_DAILY_FIELDS.map(([k])=>r[k]||'')]);
    exportCSV('HT_Motor_Daily_Checklist_'+todayISO()+'.csv', headers, data);
  });
  draw();
}

/* ---------------- LT Daily Checklist — unit-wise cumulative remark, plus per-motor exception logging ---------------- */
function renderDailyChecklistLT(main){
  const dataObj = LS_get(KEYS.ltMotors, {});
  const units = Object.keys(dataObj);
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.checklist} LT Motor Daily Checklist</h2><div class="desc">LT motor population is very large — log one cumulative remark per unit daily, and only log individual motors when there's a specific exception/abnormality. You can also upload a scanned copy of the filled checklist.</div></div>
    </div>
    <div class="mode-toggle" id="dltMode">
      <button data-mode="unit">Unit-wise Daily Remark</button>
      <button data-mode="exception">Log Specific Motor Exception</button>
      <button data-mode="upload">Upload Scanned Copy</button>
    </div>
    <div style="height:16px;"></div>
    <div id="dltBody"></div>
    <div id="dltLogWrap">
    <div class="section-head">
      <h2 style="font-size:18px;">Logged Entries</h2>
      <button class="btn btn-teal btn-sm" id="btnExportDLT">${ICONS.download} Download as Excel/CSV</button>
    </div>
    <div id="dltLogHost"></div>
    </div>
  `;
  const btns = $$('#dltMode button', main);
  btns.forEach(b=>b.addEventListener('click', ()=>drawForm(b.dataset.mode)));

  function drawForm(mode){
    dailyLTMode = mode;
    btns.forEach(x=>x.classList.toggle('active', x.dataset.mode===mode));
    $('#dltLogWrap', main).style.display = mode==='upload' ? 'none' : '';
    const body = $('#dltBody', main);
    if(mode==='upload'){
      body.innerHTML = `<div class="form-card"><h3><span class="tagnum">UPLOAD</span> Scanned LT Motor Daily Checklist</h3>
        <p class="hint">Upload the filled &amp; signed daily checklist sheet (PDF or image, up to 20 MB). Multiple files allowed.</p>
        <div id="dltUploadZone"></div></div>`;
      renderUploadBlock($('#dltUploadZone', main), KEYS.dailyLTFiles, {multiple:true});
      return;
    }
    if(mode==='unit'){
      body.innerHTML = `
        <div class="form-card">
          <h3><span class="tagnum">FORM</span> Unit-wise Daily Remark</h3>
          <div class="grid-3">
            <div class="f-item"><label>Date</label><input class="field" type="date" id="dltDate" value="${todayISO()}"></div>
            <div class="f-item"><label>Unit / Area</label><select class="sel" id="dltUnit">${units.map(u=>`<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('')}</select></div>
            <div class="f-item"><label>Checked By</label><input class="field" id="dltCheckedBy"></div>
          </div>
          <div class="f-item" style="margin-top:10px;"><label>Cumulative Remarks for this Unit (all LT motors checked, general condition, any observations)</label>
            <textarea class="field" id="dltRemark" rows="3" placeholder="e.g. All LT motors in this unit checked — running normal, no abnormal sound/vibration/heating observed."></textarea>
          </div>
          <div style="margin-top:14px;"><button class="btn btn-amber" id="btnSubmitUnit">${ICONS.plus} Submit Unit Remark</button></div>
        </div>`;
      $('#btnSubmitUnit', main).addEventListener('click', async ()=>{
    if(!isEditor){ requireEdit('submit this entry', ()=>{}); return; }
        const rec = { id: uid(), type:'unit', date: $('#dltDate',main).value, unit: $('#dltUnit',main).value,
          motor:'', remark: $('#dltRemark',main).value, checkedBy: $('#dltCheckedBy',main).value };
        if(!rec.remark){ toast('Enter the cumulative remark before submitting.', true); return; }
        await cloudAddRecord(KEYS.dailyLT, rec);
        toast('Unit-wise remark logged.');
        drawLog();
        $('#dltRemark',main).value='';
      });
    } else {
      body.innerHTML = `
        <div class="form-card">
          <h3><span class="tagnum">FORM</span> Log Specific Motor Exception</h3>
          <div class="grid-3">
            <div class="f-item"><label>Date</label><input class="field" type="date" id="dltDate2" value="${todayISO()}"></div>
            <div class="f-item"><label>Unit / Area</label><select class="sel" id="dltUnit2">${units.map(u=>`<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('')}</select></div>
            <div class="f-item"><label>Motor</label><select class="sel" id="dltMotor2"></select></div>
          </div>
          <div class="grid-3" style="margin-top:10px;">
            <div class="f-item"><label>Bearing Temp — DE / NDE (°C)</label><input class="field" id="dltBrgTemp" placeholder="DE / NDE"></div>
            <div class="f-item"><label>Abnormal Sound / Vibration</label><select class="sel" id="dltSound"><option>No</option><option>Yes</option></select></div>
            <div class="f-item"><label>Checked By</label><input class="field" id="dltCheckedBy2"></div>
          </div>
          <div class="f-item" style="margin-top:10px;"><label>Exception / Observation Details</label><textarea class="field" id="dltRemark2" rows="3"></textarea></div>
          <div style="margin-top:14px;"><button class="btn btn-amber" id="btnSubmitExc">${ICONS.plus} Log Exception</button></div>
        </div>`;
      const unitSel2 = $('#dltUnit2', main), motorSel2 = $('#dltMotor2', main);
      function fillMotors(){
        const list = LS_get(KEYS.ltMotors,{})[unitSel2.value] || [];
        motorSel2.innerHTML = list.map(m=>`<option value="${m.id}">${escapeHtml(m['MOTOR NAME']||'')}</option>`).join('');
      }
      unitSel2.addEventListener('change', fillMotors); fillMotors();
      $('#btnSubmitExc', main).addEventListener('click', async ()=>{
    if(!isEditor){ requireEdit('log this exception', ()=>{}); return; }
        const motor = (LS_get(KEYS.ltMotors,{})[unitSel2.value]||[]).find(m=>m.id===motorSel2.value);
        const rec = { id: uid(), type:'exception', date: $('#dltDate2',main).value, unit: unitSel2.value,
          motor: motor?motor['MOTOR NAME']:'', brgTemp: $('#dltBrgTemp',main).value, sound: $('#dltSound',main).value,
          remark: $('#dltRemark2',main).value, checkedBy: $('#dltCheckedBy2',main).value };
        if(!rec.motor){ toast('Select a motor for the exception log.', true); return; }
        await cloudAddRecord(KEYS.dailyLT, rec);
        toast('Motor exception logged.');
        drawLog();
        $('#dltRemark2',main).value='';
      });
    }
  }

  function drawLog(){
    const rows = LS_get(KEYS.dailyLT, []).slice().reverse();
    const host = $('#dltLogHost', main);
    if(!rows.length){ host.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.checklist}<h4>No entries yet</h4></div></div>`; return; }
    host.innerHTML = `<div class="topscroll"><div class="topscroll-inner"></div></div>
    <div class="table-wrap compact"><table class="dgrid compact"><thead><tr>
      <th>Date</th><th>Type</th><th class="wrap">Unit</th><th class="wrap">Motor</th><th class="wrap">Bearing Temp</th>
      <th>Abnormal</th><th class="wrap">Remarks</th><th class="wrap">Checked By</th><th>Actions</th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr>
        <td>${escapeHtml(r.date)}</td><td>${r.type==='unit'?'Unit-wise':'Exception'}</td><td class="wrap">${escapeHtml(r.unit)}</td>
        <td class="wrap">${escapeHtml(r.motor||'— all —')}</td><td class="wrap">${escapeHtml(r.brgTemp||'')}</td><td>${escapeHtml(r.sound||'')}</td>
        <td class="wrap">${escapeHtml(r.remark)}</td><td class="wrap">${escapeHtml(r.checkedBy)}</td>
        <td><button class="btn btn-danger btn-sm" data-del="${r.id}" type="button">${ICONS.trash}</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
    $$('[data-del]', host).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('delete this daily checklist entry', ()=>{
        cloudDeleteRecord(KEYS.dailyLT, b.dataset.del);
        drawLog();
      });
    }));
    wireTopScroll(host);
  }
  $('#btnExportDLT', main).addEventListener('click', ()=>{
    const rows = LS_get(KEYS.dailyLT, []);
    if(!rows.length){ toast('No entries to export yet.', true); return; }
    exportCSV('LT_Motor_Daily_Checklist_'+todayISO()+'.csv',
      ['Date','Type','Unit','Motor','Bearing Temp','Abnormal Sound','Remarks','Checked By'],
      rows.map(r=>[r.date, r.type, r.unit, r.motor||'', r.brgTemp||'', r.sound||'', r.remark, r.checkedBy]));
  });
  drawForm(dailyLTMode);
  drawLog();
}

/* ============================================================
   HT MOTOR PRESERVATION RECORDS
   ============================================================ */
/* Reference list of HT motors under preservation — motor names only, taken in order from the
   department's "Testing and inspection record for preservation of HT motor" sheet dated 06/06/2022
   (41 motors). Spelling of a few handwritten/typed names tidied (Secondary Crusher, Ash Slurry, 4th). */
const PRES_MOTORS = [
  'Raw Water-4','Secondary Crusher St. 1st','FD Fan St. 1st','PA Fan St. 1st','ID Fan St. 1st',
  'Coal Mill St. 2nd','Coal Mill St. 3rd','CEP St. 2nd & 3rd','FD Fan St. 2nd','FD Fan St. 2nd',
  'ECW St. 3rd','Coal Mill St. 1st','PA Fan St. 2nd','PA Fan St. 1st','Secondary Crusher St. 2nd',
  'Coal Mill St. 1st','IAC, PAC - St. 3rd','ACW - St. 1st','Ash Slurry St. 1st','Ash Slurry St. 1st',
  'ASS St. 2nd','ASS St. 2nd','ASS St. 2nd','CT Pump Motor','Raw Water 123 Spare',
  'Make Up Pump Motor','CW Motor St. 1st','Conv. 21A/B Motor','CEP - St. 1st','ACW St. 1st',
  'ID Fan St. 2nd','BFP - St. 1st','ACW St. 1st','ID Fan St. 4th','ID Fan St. 3rd',
  'ACW St. 1st','CW St. 2nd','CW St. 3rd','MD BFP - St. 4th','CW St. 4th','TAC St. 2nd',
];

/* Columns of a filled preservation form, in the same order as the paper sheet. */
const PRES_COLS = [
  ['date','Date'],['equipment','Motor Name / Driven Equipment'],['location','Location'],['mfr','Mfr / Sr No'],
  ['rating','KW / Voltage'],['ir','IR Value'],['pi','PI Value'],['rev','No. of Revolutions'],
  ['rotor','Rotor Shaft Position'],['pack','Packing / Covering'],['temp','Temp (°C)'],['stator','Stator Frame'],
  ['paint','Exterior Paint Work'],['shIr','Space Heater IR'],['sleeper','Motor on Wooden Sleeper Stand'],
  ['clean','External Cleaning'],['oil','Oil Status / Level / Top-up'],['remark','Remark'],
];
const PRES_TITLE = 'Testing and Inspection Record for Preservation of HT Motor';

function presSorted(rows){ return rows.slice().sort((a,b)=> String(a.date||'').localeCompare(String(b.date||''))); }

function downloadPresExcel(rows, filename){
  const data = presSorted(rows).map((r,i)=>[i+1, ...PRES_COLS.map(([k])=>r[k]||'')]);
  const headers = ['Sl No', ...PRES_COLS.map(([,l])=>l)];
  if(typeof XLSX === 'undefined'){
    toast('Excel library could not load — downloading as CSV (opens in Excel) instead.', true);
    exportCSV(filename.replace(/\.xlsx$/,'.csv'), headers, data); return;
  }
  const ws = XLSX.utils.aoa_to_sheet([['Electrical Maintenance Department'],[PRES_TITLE],[],headers,...data]);
  ws['!cols'] = headers.map((h,i)=>({ wch: i===0?6 : (PRES_COLS[i-1][0]==='equipment'||PRES_COLS[i-1][0]==='remark'||PRES_COLS[i-1][0]==='location') ? 28 : 16 }));
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:headers.length-1}},{s:{r:1,c:0},e:{r:1,c:headers.length-1}}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Preservation');
  XLSX.writeFile(wb, filename);
}

// PDF standard fonts can't draw symbols like Ω (shows as garbage), so spell it out; anything else unsupported becomes "?".
function pdfSafe(v){
  return String(v==null?'':v).replace(/[\u03A9\u2126]/g,'ohm').replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018-\u201D\u2022\u2026\n]/g,'?');
}
function downloadPresPdf(rows, filename, single){
  const lib = window.jspdf;
  if(!lib || !lib.jsPDF){ toast('PDF library could not load — check your internet connection and try again.', true); return; }
  const doc = new lib.jsPDF({ orientation: single ? 'portrait' : 'landscape', unit:'mm', format:'a4' });
  if(typeof doc.autoTable !== 'function'){ toast('PDF table library could not load — check your internet connection and try again.', true); return; }
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.text('Electrical Maintenance Department', W/2, 12, {align:'center'});
  doc.setFontSize(10.5); doc.text(PRES_TITLE, W/2, 18, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text('Generated: '+todayISO(), W-8, 23, {align:'right'});
  const foot = ()=>{ const n = doc.internal.getNumberOfPages(); for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFontSize(7); doc.text('Page '+i+' of '+n, W/2, doc.internal.pageSize.getHeight()-5, {align:'center'}); } };
  if(single){
    const r = rows[0];
    doc.autoTable({ startY:27, head:[['Field','Value']], body: PRES_COLS.map(([k,l])=>[l, pdfSafe(r[k])]),
      styles:{fontSize:9,cellPadding:2}, headStyles:{fillColor:[15,34,64]}, columnStyles:{0:{cellWidth:70,fontStyle:'bold'}}, margin:{left:12,right:12} });
    const y = doc.lastAutoTable.finalY + 22;
    doc.setFontSize(9); doc.text('Checked by: ____________________', 12, y); doc.text('Signature: ____________________', W-12, y, {align:'right'});
  } else {
    doc.autoTable({ startY:26, head:[['Sl', ...PRES_COLS.map(([,l])=>l)]],
      body: presSorted(rows).map((r,i)=>[i+1, ...PRES_COLS.map(([k])=>pdfSafe(r[k]))]),
      styles:{fontSize:6,cellPadding:1,overflow:'linebreak',valign:'middle'}, headStyles:{fillColor:[15,34,64],fontSize:5.8,halign:'center'},
      margin:{left:5,right:5}, tableWidth:'auto' });
  }
  foot();
  doc.save(filename);
}

let presMode = 'upload';   // remembered across live re-renders (saving a record triggers a refresh)
function renderPreservation(main){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.shield} HT Motor Preservation Records</h2><div class="desc">Testing & inspection log for HT motors held in preservation (spare / standby). Upload scanned reports, or log readings directly using the form.</div></div>
    </div>
    <div class="mode-toggle" id="presMode">
      <button data-mode="upload">Upload Scanned Report</button>
      <button data-mode="form">Fill Preservation Form</button>
      <button data-mode="reference">Reference — Motors Under Preservation</button>
    </div>
    <div style="height:16px;"></div>
    <div id="presBody"></div>
  `;
  const modeBtns = $$('#presMode button', main);
  modeBtns.forEach(b=>b.addEventListener('click', ()=>{
    drawMode(b.dataset.mode);
  }));

  function drawMode(mode){
    presMode = mode;
    modeBtns.forEach(x=>x.classList.toggle('active', x.dataset.mode===mode));
    const body = $('#presBody', main);
    if(mode==='upload'){
      body.innerHTML = `<div class="form-card"><h3><span class="tagnum">UPLOAD</span> Scanned Preservation Report</h3>
        <p class="hint">Upload a scanned/photographed copy of a filled preservation testing sheet (PDF or image, up to 20 MB).</p>
        <div id="presUploadZone"></div></div>`;
      renderUploadBlock($('#presUploadZone', main), KEYS.preservationFiles, {multiple:true});
      return;
    }
    if(mode==='reference'){
      body.innerHTML = `<div class="section-head"><h2 style="font-size:18px;">Motors Under Preservation <span class="fmeta">(${PRES_MOTORS.length} motors)</span></h2></div>
        <div class="table-wrap"><table class="dgrid"><thead><tr><th style="width:70px;">Sl No</th><th class="wrap">Motor Name</th></tr></thead><tbody>
        ${PRES_MOTORS.map((n,i)=>`<tr><td>${i+1}</td><td class="wrap">${escapeHtml(n)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint" style="margin-top:10px;">Reference list of HT motors under preservation, as per the department's preservation sheet (06/06/2022). To log a test reading against any of these motors, switch to "Fill Preservation Form" and pick the motor from the list.</p>`;
      return;
    }
    // form mode
    body.innerHTML = `
      <div class="form-card">
        <h3><span class="tagnum">FORM</span> Testing & Inspection Record for Preservation of HT Motor</h3>
        <div class="grid-2">
          <div class="f-item" style="grid-column:1/-1;"><label>Motor (from preservation reference list)</label>
            <select class="sel" id="pf_motor"><option value="">— Select motor (optional, fills Motor Driven Equipment) —</option>
              ${PRES_MOTORS.map((n,i)=>`<option value="${i}">${i+1}. ${escapeHtml(n)}</option>`).join('')}</select></div>
          <div class="f-item"><label>Location</label><input class="field" id="pf_location"></div>
          <div class="f-item"><label>Motor Driven Equipment</label><input class="field" id="pf_equipment"></div>
          <div class="f-item"><label>Manufacturer / Sr No</label><input class="field" id="pf_mfr"></div>
          <div class="f-item"><label>KW / Voltage Rating</label><input class="field" id="pf_rating"></div>
        </div>
        <hr style="margin:16px 0;border:none;border-top:1px solid var(--paper-dim);">
        <div class="grid-3">
          <div class="f-item"><label>Date</label><input class="field" type="date" id="pf_date" value="${todayISO()}"></div>
          <div class="f-item"><label>IR Value (@ ___ kV)</label><input class="field" id="pf_ir"></div>
          <div class="f-item"><label>PI Value</label><input class="field" id="pf_pi"></div>
          <div class="f-item"><label>No. of Revolutions</label><input class="field" id="pf_rev"></div>
          <div class="f-item"><label>Rotor Shaft Position</label><input class="field" id="pf_rotor"></div>
          <div class="f-item"><label>Condition of Packing/Covering</label><input class="field" id="pf_pack"></div>
          <div class="f-item"><label>Temperature (°C)</label><input class="field" id="pf_temp"></div>
          <div class="f-item"><label>Condition of Stator Frame</label><input class="field" id="pf_stator"></div>
          <div class="f-item"><label>Exterior Paint Work</label><input class="field" id="pf_paint"></div>
          <div class="f-item"><label>Space Heater IR Value (@ ___ V)</label><input class="field" id="pf_sh_ir"></div>
          <div class="f-item"><label>Motor on Wooden Sleeper Stand</label><input class="field" id="pf_sleeper"></div>
          <div class="f-item"><label>External Cleaning</label><input class="field" id="pf_clean"></div>
          <div class="f-item"><label>Oil Status / Level / Top-up</label><input class="field" id="pf_oil"></div>
        </div>
        <div class="f-item" style="margin-top:10px;"><label>Remark, if any</label><textarea class="field" id="pf_remark" rows="2"></textarea></div>
        <div style="margin-top:14px;"><button class="btn btn-amber" id="btnSubmitPres">${ICONS.plus} Add Reading to Log</button></div>
      </div>
      <div class="section-head"><h2 style="font-size:18px;">Preservation Log</h2></div>
      <div id="presLogHost"></div>
    `;
    drawLog();
    $('#pf_motor', main).addEventListener('change', e=>{ if(e.target.value!=='') $('#pf_equipment', main).value = PRES_MOTORS[+e.target.value]; });
    $('#btnSubmitPres', main).addEventListener('click', async ()=>{
    if(!isEditor){ requireEdit('save this record', ()=>{}); return; }
      const g = id => $('#'+id, main).value;
      if(!g('pf_location') && !g('pf_equipment')){ toast('Enter at least the location or motor driven equipment.', true); return; }
      const rec = {
        id: uid(), location:g('pf_location'), equipment:g('pf_equipment'), mfr:g('pf_mfr'), rating:g('pf_rating'),
        date:g('pf_date'), ir:g('pf_ir'), pi:g('pf_pi'), rev:g('pf_rev'), rotor:g('pf_rotor'), pack:g('pf_pack'),
        temp:g('pf_temp'), stator:g('pf_stator'), paint:g('pf_paint'), shIr:g('pf_sh_ir'), sleeper:g('pf_sleeper'),
        clean:g('pf_clean'), oil:g('pf_oil'), remark:g('pf_remark'),
      };
      await cloudAddRecord(KEYS.preservationForms, rec);
      toast('Preservation reading logged.');
      drawLog();
    });
  }

  function drawLog(){
    const rows = LS_get(KEYS.preservationForms,[]).slice().reverse();
    const host = $('#presLogHost', main);
    if(!host) return;
    if(!rows.length){ host.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.shield}<h4>No readings logged yet</h4></div></div>`; return; }
    host.innerHTML = `<div class="section-head" style="margin-top:0;">
        <span class="fmeta">${rows.length} filled form${rows.length===1?'':'s'} logged</span>
        <span style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-teal btn-sm" id="btnPresXlsx" type="button">${ICONS.download} Download Excel (.xlsx)</button>
          <button class="btn btn-teal btn-sm" id="btnPresPdf" type="button">${ICONS.download} Download PDF</button>
        </span></div>
      <div class="topscroll"><div class="topscroll-inner"></div></div>
      <div class="table-wrap compact"><table class="dgrid compact"><thead><tr>
        ${PRES_COLS.map(([,l])=>`<th class="wrap">${escapeHtml(l)}</th>`).join('')}<th>Actions</th>
      </tr></thead><tbody>
        ${rows.map(r=>`<tr>
          ${PRES_COLS.map(([k])=>`<td class="wrap">${escapeHtml(r[k]||'')}</td>`).join('')}
          <td class="row-actions" style="white-space:nowrap;">
            <button class="btn btn-ghost btn-sm" data-pdf="${r.id}" type="button" title="Download this form as PDF">${ICONS.download} PDF</button>
            <button class="btn btn-danger btn-sm" data-del="${r.id}" type="button">${ICONS.trash}</button>
          </td>
        </tr>`).join('')}
      </tbody></table></div>`;
    $$('[data-del]', host).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('delete this preservation log entry', ()=>{
        if(!confirm('Delete this preservation log entry?')) return;
        cloudDeleteRecord(KEYS.preservationForms, b.dataset.del);
        drawLog();
      });
    }));
    $$('[data-pdf]', host).forEach(b=>b.addEventListener('click', ()=>{
      const r = LS_get(KEYS.preservationForms,[]).find(x=>x.id===b.dataset.pdf); if(!r) return;
      const nm = String(r.equipment||'motor').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
      downloadPresPdf([r], 'Preservation_'+nm+'_'+(r.date||todayISO())+'.pdf', true);
    }));
    $('#btnPresXlsx', host).addEventListener('click', ()=> downloadPresExcel(LS_get(KEYS.preservationForms,[]), 'HT_Motor_Preservation_Records_'+todayISO()+'.xlsx'));
    $('#btnPresPdf', host).addEventListener('click', ()=> downloadPresPdf(LS_get(KEYS.preservationForms,[]), 'HT_Motor_Preservation_Records_'+todayISO()+'.pdf', false));
    wireTopScroll(host);
  }

  drawMode(presMode);
}

/* ============================================================
   OH RECORDS — HT (detailed) & LT (checklist)
   ============================================================ */
const HT_OH_INSPECTION_ITEMS = [
  ['STATOR','Stator Core: inspection of core stamping for damage, looseness, overheating, absence of foreign material. Core pressing ring/fingers mechanical integrity.'],
  ['STATOR','Stator Winding: cleaning, physical condition inspection, varnishing.'],
  ['STATOR','Stator Overhang: inspection of overhang winding for damaged insulation, overheating, conductor looseness. Check winding at slot exit and brazing joint of lead.'],
  ['STATOR','Stator Cooler: replacement of cooler gaskets, terminal box cover gaskets, cleaning. Hydraulic test.'],
  ['STATOR','Wedges Checking: wedge tightness checking and replacement of damaged wedge (record no. loose / no. replaced).'],
  ['ROTOR','Shaft Surface: physical condition, check for pitting.'],
  ['ROTOR','Rotor Winding: inspection of rotor core for damaged stamping, overheating, looseness of rotor bar, crack in rotor bar.'],
  ['ROTOR','Short Circuiting Rings: inspection of shorting ring and joint between rotor bar and shorting ring visually and by DP test.'],
  ['ROTOR','Rotor Insulation: physical condition, cleanliness.'],
  ['ROTOR','Physical inspection of shaft: coupling seating area, bearing seating area, exit point of shaft from rotor core.'],
  ['ROTOR','Cooling Fan: inspection for defective fins, welding points and rivets condition.'],
  ['BEARING','Checking of bearing clearances (journal bearing) / interference (antifriction bearing).'],
  ['BEARING','Replacement of bearing if required (antifriction: eddy current heater; journal: matching with shaft & saddle).'],
  ['BEARING','Measurement of pedestal insulation (wherever applicable).'],
  ['BEARING','Vertical motor thrust pad DP and adjustment.'],
  ['BEARING','DPT, UT of journal bearing and DPT of coupling.'],
  ['BEARING','Inspection of journal bearing for defective babbitt, marks on bearing seating surface.'],
  ['TERMINAL BOX','Checking gasket condition, moisture/dust ingress, tightness of terminal stud with required torque (terminal box & winding lead side), stud/cable lug contact, heating marks on elastimold termination, cable load not on gland, no projected metal parts left inside.'],
];
const HT_OH_RECOMMISSION_ITEMS = [
  'Tan-delta of HT cables (6.6 kV & 11 kV) for critical drives (ID, FD, PA, CW, MDBFP) done',
  'Rotor Assembly Freeness',
  'Bearing Lubrication',
  'Earthing Connections and Cable Connections',
  'Motor Cooling Fan Fitted, Check DOR',
  'CW Flow to Cooler Banks',
  'IR Value Checked and Recorded',
  'General Cleanliness Around Equipment',
  'Painting',
];

function miniTableInputs(rows, cols, prefix){
  return `<table class="log-table-mini"><thead><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((rowLabel,ri)=>`<tr>
      <td><strong>${escapeHtml(rowLabel)}</strong></td>
      ${cols.slice(1).map((c,ci)=>`<td><input data-mini="${prefix}_${ri}_${ci}"></td>`).join('')}
    </tr>`).join('')}</tbody></table>`;
}

function renderOHHT(main){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.wrench} HT Motor OH Checklist</h2><div class="desc">Overhaul inspection, electrical testing, tan-delta, recommissioning and trial-run record for HT motors.</div></div>
    </div>
    <div class="mode-toggle" id="ohhtMode">
      <button class="active" data-mode="upload">Upload Scanned Report</button>
      <button data-mode="form">Fill OH Checklist Form</button>
    </div>
    <div style="height:16px;"></div>
    <div id="ohhtBody"></div>
  `;
  const btns = $$('#ohhtMode button', main);
  btns.forEach(b=>b.addEventListener('click', ()=>{ btns.forEach(x=>x.classList.remove('active')); b.classList.add('active'); draw(b.dataset.mode); }));

  function draw(mode){
    const body = $('#ohhtBody', main);
    if(mode==='upload'){
      body.innerHTML = `<div class="form-card"><h3><span class="tagnum">UPLOAD</span> Scanned HT Motor OH Report</h3>
        <p class="hint">Upload the completed, signed OH checklist (PDF or image, up to 20 MB).</p>
        <div id="ohhtUploadZone"></div></div>`;
      renderUploadBlock($('#ohhtUploadZone', main), KEYS.ohHTFiles, {multiple:true, byUnit:true});
      return;
    }
    body.innerHTML = `
      <div class="form-card">
        <h3><span class="tagnum">1</span> Motor Details</h3>
        <div class="grid-4">
          ${fieldInputHtml('date','Date','date', todayISO())}
          <div class="f-item"><label>Drive Name</label><input class="field" id="oh_drive"></div>
          <div class="f-item"><label>Unit <span style="color:var(--danger,#c0392b);">*</span></label><select class="sel" id="oh_unit">${unitOptionsHtml('')}</select></div>
          <div class="f-item"><label>Location</label><input class="field" id="oh_loc"></div>
          <div class="f-item"><label>KW</label><input class="field" id="oh_kw"></div>
          <div class="f-item"><label>Voltage</label><input class="field" id="oh_volt"></div>
          <div class="f-item"><label>RPM</label><input class="field" id="oh_rpm"></div>
          <div class="f-item"><label>Current</label><input class="field" id="oh_current"></div>
          <div class="f-item"><label>Poles</label><input class="field" id="oh_poles"></div>
          <div class="f-item"><label>Frame</label><input class="field" id="oh_frame"></div>
          <div class="f-item"><label>DE Brg</label><input class="field" id="oh_debrg"></div>
          <div class="f-item"><label>NDE Brg</label><input class="field" id="oh_ndebrg"></div>
          <div class="f-item"><label>SL No</label><input class="field" id="oh_slno"></div>
          <div class="f-item"><label>Make</label><input class="field" id="oh_make"></div>
        </div>
      </div>

      <div class="form-card">
        <h3><span class="tagnum">2</span> Inspection Checklist</h3>
        <p class="hint">Stator, rotor, bearing and terminal box inspection — record Observation and Action for each item.</p>
        ${HT_OH_INSPECTION_ITEMS.map(([grp,desc],i)=>`
          <div class="checklist-item-row">
            <div class="idx">${i+1}</div>
            <div class="desc"><span class="group-label">${escapeHtml(grp)}</span>${escapeHtml(desc)}</div>
            <div>
              <input class="field" style="margin-bottom:6px;" placeholder="Observation" data-insp="${i}_obs">
              <input class="field" placeholder="Action" data-insp="${i}_act">
            </div>
          </div>
        `).join('')}
      </div>

      <div class="form-card">
        <h3><span class="tagnum">3</span> Electrical Testing</h3>
        <div class="grid-3">
          <div class="f-item"><label>IR Value R-E (___ V Megger)</label><input class="field" id="oh_ir_re"></div>
          <div class="f-item"><label>IR Value Y-E</label><input class="field" id="oh_ir_ye"></div>
          <div class="f-item"><label>IR Value B-E</label><input class="field" id="oh_ir_be"></div>
          <div class="f-item"><label>PI Value — IR@60s</label><input class="field" id="oh_pi60"></div>
          <div class="f-item"><label>PI Value — IR@600s</label><input class="field" id="oh_pi600"></div>
          <div class="f-item"><label>Winding Resistance R-Y</label><input class="field" id="oh_wr_ry"></div>
          <div class="f-item"><label>Winding Resistance Y-B</label><input class="field" id="oh_wr_yb"></div>
          <div class="f-item"><label>Winding Resistance B-R</label><input class="field" id="oh_wr_br"></div>
          <div class="f-item"><label>Winding Inductance R-Y</label><input class="field" id="oh_wi_ry"></div>
          <div class="f-item"><label>Winding Inductance Y-B</label><input class="field" id="oh_wi_yb"></div>
          <div class="f-item"><label>Winding Inductance B-R</label><input class="field" id="oh_wi_br"></div>
          <div class="f-item"><label>RTD Resistance R / Y / B</label><input class="field" id="oh_rtd_ryb" placeholder="R / Y / B"></div>
          <div class="f-item"><label>RTD Resistance DE Brg / NDE Brg</label><input class="field" id="oh_rtd_brg" placeholder="DE / NDE"></div>
          <div class="f-item"><label>Space Heater Megger (Phase to Earth)</label><input class="field" id="oh_sh_megger"></div>
          <div class="f-item"><label>Space Heater Resistance (Phase to Phase)</label><input class="field" id="oh_sh_res"></div>
        </div>
      </div>

      <div class="form-card">
        <h3><span class="tagnum">4</span> Tan Delta Test Results</h3>
        ${miniTableInputs(['1','2','3','4','5'], ['Test No.','Test Voltage U(kV)','Frequency (Hz)','Leakage Current Im (A)','Capacitance Cp','Tan δ (%)','Loss Watt P(W)'], 'td')}
      </div>

      <div class="form-card">
        <h3><span class="tagnum">5</span> Recommissioning Checks</h3>
        ${HT_OH_RECOMMISSION_ITEMS.map((label,i)=>`
          <div class="checklist-item-row" style="grid-template-columns:28px 1fr 260px;">
            <div class="idx">${i+1}</div><div class="desc">${escapeHtml(label)}</div>
            <input class="field" placeholder="Remarks" data-recom="${i}">
          </div>`).join('')}
        <div class="grid-2" style="margin-top:12px;">
          <div class="f-item"><label>Alignment Reading — Axial</label><input class="field" id="oh_align_ax"></div>
          <div class="f-item"><label>Alignment Reading — Radial</label><input class="field" id="oh_align_rad"></div>
          <div class="f-item"><label>Air Gap Readings</label><input class="field" id="oh_airgap"></div>
        </div>
      </div>

      <div class="form-card">
        <h3><span class="tagnum">6</span> Trial Run</h3>
        <div class="grid-2">
          <div>
            <p class="hint" style="margin-bottom:8px;"><strong>De-coupled (No Load)</strong></p>
            <div class="f-item"><label>Current R / Y / B (A)</label><input class="field" id="oh_dc_current" placeholder="R / Y / B"></div>
            <div class="f-item"><label>Vibration DE / NDE</label><input class="field" id="oh_dc_vib" placeholder="DE / NDE"></div>
            <div class="f-item"><label>Winding Temp R / Y / B</label><input class="field" id="oh_dc_wtemp" placeholder="R / Y / B"></div>
            <div class="f-item"><label>Bearing Temp DE / NDE</label><input class="field" id="oh_dc_btemp" placeholder="DE / NDE"></div>
          </div>
          <div>
            <p class="hint" style="margin-bottom:8px;"><strong>Coupled (Load)</strong></p>
            <div class="f-item"><label>Current R / Y / B (A)</label><input class="field" id="oh_c_current" placeholder="R / Y / B"></div>
            <div class="f-item"><label>Vibration DE / NDE</label><input class="field" id="oh_c_vib" placeholder="DE / NDE"></div>
            <div class="f-item"><label>Winding Temp R / Y / B</label><input class="field" id="oh_c_wtemp" placeholder="R / Y / B"></div>
            <div class="f-item"><label>Bearing Temp DE / NDE</label><input class="field" id="oh_c_btemp" placeholder="DE / NDE"></div>
          </div>
        </div>
        <div class="f-item" style="margin-top:10px;"><label>Any Other Observations</label><textarea class="field" id="oh_other" rows="3"></textarea></div>
      </div>

      <div style="margin-bottom:24px;"><button class="btn btn-amber" id="btnSubmitOHHT">${ICONS.plus} Save OH Record</button></div>
      <div class="section-head"><h2 style="font-size:18px;">OH Records Logged</h2></div>
      <div id="ohhtLogHost"></div>
    `;
    drawLog();
    $('#btnSubmitOHHT', main).addEventListener('click', async ()=>{
    if(!isEditor){ requireEdit('save this record', ()=>{}); return; }
      const g = id => (main.querySelector('#'+id)||{}).value || '';
      if(!g('oh_drive')){ toast('Enter the drive name before saving.', true); return; }
      if(!g('oh_unit')){ toast('Select the unit (Unit 1 – Unit 6) for this record.', true); return; }
      const rec = { id: uid(), unit:g('oh_unit'), date:(main.querySelector('[data-key="date"]')||{}).value || todayISO(), drive:g('oh_drive'), location:g('oh_loc'), kw:g('oh_kw'), voltage:g('oh_volt'),
        rpm:g('oh_rpm'), current:g('oh_current'), poles:g('oh_poles'), frame:g('oh_frame'), debrg:g('oh_debrg'), ndebrg:g('oh_ndebrg'),
        slno:g('oh_slno'), make:g('oh_make'), other:g('oh_other'),
        electrical:{ irre:g('oh_ir_re'), irye:g('oh_ir_ye'), irbe:g('oh_ir_be'), pi60:g('oh_pi60'), pi600:g('oh_pi600'),
          wrry:g('oh_wr_ry'), wryb:g('oh_wr_yb'), wrbr:g('oh_wr_br'), wiry:g('oh_wi_ry'), wiyb:g('oh_wi_yb'), wibr:g('oh_wi_br'),
          rtdryb:g('oh_rtd_ryb'), rtdbrg:g('oh_rtd_brg'), shmegger:g('oh_sh_megger'), shres:g('oh_sh_res') },
        align:{ axial:g('oh_align_ax'), radial:g('oh_align_rad'), airgap:g('oh_airgap') },
        trial:{ dcCurrent:g('oh_dc_current'), dcVib:g('oh_dc_vib'), dcWtemp:g('oh_dc_wtemp'), dcBtemp:g('oh_dc_btemp'),
          cCurrent:g('oh_c_current'), cVib:g('oh_c_vib'), cWtemp:g('oh_c_wtemp'), cBtemp:g('oh_c_btemp') },
        inspection: HT_OH_INSPECTION_ITEMS.map((it,i)=>({group:it[0], item:it[1],
          obs:(main.querySelector(`[data-insp="${i}_obs"]`)||{}).value||'', act:(main.querySelector(`[data-insp="${i}_act"]`)||{}).value||''})),
        recommission: HT_OH_RECOMMISSION_ITEMS.map((label,i)=>({label, remark:(main.querySelector(`[data-recom="${i}"]`)||{}).value||''})),
        tanDelta: [0,1,2,3,4].map(ri=>[1,2,3,4,5,6].map(ci=>(main.querySelector(`[data-mini="td_${ri}_${ci-1}"]`)||{}).value||'')),
      };
      await cloudAddRecord(KEYS.ohHTForms, rec);
      toast('HT motor OH record saved.');
      draw('form');
    });
  }

  function drawLog(){
    const allRows = LS_get(KEYS.ohHTForms,[]).slice().reverse();
    const rows = allRows.filter(r=>unitMatches(r, OH_LOG_FILTER.ht));
    const host = $('#ohhtLogHost', main);
    if(!host) return;
    if(!allRows.length){ host.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.wrench}<h4>No OH records yet</h4></div></div>`; return; }
    host.innerHTML = `<div class="unit-bar"><label>Filter by unit</label>
      <select class="sel" id="ohhtFlt">${unitOptionsHtml(OH_LOG_FILTER.ht, {all:true, unassigned:allRows.some(r=>!r.unit)})}</select>
      <span class="fmeta">${rows.length} of ${allRows.length} shown</span></div>
    ${rows.length ? '' : '<p class="hint">No OH records for this unit.</p>'}
    <div class="table-wrap"><table class="dgrid"><thead><tr>
      <th>Date</th><th>Unit</th><th class="wrap">Drive</th><th class="wrap">Location</th><th>KW</th><th>Make</th><th>SL No</th><th>Actions</th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr>
        <td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.unit||'—')}</td><td class="wrap">${escapeHtml(r.drive)}</td><td class="wrap">${escapeHtml(r.location)}</td>
        <td>${escapeHtml(r.kw)}</td><td>${escapeHtml(r.make)}</td><td>${escapeHtml(r.slno)}</td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" data-view="${r.id}" type="button">${ICONS.eye} View</button>
          <button class="btn btn-danger btn-sm" data-del="${r.id}" type="button">${ICONS.trash}</button>
        </td>
      </tr>`).join('')}
    </tbody></table></div>`;
    $$('[data-del]', host).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('delete this OH record', ()=>{
        if(!confirm('Delete this OH record?')) return;
        cloudDeleteRecord(KEYS.ohHTForms, b.dataset.del);
        drawLog();
      });
    }));
    $$('[data-view]', host).forEach(b=>b.addEventListener('click', ()=> viewOHHTReport(b.dataset.view)));
    $('#ohhtFlt', host).addEventListener('change', e=>{ OH_LOG_FILTER.ht = e.target.value; drawLog(); });
  }
  draw('upload');
}

function viewOHHTReport(id){
  const r = LS_get(KEYS.ohHTForms,[]).find(x=>x.id===id);
  if(!r) return;
  const html = `
    <div class="report-view">
      <h4>HT Motor OH Report — ${escapeHtml(r.drive)}</h4>
      <table><tr><th>Date</th><td>${escapeHtml(r.date)}</td><th>Unit</th><td>${escapeHtml(r.unit||'—')}</td></tr>
      <tr><th>Location</th><td>${escapeHtml(r.location)}</td><th></th><td></td></tr>
      <tr><th>KW</th><td>${escapeHtml(r.kw)}</td><th>Voltage</th><td>${escapeHtml(r.voltage)}</td></tr>
      <tr><th>RPM</th><td>${escapeHtml(r.rpm)}</td><th>Current</th><td>${escapeHtml(r.current)}</td></tr>
      <tr><th>DE Brg</th><td>${escapeHtml(r.debrg)}</td><th>NDE Brg</th><td>${escapeHtml(r.ndebrg)}</td></tr>
      <tr><th>Make</th><td>${escapeHtml(r.make)}</td><th>SL No</th><td>${escapeHtml(r.slno)}</td></tr></table>
      <h4>Inspection Checklist</h4>
      <table><tr><th>Group</th><th>Item</th><th>Observation</th><th>Action</th></tr>
      ${r.inspection.map(x=>`<tr><td>${escapeHtml(x.group)}</td><td>${escapeHtml(x.item)}</td><td>${escapeHtml(x.obs)}</td><td>${escapeHtml(x.act)}</td></tr>`).join('')}</table>
      <h4>Electrical Testing</h4>
      <table>${Object.entries(r.electrical).map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
      <h4>Recommissioning Checks</h4>
      <table><tr><th>Item</th><th>Remark</th></tr>${r.recommission.map(x=>`<tr><td>${escapeHtml(x.label)}</td><td>${escapeHtml(x.remark)}</td></tr>`).join('')}</table>
      <h4>Trial Run</h4>
      <table><tr><th>De-coupled Current</th><td>${escapeHtml(r.trial.dcCurrent)}</td><th>Coupled Current</th><td>${escapeHtml(r.trial.cCurrent)}</td></tr>
      <tr><th>De-coupled Vibration</th><td>${escapeHtml(r.trial.dcVib)}</td><th>Coupled Vibration</th><td>${escapeHtml(r.trial.cVib)}</td></tr></table>
      <h4>Other Observations</h4><p>${escapeHtml(r.other || '—')}</p>
    </div>`;
  openModal({ title:'OH Record — '+r.drive, wide:true, submitLabel:'Print', bodyHtml:html,
    onSubmit:()=>{ const w=window.open('','_blank'); w.document.write('<html><head><title>OH Report</title></head><body>'+html+'</body></html>'); w.print(); return false; } });
}

function renderOHLT(main){
  const LT_OH_ITEMS = [
    'Name of the Motor','PTW No. and Date','Bearings used (DE/NDE) — Replaced (Yes/No)',
    'Clean & Inspect Fan, Fan Cover, DE & NDE End Covers, Bearing Housing, TB Done',
    'Clean & Check Greasing Capillary for Choking. Old Grease Removed. Inspect Grease Nipples',
    'Condition of Stator & Rotor Core', 'Varnishing Done',
    'For DC Motor — Checked & Cleaned Commutator, Brush Holders & Brushes. Replaced if Defective',
    'Tightness of Power Cable & Healthiness of Lugs Checked', 'Motor Earthing Done (Double Earthing)',
    'IR Value of Stator Wdg w.r.t Earth (500V IR Tester)', 'Winding Resistance', 'No Load / Decoupled Current (R/Y/B)',
    'Vibration Data DE/NDE OK?', 'Any Other Observation',
  ];
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.wrench} LT Motor OH Checklist</h2><div class="desc">Overhaul checklist for LT motors.</div></div>
    </div>
    <div class="mode-toggle" id="ohltMode">
      <button class="active" data-mode="upload">Upload Scanned Report</button>
      <button data-mode="form">Fill OH Checklist Form</button>
    </div>
    <div style="height:16px;"></div>
    <div id="ohltBody"></div>
  `;
  const btns = $$('#ohltMode button', main);
  btns.forEach(b=>b.addEventListener('click', ()=>{ btns.forEach(x=>x.classList.remove('active')); b.classList.add('active'); draw(b.dataset.mode); }));

  function draw(mode){
    const body = $('#ohltBody', main);
    if(mode==='upload'){
      body.innerHTML = `<div class="form-card"><h3><span class="tagnum">UPLOAD</span> Scanned LT Motor OH Report</h3>
        <div id="ohltUploadZone"></div></div>`;
      renderUploadBlock($('#ohltUploadZone', main), KEYS.ohLTFiles, {multiple:true, byUnit:true});
      return;
    }
    body.innerHTML = `
      <div class="form-card">
        <h3><span class="tagnum">FORM</span> Check List for LT Motor Overhauling</h3>
        <div class="grid-3" style="margin-bottom:14px;">
          ${fieldInputHtml('date','Date','date', todayISO())}
          <div class="f-item"><label>Unit <span style="color:var(--danger,#c0392b);">*</span></label><select class="sel" id="ohlt_unit">${unitOptionsHtml('')}</select></div>
          <div class="f-item"><label>Signature of Area Engineer</label><input class="field" id="ohlt_eng"></div>
        </div>
        ${LT_OH_ITEMS.map((label,i)=>`
          <div class="checklist-item-row" style="grid-template-columns:28px 1fr 260px;">
            <div class="idx">${i+1}</div><div class="desc">${escapeHtml(label)}</div>
            <input class="field" placeholder="Remarks" data-ltoh="${i}">
          </div>`).join('')}
        <div class="f-item" style="margin-top:12px;"><label>Signature of Agency Supervisor</label><input class="field" id="ohlt_sup"></div>
        <div style="margin-top:14px;"><button class="btn btn-amber" id="btnSubmitOHLT">${ICONS.plus} Save OH Record</button></div>
      </div>
      <div class="section-head"><h2 style="font-size:18px;">OH Records Logged</h2></div>
      <div id="ohltLogHost"></div>
    `;
    drawLog();
    $('#btnSubmitOHLT', main).addEventListener('click', async ()=>{
    if(!isEditor){ requireEdit('save this record', ()=>{}); return; }
      if(!main.querySelector('#ohlt_unit').value){ toast('Select the unit (Unit 1 – Unit 6) for this record.', true); return; }
      const rec = { id: uid(), unit: main.querySelector('#ohlt_unit').value, date: (main.querySelector('[data-key="date"]')||{}).value || todayISO(),
        eng: main.querySelector('#ohlt_eng').value, sup: main.querySelector('#ohlt_sup').value,
        items: LT_OH_ITEMS.map((label,i)=>({label, remark:(main.querySelector(`[data-ltoh="${i}"]`)||{}).value||''})) };
      await cloudAddRecord(KEYS.ohLTForms, rec);
      toast('LT motor OH record saved.');
      draw('form');
    });
  }
  function drawLog(){
    const allRows = LS_get(KEYS.ohLTForms,[]).slice().reverse();
    const rows = allRows.filter(r=>unitMatches(r, OH_LOG_FILTER.lt));
    const host = $('#ohltLogHost', main); if(!host) return;
    if(!allRows.length){ host.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.wrench}<h4>No OH records yet</h4></div></div>`; return; }
    host.innerHTML = `<div class="unit-bar"><label>Filter by unit</label>
      <select class="sel" id="ohltFlt">${unitOptionsHtml(OH_LOG_FILTER.lt, {all:true, unassigned:allRows.some(r=>!r.unit)})}</select>
      <span class="fmeta">${rows.length} of ${allRows.length} shown</span></div>
    ${rows.length ? '' : '<p class="hint">No OH records for this unit.</p>'}
    <div class="table-wrap"><table class="dgrid"><thead><tr><th>Date</th><th>Unit</th><th class="wrap">Motor Name</th><th>Engineer</th><th>Supervisor</th><th>Actions</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.unit||'—')}</td><td class="wrap">${escapeHtml((r.items[0]||{}).remark)}</td><td>${escapeHtml(r.eng)}</td><td>${escapeHtml(r.sup)}</td>
      <td class="row-actions"><button class="btn btn-danger btn-sm" data-del="${r.id}" type="button">${ICONS.trash}</button></td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-del]', host).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('delete this OH record', ()=>{
        if(!confirm('Delete this OH record?')) return;
        cloudDeleteRecord(KEYS.ohLTForms, b.dataset.del); drawLog();
      });
    }));
    $('#ohltFlt', host).addEventListener('change', e=>{ OH_LOG_FILTER.lt = e.target.value; drawLog(); });
  }
  draw('upload');
}

/* ============================================================
   LT MOTOR REWINDING CHECKLIST
   ============================================================ */
function renderRewindingLT(main){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.coil} LT Motor Rewinding Checklist</h2><div class="desc">Rewinding cause, work detail & box-up record for LT motors.</div></div>
    </div>
    <div class="mode-toggle" id="rwMode">
      <button class="active" data-mode="upload">Upload Scanned Report</button>
      <button data-mode="form">Fill Rewinding Checklist Form</button>
    </div>
    <div style="height:16px;"></div>
    <div id="rwBody"></div>
  `;
  const btns = $$('#rwMode button', main);
  btns.forEach(b=>b.addEventListener('click', ()=>{ btns.forEach(x=>x.classList.remove('active')); b.classList.add('active'); draw(b.dataset.mode); }));

  function draw(mode){
    const body = $('#rwBody', main);
    if(mode==='upload'){
      body.innerHTML = `<div class="form-card"><h3><span class="tagnum">UPLOAD</span> Scanned Rewinding Report</h3>
        <div id="rwUploadZone"></div></div>`;
      renderUploadBlock($('#rwUploadZone', main), KEYS.rewindFiles, {multiple:true});
      return;
    }
    body.innerHTML = `
      <div class="form-card">
        <h3><span class="tagnum">1</span> Motor Details & Cause of Failure</h3>
        <div class="grid-3">
          ${fieldInputHtml('date','Date','date', todayISO())}
          <div class="f-item"><label>PTW No. and Date</label><input class="field" id="rw_ptw"></div>
          <div class="f-item"><label>Name of the Motor & SL No</label><input class="field" id="rw_name"></div>
          <div class="f-item"><label>Motor Description (KW/V/RPM/Frame)</label><input class="field" id="rw_desc"></div>
          <div class="f-item"><label>Bearings No (DE/NDE)</label><input class="field" id="rw_brg"></div>
          <div class="f-item" style="grid-column:1/-1;"><label>Defect Details</label><input class="field" id="rw_defect"></div>
          <div class="f-item" style="grid-column:1/-1;"><label>Root Cause of Failure (as envisaged)</label><input class="field" id="rw_cause"></div>
        </div>
      </div>
      <div class="form-card">
        <h3><span class="tagnum">2</span> Rotor & Stator Details</h3>
        <div class="grid-3">
          <div class="f-item"><label>Stator Slot Condition</label><input class="field" id="rw_slot"></div>
          <div class="f-item"><label>Rotor Bars & Short Circuit Ring Condition</label><input class="field" id="rw_rotorbar"></div>
          <div class="f-item"><label>No. of Stator Slots</label><input class="field" id="rw_noslots"></div>
          <div class="f-item"><label>Copper Wire Gauge Size</label><input class="field" id="rw_gauge"></div>
          <div class="f-item"><label>Total Copper Quantity Required (KGs)</label><input class="field" id="rw_cuqty"></div>
          <div class="f-item"><label>Insulation Paper Requirement Type</label><input class="field" id="rw_inspaper"></div>
          <div class="f-item"><label>Total Burnt Copper Quantity (KGs)</label><input class="field" id="rw_burntcu"></div>
        </div>
      </div>
      <div class="form-card">
        <h3><span class="tagnum">3</span> Rewinding Work Details</h3>
        <div class="grid-3">
          <div class="f-item"><label>No. of Coils Made for Rewinding</label><input class="field" id="rw_coils"></div>
          <div class="f-item"><label>Winding Wires Filling in Slots</label><input class="field" id="rw_filling"></div>
          <div class="f-item"><label>Connection of Winding Wires</label><input class="field" id="rw_connection"></div>
          <div class="f-item"><label>Red Varnish Details (Type/Expiry/Qty)</label><input class="field" id="rw_varnish"></div>
          <div class="f-item"><label>Heating Details (Oven Temp/Time)</label><input class="field" id="rw_heating"></div>
          <div class="f-item"><label>Resistance & IR Value Before Varnishing</label><input class="field" id="rw_before"></div>
          <div class="f-item"><label>Resistance & IR Value After Varnishing</label><input class="field" id="rw_after"></div>
        </div>
      </div>
      <div class="form-card">
        <h3><span class="tagnum">4</span> Motor OH / Box-Up Work</h3>
        <div class="grid-3">
          <div class="f-item"><label>Bearings Replaced (DE/NDE)</label><input class="field" id="rw_brgrepl"></div>
          <div class="f-item"><label>Clean & Inspect Fan, Fan Cover, End Covers, Housing & TB</label><input class="field" id="rw_clean"></div>
          <div class="f-item"><label>Grease Capillary Cleaned / Nipples Inspected</label><input class="field" id="rw_grease"></div>
          <div class="f-item"><label>Condition of Stator & Rotor Core Before Box-Up</label><input class="field" id="rw_corecond"></div>
          <div class="f-item"><label>DC Motor — Commutator/Brush Holders/Brushes Checked</label><input class="field" id="rw_dcmotor"></div>
          <div class="f-item"><label>Motor Box-Up Done</label><input class="field" id="rw_boxup"></div>
          <div class="f-item"><label>Final IR Value of Stator Winding</label><input class="field" id="rw_finalir"></div>
          <div class="f-item"><label>Final Winding Resistance</label><input class="field" id="rw_finalres"></div>
          <div class="f-item"><label>No Load / Decoupled Current (R/Y/B)</label><input class="field" id="rw_noload"></div>
          <div class="f-item"><label>Vibration Data DE/NDE</label><input class="field" id="rw_vib"></div>
        </div>
        <div class="f-item" style="margin-top:10px;"><label>Any Other Observation</label><textarea class="field" id="rw_other" rows="2"></textarea></div>
        <div class="grid-2" style="margin-top:10px;">
          <div class="f-item"><label>Signature of Area Engineer</label><input class="field" id="rw_eng"></div>
          <div class="f-item"><label>Signature of Agency Supervisor</label><input class="field" id="rw_sup"></div>
        </div>
        <div style="margin-top:14px;"><button class="btn btn-amber" id="btnSubmitRW">${ICONS.plus} Save Rewinding Record</button></div>
      </div>
      <div class="section-head"><h2 style="font-size:18px;">Rewinding Records Logged</h2></div>
      <div id="rwLogHost"></div>
    `;
    drawLog();
    $('#btnSubmitRW', main).addEventListener('click', async ()=>{
    if(!isEditor){ requireEdit('save this record', ()=>{}); return; }
      const g = id => (main.querySelector('#'+id)||{}).value || '';
      if(!g('rw_name')){ toast('Enter the motor name & serial no before saving.', true); return; }
      const rec = { id: uid(), date:(main.querySelector('[data-key="date"]')||{}).value || todayISO(),
        ptw:g('rw_ptw'), name:g('rw_name'), desc:g('rw_desc'), brg:g('rw_brg'), defect:g('rw_defect'), cause:g('rw_cause'),
        slot:g('rw_slot'), rotorbar:g('rw_rotorbar'), noslots:g('rw_noslots'), gauge:g('rw_gauge'), cuqty:g('rw_cuqty'),
        inspaper:g('rw_inspaper'), burntcu:g('rw_burntcu'), coils:g('rw_coils'), filling:g('rw_filling'),
        connection:g('rw_connection'), varnish:g('rw_varnish'), heating:g('rw_heating'), before:g('rw_before'), after:g('rw_after'),
        brgrepl:g('rw_brgrepl'), clean:g('rw_clean'), grease:g('rw_grease'), corecond:g('rw_corecond'), dcmotor:g('rw_dcmotor'),
        boxup:g('rw_boxup'), finalir:g('rw_finalir'), finalres:g('rw_finalres'), noload:g('rw_noload'), vib:g('rw_vib'),
        other:g('rw_other'), eng:g('rw_eng'), sup:g('rw_sup') };
      await cloudAddRecord(KEYS.rewindForms, rec);
      toast('Rewinding record saved.');
      draw('form');
    });
  }
  function drawLog(){
    const rows = LS_get(KEYS.rewindForms,[]).slice().reverse();
    const host = $('#rwLogHost', main); if(!host) return;
    if(!rows.length){ host.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.coil}<h4>No rewinding records yet</h4></div></div>`; return; }
    host.innerHTML = `<div class="table-wrap"><table class="dgrid"><thead><tr>
      <th>Date</th><th class="wrap">Motor & SL No</th><th class="wrap">Defect</th><th class="wrap">Root Cause</th><th>Engineer</th><th>Actions</th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr><td>${escapeHtml(r.date)}</td><td class="wrap">${escapeHtml(r.name)}</td><td class="wrap">${escapeHtml(r.defect)}</td>
      <td class="wrap">${escapeHtml(r.cause)}</td><td>${escapeHtml(r.eng)}</td>
      <td class="row-actions"><button class="btn btn-danger btn-sm" data-del="${r.id}" type="button">${ICONS.trash}</button></td></tr>`).join('')}
    </tbody></table></div>`;
    $$('[data-del]', host).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('delete this rewinding record', ()=>{
        if(!confirm('Delete this rewinding record?')) return;
        cloudDeleteRecord(KEYS.rewindForms, b.dataset.del); drawLog();
      });
    }));
  }
  draw('upload');
}

/* ============================================================
   WORKSHOP — equipment / instruments register
   ============================================================ */
function renderWorkshop(main){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.toolbox} Workshop — Equipment & Instruments Register</h2><div class="desc">List of tools, instruments and equipment available in the EM workshop, with calibration details.</div></div>
      <button class="btn btn-amber" id="btnAddWs">${ICONS.plus} Add Item</button>
    </div>
    <div class="toolbar"><div class="grow"><input class="search-input" id="wsSearch" placeholder="Search item name, remarks..."></div></div>
    <div id="wsHost"></div>
  `;
  function draw(){
    const q = ($('#wsSearch',main).value||'').toLowerCase();
    const rows = LS_get(KEYS.workshop,[]).filter(r=>!q || [r.name,r.calib,r.remarks].some(v=>String(v||'').toLowerCase().includes(q)));
    const host = $('#wsHost', main);
    if(!rows.length){ host.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.toolbox}<h4>No equipment registered yet</h4><p>Use "Add Item" to register the workshop's first tool or instrument.</p></div></div>`; return; }
    host.innerHTML = `<div class="table-wrap"><table class="dgrid"><thead><tr>
      <th>Sr No</th><th class="wrap">Name</th><th class="wrap">Calibration Details (if any)</th><th class="wrap">Remarks</th><th>Actions</th>
    </tr></thead><tbody>
      ${rows.map((r,i)=>`<tr><td>${i+1}</td><td class="wrap">${escapeHtml(r.name)}</td><td class="wrap">${escapeHtml(r.calib)}</td><td class="wrap">${escapeHtml(r.remarks)}</td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${r.id}" type="button">${ICONS.edit}</button>
        <button class="btn btn-danger btn-sm" data-del="${r.id}" type="button">${ICONS.trash}</button>
      </td></tr>`).join('')}
    </tbody></table></div>`;
    $$('[data-del]', host).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('remove this workshop item', ()=>{
        if(!confirm('Remove this item from the workshop register?')) return;
        cloudDeleteRecord(KEYS.workshop, b.dataset.del); draw();
      });
    }));
    $$('[data-edit]', host).forEach(b=>b.addEventListener('click', ()=> openWsModal(b.dataset.edit)));
  }
  function openWsModal(editId){
    if(!isEditor){ requireEdit('add or edit a workshop item', ()=>{}); return; }
    const existing = editId ? LS_get(KEYS.workshop,[]).find(x=>x.id===editId) : null;
    openModal({
      title: existing ? 'Edit Workshop Item' : 'Add Workshop Item', submitLabel: existing ? 'Save Changes' : 'Add Item',
      bodyHtml: `
        <div class="f-item"><label>Name</label><input class="field" id="ws_name" value="${escapeHtml(existing?.name||'')}"></div>
        <div class="f-item" style="margin-top:10px;"><label>Calibration Details (if any)</label><input class="field" id="ws_calib" value="${escapeHtml(existing?.calib||'')}"></div>
        <div class="f-item" style="margin-top:10px;"><label>Remarks</label><textarea class="field" id="ws_remarks" rows="2">${escapeHtml(existing?.remarks||'')}</textarea></div>
      `,
      onSubmit: async (overlay)=>{
        const name = overlay.querySelector('#ws_name').value;
        if(!name){ toast('Enter the equipment/instrument name.', true); return false; }
        const calib = overlay.querySelector('#ws_calib').value;
        const remarks = overlay.querySelector('#ws_remarks').value;
        if(existing){
          await cloudUpdateRecord(KEYS.workshop, existing.id, { name, calib, remarks });
        } else {
          await cloudAddRecord(KEYS.workshop, { id: uid(), name, calib, remarks });
        }
        draw();
        toast(existing ? 'Item updated.' : 'Item added to workshop register.');
      }
    });
  }
  $('#wsSearch',main).addEventListener('input', draw);
  $('#btnAddWs',main).addEventListener('click', ()=>openWsModal(null));
  draw();
}

/* ============================================================
   EQUIPMENT HISTORY — event log per HT / LT motor
   Equipment names come live from the HT and LT motor registers, so a motor added
   there is available here straight away. Entries can be sorted / filtered by
   unit and by equipment name.
   ============================================================ */
const EQH_EVENTS = ['Breakdown / Fault','Overhaul','Rewinding','Bearing replacement','Preventive maintenance',
  'Testing / Inspection','Replacement / Installation','Modification','Other'];
const EQH_STAGE_UNITS = {1:[1,2], 2:[3,4], 3:[5], 4:[6]};   // LT registers are grouped by stage (STG-1 … STG-4)
const EQH = { mode:'log', unit:'All', equip:'All', sort:'date_desc', editId:null };   // remembered across live refreshes
const eqhUnitNum = u => { const m = String(u||'').match(/\d+/); return m ? +m[0] : 99; };
const eqhName = (a,b) => String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'});

function eqhEquipmentList(){
  const items = [];
  LS_get(KEYS.htMotors, []).forEach(m=>{
    const name = String(m['EQUIPMENT']||'').trim(); if(!name) return;
    const unitStr = String(m['UNIT NO']||'').trim();
    const units = (unitStr.match(/\d+/g)||[]).map(Number).filter(n=>n>=1&&n<=6);
    items.push({ type:'HT', name, serial:String(m['SERIAL NO.']||'').trim(), units, where:unitStr });
  });
  const lt = LS_get(KEYS.ltMotors, {});
  Object.keys(lt).forEach(group=>{
    const sm = group.match(/STG-?\s*(\d)/i);
    const units = sm ? (EQH_STAGE_UNITS[+sm[1]]||[]) : [];
    (lt[group]||[]).forEach(m=>{
      const name = String(m['MOTOR NAME']||'').trim(); if(!name) return;
      items.push({ type:'LT', name, serial:String(m['SERIAL NO.']||'').trim(), units, where:group });
    });
  });
  return items;
}

function eqhSortRows(rows, sort){
  const byDateDesc = (a,b)=> String(b.date||'').localeCompare(String(a.date||''));
  const r = rows.slice();
  if(sort==='date_asc') r.sort((a,b)=> -byDateDesc(a,b));
  else if(sort==='unit') r.sort((a,b)=> eqhUnitNum(a.unit)-eqhUnitNum(b.unit) || eqhName(a.equipment,b.equipment) || byDateDesc(a,b));
  else if(sort==='name') r.sort((a,b)=> eqhName(a.equipment,b.equipment) || eqhUnitNum(a.unit)-eqhUnitNum(b.unit) || byDateDesc(a,b));
  else r.sort(byDateDesc);
  return r;
}

function downloadEquipHistoryExcel(rows, filename){
  const headers = ['Date','Unit','Type','Equipment','Serial No','Event','Description','Done By','Remark'];
  const data = rows.map(r=>[r.date||'', r.unit||'', r.equipType||'', r.equipment||'', r.serial||'', r.event||'', r.description||'', r.doneBy||'', r.remark||'']);
  if(typeof XLSX === 'undefined'){
    toast('Excel library could not load — downloading as CSV (opens in Excel) instead.', true);
    exportCSV(filename.replace(/\.xlsx$/,'.csv'), headers, data); return;
  }
  const ws = XLSX.utils.aoa_to_sheet([['Electrical Maintenance Department'],['Equipment History Log'],[],headers,...data]);
  ws['!cols'] = [12,10,7,30,20,24,60,20,30].map(w=>({wch:w}));
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:8}},{s:{r:1,c:0},e:{r:1,c:8}}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Equipment History');
  XLSX.writeFile(wb, filename);
}

function renderEquipHistory(main){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.history} Equipment History</h2><div class="desc">Log breakdowns, overhauls, rewinding, bearing changes and other events against any HT or LT motor from the motor registers. View the history sorted by unit or by equipment name.</div></div>
    </div>
    <div class="mode-toggle" id="eqhMode">
      <button data-mode="log">History Log</button>
      <button data-mode="add">Add History Entry</button>
    </div>
    <div style="height:16px;"></div>
    <div id="eqhBody"></div>
  `;
  const btns = $$('#eqhMode button', main);
  btns.forEach(b=>b.addEventListener('click', ()=>{ EQH.editId = null; drawMode(b.dataset.mode); }));

  function drawMode(mode){
    EQH.mode = mode;
    btns.forEach(x=>x.classList.toggle('active', x.dataset.mode===mode));
    mode==='add' ? drawAdd() : drawLog();
  }

  /* ---------------- Add entry ---------------- */
  function drawAdd(){
    const body = $('#eqhBody', main);
    const all = eqhEquipmentList();
    const editRec = EQH.editId ? LS_get(KEYS.equipHistory, []).find(r=>r.id===EQH.editId) : null;
    if(EQH.editId && !editRec){ EQH.editId = null; }
    // Motor removed from the register since this entry was logged? Keep it selectable so the entry can still be edited.
    if(editRec && !all.some(e=>e.type===editRec.equipType && e.name===editRec.equipment && e.serial===(editRec.serial||'') && e.where===(editRec.source||''))){
      all.push({ type:editRec.equipType||'HT', name:editRec.equipment||'', serial:editRec.serial||'', units:[], where:editRec.source||'' });
    }
    body.innerHTML = `
      <div class="form-card">
        <h3><span class="tagnum">${editRec?'EDIT':'LOG'}</span> ${editRec?'Edit':'Add'} Equipment History Entry</h3>
        <div class="grid-3">
          <div class="f-item"><label>Date</label><input class="field" type="date" id="eq_date" value="${todayISO()}"></div>
          <div class="f-item"><label>Unit <span style="color:var(--danger,#c0392b);">*</span></label><select class="sel" id="eq_unit">${unitOptionsHtml('')}</select></div>
          <div class="f-item"><label>Equipment Type <span style="color:var(--danger,#c0392b);">*</span></label>
            <select class="sel" id="eq_type"><option value="HT">HT Motor</option><option value="LT">LT Motor</option></select></div>
        </div>
        <div class="grid-2" style="margin-top:12px;">
          <div class="f-item"><label>Search equipment name / serial no.</label><input class="field" id="eq_search" placeholder="Type to narrow the list…" autocomplete="off"></div>
          <div class="f-item"><label>Equipment <span style="color:var(--danger,#c0392b);">*</span> <span class="fmeta" id="eq_count"></span></label><select class="sel" id="eq_pick"></select></div>
        </div>
        <hr style="margin:16px 0;border:none;border-top:1px solid var(--paper-dim);">
        <div class="grid-2">
          <div class="f-item"><label>Event Type <span style="color:var(--danger,#c0392b);">*</span></label>
            <select class="sel" id="eq_event"><option value="">— Select —</option>${EQH_EVENTS.map(e=>`<option>${escapeHtml(e)}</option>`).join('')}</select></div>
          <div class="f-item"><label>Done By / Agency</label><input class="field" id="eq_by"></div>
        </div>
        <div class="f-item" style="margin-top:10px;"><label>Description / Work Done <span style="color:var(--danger,#c0392b);">*</span></label><textarea class="field" id="eq_desc" rows="3"></textarea></div>
        <div class="f-item" style="margin-top:10px;"><label>Remark</label><input class="field" id="eq_remark"></div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-amber" id="btnSaveEq" type="button">${editRec?'Save Changes':ICONS.plus+' Save to Equipment History'}</button>
          ${editRec?'<button class="btn btn-ghost" id="btnCancelEq" type="button">Cancel</button>':''}</div>
      </div>`;
    if(editRec){
      $('#eq_date', main).value = editRec.date||todayISO();
      $('#eq_unit', main).value = editRec.unit||'';
      $('#eq_type', main).value = editRec.equipType||'HT';
      $('#eq_event', main).value = editRec.event||'';
      $('#eq_by', main).value = editRec.doneBy||'';
      $('#eq_desc', main).value = editRec.description||'';
      $('#eq_remark', main).value = editRec.remark||'';
    }

    let shown = [];
    const pick = $('#eq_pick', main);
    function fillPicker(){
      const type = $('#eq_type', main).value, unit = $('#eq_unit', main).value;
      const q = $('#eq_search', main).value.trim().toLowerCase();
      const u = unit ? eqhUnitNum(unit) : 0;
      shown = all.filter(e => e.type===type
          && (!u || !e.units.length || e.units.includes(u))
          && (!q || (e.name+' '+e.serial).toLowerCase().includes(q)))
        .sort((a,b)=> eqhName(a.name,b.name) || eqhName(a.where,b.where));
      pick.innerHTML = `<option value="">— Select equipment —</option>` + shown.map((e,i)=>{
        const lbl = e.type==='HT'
          ? `${e.name} — ${e.where||'-'}${e.serial?' — '+e.serial:''}`
          : `${e.name}${e.serial?' — '+e.serial:''} — ${e.where}`;
        return `<option value="${i}">${escapeHtml(lbl)}</option>`;
      }).join('');
      $('#eq_count', main).textContent = `(${shown.length} available${unit?' for '+unit:''}, sorted A→Z)`;
    }
    fillPicker();
    if(editRec){
      const i = shown.findIndex(e=>e.type===editRec.equipType && e.name===editRec.equipment && e.serial===(editRec.serial||'') && e.where===(editRec.source||''));
      if(i>=0) pick.value = String(i);
      $('#btnCancelEq', main).addEventListener('click', ()=>{ EQH.editId = null; drawMode('log'); });
    }
    ['eq_type','eq_unit'].forEach(id=>$('#'+id, main).addEventListener('change', fillPicker));
    $('#eq_search', main).addEventListener('input', fillPicker);
    pick.addEventListener('change', ()=>{
      const e = shown[+pick.value];
      if(e && !$('#eq_unit', main).value && e.units.length===1) $('#eq_unit', main).value = 'Unit '+e.units[0];
    });

    $('#btnSaveEq', main).addEventListener('click', async ()=>{
      if(!isEditor){ requireEdit('save this record', ()=>{}); return; }
      const g = id => $('#'+id, main).value.trim();
      const item = pick.value !== '' ? shown[+pick.value] : null;
      if(!g('eq_unit')){ toast('Select the unit (Unit 1 – Unit 6).', true); return; }
      if(!item){ toast('Select the equipment from the list.', true); return; }
      if(!g('eq_event')){ toast('Select the event type.', true); return; }
      if(!g('eq_desc')){ toast('Enter a description of the event / work done.', true); return; }
      const rec = { id: uid(), date:g('eq_date')||todayISO(), unit:g('eq_unit'), equipType:item.type, equipment:item.name,
        serial:item.serial, source:item.where, event:g('eq_event'), description:g('eq_desc'), doneBy:g('eq_by'), remark:g('eq_remark') };
      if(editRec){
        const { id:_i, ...fields } = rec;
        await cloudUpdateRecord(KEYS.equipHistory, editRec.id, fields);
        toast('Equipment history entry updated.');
        EQH.editId = null;
      } else {
        await cloudAddRecord(KEYS.equipHistory, rec);
        toast('Equipment history entry saved.');
      }
      EQH.unit = 'All'; EQH.equip = 'All';
      drawMode('log');
    });
  }

  /* ---------------- History log ---------------- */
  function drawLog(){
    const body = $('#eqhBody', main);
    const all = LS_get(KEYS.equipHistory, []);
    if(!all.length){ body.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.history}<h4>No equipment history logged yet</h4><p>Use "Add History Entry" to log the first event.</p></div></div>`; return; }

    const byUnit = all.filter(r => EQH.unit==='All' || r.unit===EQH.unit);
    const names = [...new Set(byUnit.map(r=>r.equipment).filter(Boolean))].sort(eqhName);
    if(EQH.equip!=='All' && !names.includes(EQH.equip)) EQH.equip = 'All';
    const rows = eqhSortRows(byUnit.filter(r => EQH.equip==='All' || r.equipment===EQH.equip), EQH.sort);

    let lastKey = null;
    const grpOf = r => EQH.sort==='unit' ? (r.unit||'-') : (EQH.sort==='name' ? (r.equipment||'-') : null);
    const trs = rows.map(r=>{
      const k = grpOf(r);
      const head = (k!==null && k!==lastKey) ? `<tr><td colspan="10" style="background:var(--paper-dim);font-weight:700;">${escapeHtml(k)}</td></tr>` : '';
      lastKey = k;
      return head + `<tr>
        <td style="white-space:nowrap;">${escapeHtml(r.date||'')}</td><td>${escapeHtml(r.unit||'')}</td><td>${escapeHtml(r.equipType||'')}</td>
        <td class="wrap">${escapeHtml(r.equipment||'')}</td><td class="wrap">${escapeHtml(r.serial||'')}</td>
        <td class="wrap">${escapeHtml(r.event||'')}</td><td class="wrap" style="white-space:pre-wrap;min-width:220px;">${escapeHtml(r.description||'')}</td>
        <td class="wrap">${escapeHtml(r.doneBy||'')}</td><td class="wrap">${escapeHtml(r.remark||'')}</td>
        <td style="white-space:nowrap;"><button class="btn btn-ghost btn-sm" data-edit="${r.id}" type="button" title="Edit this entry">Edit</button>
          <button class="btn btn-danger btn-sm" data-del="${r.id}" type="button">${ICONS.trash}</button></td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="unit-bar">
        <label>Sort by</label>
        <select class="sel" id="eqhSort">
          <option value="date_desc" ${EQH.sort==='date_desc'?'selected':''}>Date (newest first)</option>
          <option value="date_asc" ${EQH.sort==='date_asc'?'selected':''}>Date (oldest first)</option>
          <option value="unit" ${EQH.sort==='unit'?'selected':''}>Unit (1 → 6)</option>
          <option value="name" ${EQH.sort==='name'?'selected':''}>Equipment name (A → Z)</option>
        </select>
        <label style="margin-left:8px;">Unit</label>
        <select class="sel" id="eqhUnit">${unitOptionsHtml(EQH.unit, {all:true})}</select>
        <label style="margin-left:8px;">Equipment</label>
        <select class="sel" id="eqhEquip" style="min-width:220px;">
          <option value="All">All equipment</option>
          ${names.map(n=>`<option value="${escapeHtml(n)}" ${n===EQH.equip?'selected':''}>${escapeHtml(n)}</option>`).join('')}
        </select>
        <span class="fmeta">${rows.length} of ${all.length} entries</span>
        <button class="btn btn-teal btn-sm" id="btnEqhXlsx" type="button" style="margin-left:auto;">${ICONS.download} Download Excel (.xlsx)</button>
      </div>
      ${rows.length ? `<div class="topscroll"><div class="topscroll-inner"></div></div>
      <div class="table-wrap compact"><table class="dgrid compact"><thead><tr>
        <th>Date</th><th>Unit</th><th>Type</th><th class="wrap">Equipment</th><th class="wrap">Serial No</th><th class="wrap">Event</th>
        <th class="wrap">Description</th><th class="wrap">Done By</th><th class="wrap">Remark</th><th>Actions</th>
      </tr></thead><tbody>${trs}</tbody></table></div>` : `<p class="hint">No entries match this unit / equipment selection.</p>`}`;

    $('#eqhSort', body).addEventListener('change', e=>{ EQH.sort = e.target.value; drawLog(); });
    $('#eqhUnit', body).addEventListener('change', e=>{ EQH.unit = e.target.value; EQH.equip = 'All'; drawLog(); });
    $('#eqhEquip', body).addEventListener('change', e=>{ EQH.equip = e.target.value; drawLog(); });
    $('#btnEqhXlsx', body).addEventListener('click', ()=> downloadEquipHistoryExcel(rows, 'Equipment_History_'+todayISO()+'.xlsx'));
    $$('[data-edit]', body).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('edit this history entry', ()=>{ EQH.editId = b.dataset.edit; drawMode('add'); });
    }));
    $$('[data-del]', body).forEach(b=>b.addEventListener('click', ()=>{
      requireEdit('delete this history entry', ()=>{
        if(!confirm('Delete this equipment history entry?')) return;
        cloudDeleteRecord(KEYS.equipHistory, b.dataset.del);
        drawLog();
      });
    }));
    if(rows.length) wireTopScroll(body);
  }

  drawMode(EQH.mode);
}

/* ============================================================
   Route table & bootstrap
   ============================================================ */
const SECTION_RENDERERS = {
  'motors-ht': (main)=>renderHTMotors(main),
  'motors-lt': (main)=>renderLTMotors(main),
  'bearings-ht': (main)=>renderBearingSection(main, KEYS.htBearings, 'HT Motor Bearings — Availability Status', '(Stock as recorded; adjust with +/− as issues/receipts happen.)'),
  'bearings-lt': (main)=>renderBearingSection(main, KEYS.ltBearings, 'LT Motor Bearings — Availability Status', '(Stock as recorded; adjust with +/− as issues/receipts happen.)', {narrow:true}),
  'daily-ht': (main)=>renderDailyChecklistHT(main),
  'daily-lt': (main)=>renderDailyChecklistLT(main),
  'preservation': (main)=>renderPreservation(main),
  'oh-ht': (main)=>renderOHHT(main),
  'oh-lt': (main)=>renderOHLT(main),
  'rewinding': (main)=>renderRewindingLT(main),
  'equiphist': (main)=>renderEquipHistory(main),
  'lubrication': (main)=>renderLubrication(main),
  'workshop': (main)=>renderWorkshop(main),
};

function boot(){
  const startApp = async () => {
    const appEl = document.getElementById('app');
    appEl.style.display = 'block';
    appEl.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#061029;">
        <div style="color:#9cc0e0;font-family:'IBM Plex Mono',monospace;font-size:13px;text-align:center;">
          <div style="width:26px;height:26px;border:3px solid #FFC20E;border-top-color:transparent;border-radius:50%;
            margin:0 auto 14px;animation:spin .8s linear infinite;"></div>
          Connecting to shared database…
        </div>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
    try{
      await initCloudSync();
    }catch(e){
      console.error('Cloud sync init failed', e);
      appEl.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#061029;padding:30px;">
          <div style="color:#f0999b;font-family:'Inter',sans-serif;font-size:14px;text-align:center;max-width:420px;">
            <strong>Could not connect to the shared database.</strong><br><br>
            Check your internet connection and that firebase-config.js has been filled in correctly, then reload this page.
            <br><br><span style="color:#9cc0e0;font-size:12px;">${escapeHtml(e.message||e)}</span>
          </div>
        </div>`;
      return;
    }
    appEl.style.display = '';
    renderShell();
    const h = location.hash.replace('#','');
    if(h){
      const [section, sub] = h.split('/');
      STATE = { section, sub: sub||null };
    }
    render();
  };
  startApp();
}
document.addEventListener('DOMContentLoaded', boot);
