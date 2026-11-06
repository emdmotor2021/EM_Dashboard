/* ============================================================
   LUBRICATION DETAILS
   Unit-wise greasing / oil-filling register for motors, built from the
   "HT motor Greasing" Excel sheets.

   Data model (one Firestore document per equipment, collection em_lub_equipment):
     { unit, order, description, funcLoc, duration (weeks | null), durInferred, note,
       history: [ { d:'YYYY-MM-DD', a:activity, o:order no, l:lubricant, q:quantity, by:done by, r:remark } ] }
   Loaded after app.js (uses its helpers: $, $$, ICONS, openModal, toast, requireEdit, isEditor,
   LS_get, cloudAddRecord / cloudUpdateRecord / cloudDeleteRecord, wireTopScroll).
   ============================================================ */

ICONS.lube = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h10v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/><path d="M13 14l5-6h3"/><path d="M5 13V9h6v4"/><path d="M19.5 12c1 1.2 1.5 2 1.5 2.7a1.5 1.5 0 0 1-3 0c0-.7.5-1.5 1.5-2.7z"/></svg>`;

const LUB_UNITS = ['Unit 1','Unit 2','Unit 3','Unit 4','Unit 5','Unit 6',
  'Stage-1 Offsite','Stage-2 Offsite','Stage-3 Offsite','Stage-4 Offsite','Station Common'];
const LUB_ACTIVITIES = ['Greasing','Oil Filling / Checking','Oil Change','Other'];
const LUB_MIN_WEEKS = 12;    // lubrication interval is never shorter than this
const LUB_SOON_DAYS = 14;     // "due soon" window

/* UI state — remembered across the live refreshes that happen whenever anyone saves something */
const LUB = { mode:'register', unit:'Unit 1', q:'', status:'All', sort:'seq', logUnit:'Unit 1', draft:{} };

/* ---------------- Dates (local time, so IST users get the right "today") ---------------- */
const lubToday = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const lubDay = iso => Date.UTC(+iso.slice(0,4), +iso.slice(5,7)-1, +iso.slice(8,10));
const lubFmt = iso => iso ? iso.slice(8,10)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4) : '—';
const lubAddDays = (iso, n) => new Date(lubDay(iso) + n*864e5).toISOString().slice(0,10);
const lubDiffDays = (a, b) => Math.round((lubDay(a) - lubDay(b)) / 864e5);
const lubByName = (a,b) => String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'});

/* ---------------- Data access ---------------- */
const lubAll = () => LS_get(KEYS.lubEquip, []);
const lubFind = id => lubAll().find(r => r.id === id);
const lubLoaded = () => {
  ensureListener(KEYS.lubEquip);   // attach the live listener first, otherwise the cache is never filled
  return CLOUD_CACHE[KEYS.lubEquip] !== undefined;
};
const lubSortHist = h => h.slice().sort((a,b) => (a.d ? 0 : 1) - (b.d ? 0 : 1) || String(a.d||'').localeCompare(String(b.d||'')));
const lubUnitList = unit => lubAll().filter(r => r.unit === unit)
  .sort((a,b) => (a.order||0) - (b.order||0) || lubByName(a.description, b.description));

/* Status of one equipment: last done (on/before today) + interval -> next due */
function lubInfo(rec, today){
  const hist = Array.isArray(rec.history) ? rec.history : [];
  const dated = hist.filter(e => e && e.d).sort((a,b) => a.d.localeCompare(b.d));
  const done = dated.filter(e => e.d <= today);
  const last = done.length ? done[done.length-1] : null;
  const planned = dated.find(e => e.d > today) || null;
  const rawDur = +rec.duration || 0;
  const dur = Math.max(LUB_MIN_WEEKS, rawDur);          // minimum 12 weeks for every equipment (blank -> 12)
  const adjusted = rawDur !== dur;                      // true when the 12-week minimum replaced the stored value
  let next = null, days = null, status;
  if(last && dur){ next = lubAddDays(last.d, dur*7); days = lubDiffDays(next, today); }
  if(!dur) status = 'noint';
  else if(!last) status = 'norec';
  else if(days < 0) status = 'overdue';
  else if(days <= LUB_SOON_DAYS) status = 'soon';
  else status = 'ok';
  return { hist, last, planned, dur, adjusted, next, days, status, count: hist.length };
}

function lubBadge(info){
  const t = { overdue:`Overdue ${Math.abs(info.days)} d`, soon:`Due in ${info.days} d`, ok:`OK · ${info.days} d left`,
              norec:'No record', noint:'Set interval' }[info.status];
  return `<span class="lub-badge ${info.status}">${t}</span>`;
}

/* Used by the dashboard card (reads the cache only, so the dashboard doesn't open an extra database listener) */
function lubDashSummary(){
  const arr = CLOUD_CACHE[KEYS.lubEquip];
  if(!arr) return LUB_UNITS.length + ' unit / stage groups';
  const t = lubToday();
  const od = arr.filter(r => lubInfo(r, t).status === 'overdue').length;
  return `${arr.length} equipment · ${od} overdue`;
}

/* ---------------- Excel export ---------------- */
function lubDownloadExcel(unit, rows, today){
  const filename = 'Lubrication_' + unit.replace(/\s+/g,'_') + '_' + today + '.xlsx';
  const regHead = ['Sr','Equipment Description','Functional Location','Interval (weeks)','Interval inferred?','Last Done','Last Order No','Next Due','Status','Entries','Note'];
  const histHead = ['Sr','Equipment Description','Functional Location','Date','Activity','Order / Notification No','Lubricant','Quantity','Done By','Remark'];
  const statusText = { overdue:'Overdue', soon:'Due soon', ok:'OK', norec:'No record', noint:'Interval not set' };
  const reg = [], his = [];
  rows.forEach(({rec, info, seq}) => {
    reg.push([seq, rec.description||'', rec.funcLoc||'', info.dur||'', (rec.durInferred || info.adjusted) ? 'Yes' : '', info.last ? lubFmt(info.last.d) : '',
      info.last ? (info.last.o||'') : '', info.next ? lubFmt(info.next) : '', statusText[info.status], info.count, rec.note||'']);
    lubSortHist(info.hist).reverse().forEach(e => his.push([seq, rec.description||'', rec.funcLoc||'', e.d ? lubFmt(e.d) : '',
      e.a||'', e.o||'', e.l||'', e.q||'', e.by||'', e.r||'']));
  });
  if(typeof XLSX === 'undefined'){
    toast('Excel library could not load — downloading as CSV (opens in Excel) instead.', true);
    exportCSV(filename.replace(/\.xlsx$/, '.csv'), regHead, reg); return;
  }
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([['Electrical Maintenance Department'], ['Lubrication Schedule — ' + unit + '  (as on ' + lubFmt(today) + ')'], [], regHead, ...reg]);
  ws1['!cols'] = [5,48,32,10,10,12,14,12,16,8,30].map(w => ({wch:w}));
  ws1['!merges'] = [{s:{r:0,c:0}, e:{r:0,c:10}}, {s:{r:1,c:0}, e:{r:1,c:10}}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Schedule');
  const ws2 = XLSX.utils.aoa_to_sheet([histHead, ...his]);
  ws2['!cols'] = [5,48,32,12,20,22,22,14,18,34].map(w => ({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws2, 'History');
  XLSX.writeFile(wb, filename);
}

/* ============================================================
   Shared entry fields (used by the quick-log modal AND the "Log Lubrication Entry" form)
   ============================================================ */
const LUB_REQ = '<span style="color:var(--danger,#c0392b);">*</span>';
const lubDefaultActivity = rec => /oil/i.test(rec && rec.description || '') ? 'Oil Filling / Checking' : 'Greasing';

function lubEntryFieldsHtml(e){
  e = e || {};
  return `
    <div class="grid-3">
      <div class="f-item"><label>Date ${LUB_REQ}</label><input class="field" type="date" id="le_d" value="${escapeHtml(e.d || lubToday())}"></div>
      <div class="f-item"><label>Activity</label>
        <select class="sel" id="le_a">${LUB_ACTIVITIES.map(a => `<option ${a===(e.a||'Greasing')?'selected':''}>${a}</option>`).join('')}</select></div>
      <div class="f-item"><label>Order / Notification No.</label><input class="field" id="le_o" value="${escapeHtml(e.o||'')}" placeholder="e.g. 3089xxxxx"></div>
    </div>
    <div class="grid-3" style="margin-top:10px;">
      <div class="f-item"><label>Lubricant / Grade</label><input class="field" id="le_l" value="${escapeHtml(e.l||'')}" placeholder="e.g. Grease EP-2, Servo 68"></div>
      <div class="f-item"><label>Quantity</label><input class="field" id="le_q" value="${escapeHtml(e.q||'')}" placeholder="e.g. 60 g / bearing"></div>
      <div class="f-item"><label>Done By</label><input class="field" id="le_by" value="${escapeHtml(e.by||'')}"></div>
    </div>
    <div class="f-item" style="margin-top:10px;"><label>Remark</label><input class="field" id="le_r" value="${escapeHtml(e.r||'')}" placeholder="e.g. motor not running, bearing noise, extra grease needed…"></div>`;
}
function lubReadEntry(root){
  const g = id => ($('#'+id, root).value || '').trim();
  if(!g('le_d')){ toast('Select the date of lubrication.', true); return null; }
  const e = { d:g('le_d'), a:g('le_a'), o:g('le_o'), l:g('le_l'), q:g('le_q'), by:g('le_by'), r:g('le_r') };
  Object.keys(e).forEach(k => { if(!e[k]) delete e[k]; });     // never store empty fields (and never `undefined`)
  return e;
}

async function lubWriteHistory(id, hist){
  await cloudUpdateRecord(KEYS.lubEquip, id, { history: lubSortHist(hist) });
}

/* ---------------- Quick-log / edit-entry modal ---------------- */
function openLubEntryModal(rec, idx, after){
  const isEdit = idx !== null && idx !== undefined;
  const cur = isEdit ? (rec.history||[])[idx] : null;
  openModal({
    title: (isEdit ? 'Edit' : 'Log') + ' Lubrication Entry',
    submitLabel: isEdit ? 'Save Changes' : 'Save Entry',
    bodyHtml: `<div class="lub-eq-pill"><strong>${escapeHtml(rec.description)}</strong><small>${escapeHtml(rec.unit)} · ${escapeHtml(rec.funcLoc||'no functional location')}</small></div>`
      + lubEntryFieldsHtml(cur || { a: lubDefaultActivity(rec) }),
    onSubmit: async (ov) => {
      if(!isEditor){ requireEdit('save this entry', ()=>{}); return false; }
      const entry = lubReadEntry(ov); if(!entry) return false;
      const fresh = lubFind(rec.id);
      if(!fresh){ toast('This equipment no longer exists.', true); return false; }
      const h = (fresh.history || []).slice();
      if(isEdit){
        const old = h[idx];
        if(!old || (old.d||'') !== (cur.d||'') || (old.o||'') !== (cur.o||'')){
          toast('This entry was changed by someone else — close and reopen the history.', true); return false;
        }
        h[idx] = entry;
      } else h.push(entry);
      await lubWriteHistory(rec.id, h);
      toast(isEdit ? 'Lubrication entry updated.' : 'Lubrication entry saved.');
      render();                       // modals pause live refresh, so refresh the page behind explicitly
      if(after) after();
      return true;
    }
  });
}

/* ---------------- Full history modal for one equipment ---------------- */
function openLubHistoryModal(id){
  const first = lubFind(id); if(!first) return;
  let root = null;                       // the modal element (set in onMount, before the first draw)
  openModal({
    title: 'Lubrication History', wide: true, submitLabel: 'Close',
    bodyHtml: '<div id="lubHist"></div>',
    onSubmit: () => true,
    onMount: (o) => { root = o; const c = o.querySelector('.modal-foot [data-close]'); if(c) c.style.display = 'none'; draw(); }
  });
  function draw(){
    const rec = lubFind(id);
    const box = root ? $('#lubHist', root) : null; if(!box) return;
    if(!rec){ box.innerHTML = '<p class="hint">This equipment was deleted.</p>'; return; }
    const info = lubInfo(rec, lubToday());
    const rows = (rec.history||[]).map((e,i) => ({e, i}))
      .sort((a,b) => (b.e.d ? 1 : 0) - (a.e.d ? 1 : 0) || String(b.e.d||'').localeCompare(String(a.e.d||'')));
    box.innerHTML = `
      <div class="lub-eq-pill"><strong>${escapeHtml(rec.description)}</strong>
        <small>${escapeHtml(rec.unit)} · ${escapeHtml(rec.funcLoc||'no functional location')} · Interval: ${info.dur ? info.dur+' weeks'+((rec.durInferred||info.adjusted)?'*':'') : 'not set'}</small></div>
      <div style="display:flex;align-items:center;gap:10px;margin:10px 0;flex-wrap:wrap;">
        ${lubBadge(info)}
        <span class="fmeta">${rows.length} entr${rows.length===1?'y':'ies'}</span>
        <button class="btn btn-amber btn-sm" id="lhAdd" type="button" style="margin-left:auto;">${ICONS.plus} Add Entry</button>
      </div>
      ${rows.length ? `<div class="table-wrap compact" style="max-height:52vh;"><table class="dgrid compact"><thead><tr>
        <th>Date</th><th>Activity</th><th>Order No</th><th class="wrap">Lubricant</th><th>Qty</th><th class="wrap">Done By</th><th class="wrap">Remark</th><th>Actions</th>
      </tr></thead><tbody>${rows.map(({e,i}) => `<tr>
        <td style="white-space:nowrap;">${e.d ? lubFmt(e.d) : '<span class="lub-sub">no date</span>'}</td><td>${escapeHtml(e.a||'')}</td>
        <td class="lub-mono">${escapeHtml(e.o||'')}</td><td class="wrap">${escapeHtml(e.l||'')}</td><td>${escapeHtml(e.q||'')}</td>
        <td class="wrap">${escapeHtml(e.by||'')}</td><td class="wrap">${escapeHtml(e.r||'')}</td>
        <td style="white-space:nowrap;"><button class="btn btn-ghost btn-sm" data-he="${i}" type="button">Edit</button>
          <button class="btn btn-danger btn-sm" data-hd="${i}" type="button">${ICONS.trash}</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="hint">No lubrication recorded for this equipment yet.</p>'}`;
    $('#lhAdd', box).addEventListener('click', () => requireEdit('add an entry', () => openLubEntryModal(rec, null, draw)));
    $$('[data-he]', box).forEach(b => b.addEventListener('click', () =>
      requireEdit('edit this entry', () => openLubEntryModal(rec, +b.dataset.he, draw))));
    $$('[data-hd]', box).forEach(b => b.addEventListener('click', () => requireEdit('delete this entry', async () => {
      const i = +b.dataset.hd, entry = rec.history[i];
      if(!confirm('Delete this lubrication entry' + (entry && entry.d ? ' dated ' + lubFmt(entry.d) : '') + '?')) return;
      const fresh = lubFind(id); if(!fresh) return;
      const h = (fresh.history||[]).slice(), old = h[i];
      if(!old || (old.d||'') !== (entry.d||'') || (old.o||'') !== (entry.o||'')){ toast('This entry was changed by someone else — reopen the history.', true); return; }
      h.splice(i, 1);
      await lubWriteHistory(id, h);
      toast('Entry deleted.'); render(); draw();
    })));
  }
}

/* ---------------- Add / edit equipment modal ---------------- */
function openLubEquipModal(rec){
  const isEdit = !!rec;
  const r = rec || { unit: LUB.unit, description:'', funcLoc:'', duration:null, note:'' };
  openModal({
    title: isEdit ? 'Edit Equipment' : 'Add Equipment',
    submitLabel: isEdit ? 'Save Changes' : 'Add Equipment',
    bodyHtml: `
      <div class="grid-2">
        <div class="f-item"><label>Unit / Area ${LUB_REQ}</label><select class="sel" id="lq_unit">${LUB_UNITS.map(u => `<option ${u===r.unit?'selected':''}>${u}</option>`).join('')}</select></div>
        <div class="f-item"><label>Lubrication Interval (weeks)</label><input class="field" id="lq_dur" type="number" min="12" max="104" list="lubDurList" value="${r.duration||''}" placeholder="12 or more, e.g. 12, 24">
          <datalist id="lubDurList"><option value="12"><option value="24"><option value="26"><option value="52"></datalist></div>
      </div>
      <div class="f-item" style="margin-top:10px;"><label>Equipment Description ${LUB_REQ}</label><input class="field" id="lq_desc" value="${escapeHtml(r.description)}" placeholder="e.g. U#5 ID FAN-A MOTOR"></div>
      <div class="f-item" style="margin-top:10px;"><label>Functional Location</label><input class="field" id="lq_floc" value="${escapeHtml(r.funcLoc)}" placeholder="e.g. 1006-S3U05-BLR-IDF-IDA"></div>
      <div class="f-item" style="margin-top:10px;"><label>Note</label><input class="field" id="lq_note" value="${escapeHtml(r.note||'')}" placeholder="Optional — e.g. grease grade, special instruction"></div>
      ${isEdit ? '' : '<p class="hint" style="margin-top:10px;">After adding, use <b>Log</b> on the equipment row to record its lubrication dates.</p>'}`,
    onSubmit: async (ov) => {
      if(!isEditor){ requireEdit('save this equipment', ()=>{}); return false; }
      const g = id => ($('#'+id, ov).value || '').trim();
      if(!g('lq_desc')){ toast('Enter the equipment description.', true); return false; }
      const unit = g('lq_unit');
      const durNum = parseInt(g('lq_dur'), 10);
      const duration = Math.max(LUB_MIN_WEEKS, durNum > 0 ? durNum : LUB_MIN_WEEKS);   // minimum 12 weeks
      const maxOrder = u => Math.max(0, ...lubAll().filter(x => x.unit === u).map(x => x.order || 0));
      if(isEdit){
        const durChanged = (rec.duration || null) !== duration;
        await cloudUpdateRecord(KEYS.lubEquip, rec.id, {
          unit, description: g('lq_desc'), funcLoc: g('lq_floc'), note: g('lq_note'), duration,
          durInferred: durChanged ? false : !!rec.durInferred,
          order: unit === rec.unit ? (rec.order || 0) : maxOrder(unit) + 1
        });
        toast('Equipment updated.');
      } else {
        await cloudAddRecord(KEYS.lubEquip, { id: 'lub_' + uid(), unit, order: maxOrder(unit) + 1, description: g('lq_desc'),
          funcLoc: g('lq_floc'), duration, durInferred: false, note: g('lq_note'), history: [] });
        toast('Equipment added to ' + unit + '.');
      }
      LUB.unit = unit; LUB.q = ''; LUB.status = 'All';
      render();
      return true;
    }
  });
}

/* ============================================================
   Main section
   ============================================================ */
function renderLubrication(main){
  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.lube} Lubrication Details</h2>
        <div class="desc">Greasing / oil-filling schedule for motors, unit by unit — imported from the HT motor greasing sheets. Pick a unit, see when each motor was last lubricated and when it is next due, log new lubrication, or add equipment.</div></div>
    </div>
    <div class="mode-toggle" id="lubMode">
      <button data-mode="register">Equipment &amp; Schedule</button>
      <button data-mode="log">Log Lubrication Entry</button>
    </div>
    <div style="height:16px;"></div>
    <div id="lubBody"></div>`;
  const btns = $$('#lubMode button', main);
  btns.forEach(b => b.addEventListener('click', () => draw(b.dataset.mode)));

  function draw(mode){
    LUB.mode = mode;
    btns.forEach(x => x.classList.toggle('active', x.dataset.mode === mode));
    mode === 'log' ? drawLog() : drawRegister();
  }

  const unitOptions = (sel, counts) => LUB_UNITS.map(u =>
    `<option value="${u}" ${u===sel?'selected':''}>${u}${counts ? ' ('+(counts[u]||0)+')' : ''}</option>`).join('');
  const countsByUnit = () => { const c = {}; lubAll().forEach(r => c[r.unit] = (c[r.unit]||0) + 1); return c; };

  /* ---------------- Register ---------------- */
  function drawRegister(){
    const body = $('#lubBody', main);
    if(!lubLoaded()){
      body.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.lube}<h4>Loading lubrication data…</h4></div></div>`; return;
    }
    const all = lubAll();
    if(!all.length){
      body.innerHTML = `<div class="table-wrap"><div class="empty-state">${ICONS.lube}<h4>No lubrication data loaded yet</h4>
        <p>The starter data from the Excel sheets loads automatically the first time an editor signs in after this update.<br>Sign in to edit (top right) to load it.</p></div></div>`;
      return;
    }
    const today = lubToday();
    const counts = countsByUnit();
    const unitRecs = lubUnitList(LUB.unit);
    const seqOf = new Map(unitRecs.map((r,i) => [r.id, i+1]));
    const items = unitRecs.map(rec => ({ rec, info: lubInfo(rec, today), seq: seqOf.get(rec.id) }));
    const tally = { overdue:0, soon:0, ok:0, na:0 };
    items.forEach(it => { if(it.info.status==='norec' || it.info.status==='noint') tally.na++; else tally[it.info.status]++; });

    const q = LUB.q.trim().toLowerCase();
    const matchStatus = it => LUB.status==='All' || (LUB.status==='na' ? (it.info.status==='norec'||it.info.status==='noint') : it.info.status===LUB.status);
    const matchQ = it => !q || (it.rec.description+' '+(it.rec.funcLoc||'')+' '+(it.rec.note||'')+' '+it.info.hist.map(e=>e.o||'').join(' ')).toLowerCase().includes(q);
    let rows = items.filter(it => matchStatus(it) && matchQ(it));
    const far = 9e15;
    if(LUB.sort === 'due') rows.sort((a,b) => (a.info.next ? lubDay(a.info.next) : far) - (b.info.next ? lubDay(b.info.next) : far) || a.seq - b.seq);
    else if(LUB.sort === 'last') rows.sort((a,b) => (a.info.last ? lubDay(a.info.last.d) : -1) - (b.info.last ? lubDay(b.info.last.d) : -1) || a.seq - b.seq);
    else if(LUB.sort === 'name') rows.sort((a,b) => lubByName(a.rec.description, b.rec.description));

    const chip = (key, label, n) => `<button class="lub-chip ${key} ${LUB.status===key?'active':''}" data-st="${key}" type="button">${label} <b>${n}</b></button>`;

    const trs = rows.map(({rec, info, seq}) => {
      const interval = info.dur
        ? `<span title="${info.adjusted ? 'Minimum interval is '+LUB_MIN_WEEKS+' weeks — shown value is the minimum.' : (rec.durInferred ? 'Not given in the Excel sheet — inferred from past dates. Edit if different.' : '')}">${info.dur} W${(rec.durInferred||info.adjusted) ? '<sup>*</sup>' : ''}</span>`
        : '<span class="lub-sub">not set</span>';
      const last = info.last
        ? `${lubFmt(info.last.d)}${info.last.o ? `<div class="lub-sub lub-mono">${escapeHtml(info.last.o)}</div>` : ''}`
        : '<span class="lub-sub">—</span>';
      const next = (info.next ? lubFmt(info.next) : '<span class="lub-sub">—</span>')
        + (info.planned ? `<div class="lub-sub">Scheduled: ${lubFmt(info.planned.d)}</div>` : '');
      return `<tr>
        <td class="num">${seq}</td>
        <td class="wrap"><strong>${escapeHtml(rec.description)}</strong>${rec.note ? `<div class="lub-sub">${escapeHtml(rec.note)}</div>` : ''}</td>
        <td class="wrap lub-mono">${escapeHtml(rec.funcLoc || '—')}</td>
        <td style="white-space:nowrap;">${interval}</td>
        <td style="white-space:nowrap;">${last}</td>
        <td style="white-space:nowrap;">${next}</td>
        <td>${lubBadge(info)}</td>
        <td class="num">${info.count}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-amber btn-sm" data-log="${rec.id}" type="button" title="Record a lubrication done on this equipment">${ICONS.plus} Log</button>
          <button class="btn btn-ghost btn-sm" data-hist="${rec.id}" type="button">History</button>
          <button class="btn btn-ghost btn-sm" data-edit="${rec.id}" type="button">Edit</button>
          <button class="btn btn-danger btn-sm" data-del="${rec.id}" type="button" title="Delete this equipment">${ICONS.trash}</button>
        </td></tr>`;
    }).join('');

    body.innerHTML = `
      <div class="unit-bar">
        <label>Unit / Area</label>
        <select class="sel" id="lubUnit" style="min-width:210px;">${unitOptions(LUB.unit, counts)}</select>
        <input class="search-input" id="lubSearch" placeholder="Search description, location, order no…" value="${escapeHtml(LUB.q)}" style="min-width:240px;">
        <label style="margin-left:6px;">Sort</label>
        <select class="sel" id="lubSort">
          <option value="seq" ${LUB.sort==='seq'?'selected':''}>Sheet order</option>
          <option value="due" ${LUB.sort==='due'?'selected':''}>Next due (earliest first)</option>
          <option value="last" ${LUB.sort==='last'?'selected':''}>Last done (oldest first)</option>
          <option value="name" ${LUB.sort==='name'?'selected':''}>Name (A → Z)</option>
        </select>
        <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-amber btn-sm" id="lubAdd" type="button">${ICONS.plus} Add Equipment</button>
          <button class="btn btn-teal btn-sm" id="lubXlsx" type="button">${ICONS.download} Download Excel (.xlsx)</button>
        </span>
      </div>
      <div class="lub-chips">
        ${chip('All','All', items.length)}${chip('overdue','Overdue', tally.overdue)}${chip('soon','Due within '+LUB_SOON_DAYS+' d', tally.soon)}${chip('ok','OK', tally.ok)}${chip('na','No record / interval', tally.na)}
        <span class="fmeta" style="align-self:center;">${rows.length} of ${items.length} shown · as on ${lubFmt(today)}</span>
      </div>
      ${rows.length ? `<div class="topscroll"><div class="topscroll-inner"></div></div>
      <div class="table-wrap compact"><table class="dgrid compact"><thead><tr>
        <th>#</th><th class="wrap">Equipment</th><th class="wrap">Functional Location</th><th>Interval</th><th>Last Done</th><th>Next Due</th><th>Status</th><th>Entries</th><th>Actions</th>
      </tr></thead><tbody>${trs}</tbody></table></div>
      <p class="hint" style="margin-top:8px;">Next due = last lubrication date + interval. <sup>*</sup> Interval was blank, shorter than 12 weeks, or inferred — a minimum of 12 weeks applies to all equipment. Use Edit to set a longer interval.</p>`
      : `<div class="table-wrap"><div class="empty-state">${ICONS.lube}<h4>${items.length ? 'No equipment matches this filter' : 'No equipment in ' + escapeHtml(LUB.unit) + ' yet'}</h4>
          <p>${items.length ? 'Clear the search or choose "All".' : 'Use "Add Equipment" to list the equipment that is lubricated in this area.'}</p></div></div>`}`;

    $('#lubUnit', body).addEventListener('change', e => { LUB.unit = e.target.value; LUB.q = ''; LUB.status = 'All'; drawRegister(); });
    $('#lubSort', body).addEventListener('change', e => { LUB.sort = e.target.value; drawRegister(); });
    const search = $('#lubSearch', body);
    search.addEventListener('input', e => {
      LUB.q = e.target.value; const pos = e.target.selectionStart;
      drawRegister(); const s = $('#lubSearch', main); s.focus(); s.setSelectionRange(pos, pos);
    });
    $$('.lub-chip', body).forEach(c => c.addEventListener('click', () => { LUB.status = c.dataset.st; drawRegister(); }));
    $('#lubAdd', body).addEventListener('click', () => requireEdit('add equipment', () => openLubEquipModal(null)));
    $('#lubXlsx', body).addEventListener('click', () => lubDownloadExcel(LUB.unit, items, today));
    $$('[data-log]', body).forEach(b => b.addEventListener('click', () =>
      requireEdit('log a lubrication entry', () => { const r = lubFind(b.dataset.log); if(r) openLubEntryModal(r, null); })));
    $$('[data-hist]', body).forEach(b => b.addEventListener('click', () => openLubHistoryModal(b.dataset.hist)));
    $$('[data-edit]', body).forEach(b => b.addEventListener('click', () =>
      requireEdit('edit equipment', () => { const r = lubFind(b.dataset.edit); if(r) openLubEquipModal(r); })));
    $$('[data-del]', body).forEach(b => b.addEventListener('click', () => requireEdit('delete equipment', async () => {
      const r = lubFind(b.dataset.del); if(!r) return;
      const n = (r.history||[]).length;
      if(!confirm(`Delete "${r.description}" and its ${n} lubrication entr${n===1?'y':'ies'}? This cannot be undone.`)) return;
      await cloudDeleteRecord(KEYS.lubEquip, r.id);
      toast('Equipment deleted.'); render();
    })));
    if(rows.length) wireTopScroll(body);
  }

  /* ---------------- Log entry form ---------------- */
  function drawLog(){
    const body = $('#lubBody', main);
    if(!lubLoaded() || !lubAll().length){ drawRegister(); return; }
    const D = LUB.draft;
    const counts = countsByUnit();
    if(!LUB_UNITS.includes(LUB.logUnit)) LUB.logUnit = 'Unit 1';
    body.innerHTML = `
      <div class="form-card">
        <h3><span class="tagnum">LOG</span> Log Lubrication Entry</h3>
        <p class="hint">Choose the unit, then the equipment, and record what was done. The entry is added to that equipment's history and its next-due date updates automatically.</p>
        <div class="grid-3">
          <div class="f-item"><label>Unit / Area ${LUB_REQ}</label><select class="sel" id="lg_unit">${unitOptions(LUB.logUnit, counts)}</select></div>
          <div class="f-item"><label>Search equipment</label><input class="field" id="lg_search" placeholder="Type to narrow the list…" autocomplete="off"></div>
          <div class="f-item"><label>Equipment ${LUB_REQ} <span class="fmeta" id="lg_count"></span></label><select class="sel" id="lg_pick"></select></div>
        </div>
        <hr style="margin:16px 0;border:none;border-top:1px solid var(--paper-dim);">
        ${lubEntryFieldsHtml({})}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-amber" id="lgSave" type="button">${ICONS.plus} Save Lubrication Entry</button>
        </div>
      </div>
      <div id="lgRecent" style="margin-top:16px;"></div>`;

    /* keep half-typed values if a live refresh redraws the form */
    const fieldIds = ['le_d','le_a','le_o','le_l','le_q','le_by','le_r','lg_search'];
    fieldIds.forEach(id => {
      const el = $('#'+id, body); if(!el) return;
      if(D[id] !== undefined) el.value = D[id];
      el.addEventListener('input', () => D[id] = el.value);
      el.addEventListener('change', () => D[id] = el.value);
    });

    const pick = $('#lg_pick', body);
    let shown = [];
    function fillPicker(keep){
      const unit = $('#lg_unit', body).value, qq = $('#lg_search', body).value.trim().toLowerCase();
      const list = lubUnitList(unit);
      shown = list.map((r,i) => ({r, seq:i+1})).filter(x => !qq || (x.r.description+' '+(x.r.funcLoc||'')).toLowerCase().includes(qq));
      pick.innerHTML = `<option value="">— Select equipment —</option>` + shown.map(x =>
        `<option value="${x.r.id}">${x.seq}. ${escapeHtml(x.r.description)}${x.r.funcLoc ? ' — ' + escapeHtml(x.r.funcLoc) : ''}</option>`).join('');
      $('#lg_count', body).textContent = `(${shown.length} in ${unit})`;
      if(keep && shown.some(x => x.r.id === keep)) pick.value = keep;
    }
    fillPicker(D.lg_pick);

    function drawRecent(){
      const box = $('#lgRecent', body), rec = pick.value ? lubFind(pick.value) : null;
      if(!rec){ box.innerHTML = ''; return; }
      const info = lubInfo(rec, lubToday());
      const rows = lubSortHist(rec.history||[]).reverse().slice(0, 8);
      box.innerHTML = `<div class="form-card">
        <h3 style="margin-bottom:8px;">Recent lubrication — ${escapeHtml(rec.description)}</h3>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">${lubBadge(info)}
          <span class="fmeta">Interval: ${info.dur ? info.dur + ' weeks' + ((rec.durInferred||info.adjusted) ? '*' : '') : 'not set'}${info.next ? ' · next due ' + lubFmt(info.next) : ''}</span>
          <button class="btn btn-ghost btn-sm" id="lgFull" type="button" style="margin-left:auto;">Open full history</button></div>
        ${rows.length ? `<div class="table-wrap compact" style="max-height:none;"><table class="dgrid compact"><thead><tr><th>Date</th><th>Activity</th><th>Order No</th><th class="wrap">Lubricant</th><th>Qty</th><th class="wrap">Done By</th><th class="wrap">Remark</th></tr></thead><tbody>
          ${rows.map(e => `<tr><td style="white-space:nowrap;">${e.d ? lubFmt(e.d) : '—'}</td><td>${escapeHtml(e.a||'')}</td><td class="lub-mono">${escapeHtml(e.o||'')}</td><td class="wrap">${escapeHtml(e.l||'')}</td><td>${escapeHtml(e.q||'')}</td><td class="wrap">${escapeHtml(e.by||'')}</td><td class="wrap">${escapeHtml(e.r||'')}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="hint">Nothing recorded for this equipment yet.</p>'}</div>`;
      $('#lgFull', box).addEventListener('click', () => openLubHistoryModal(rec.id));
    }
    drawRecent();

    $('#lg_unit', body).addEventListener('change', e => { LUB.logUnit = e.target.value; D.lg_pick = ''; fillPicker(''); drawRecent(); });
    $('#lg_search', body).addEventListener('input', () => fillPicker(pick.value));
    pick.addEventListener('change', () => {
      D.lg_pick = pick.value; drawRecent();
      const r = pick.value ? lubFind(pick.value) : null;
      if(r && !D.le_a) $('#le_a', body).value = lubDefaultActivity(r);
    });

    $('#lgSave', body).addEventListener('click', async () => {
      if(!isEditor){ requireEdit('save this entry', ()=>{}); return; }
      const rec = pick.value ? lubFind(pick.value) : null;
      if(!rec){ toast('Select the equipment from the list.', true); return; }
      const entry = lubReadEntry(body); if(!entry) return;
      const h = (rec.history || []).slice(); h.push(entry);
      await lubWriteHistory(rec.id, h);
      toast('Lubrication entry saved for ' + rec.description + '.');
      LUB.draft = { lg_pick: rec.id };          // clear the entry fields, keep the equipment selected for the next one
      drawLog();
    });
  }

  draw(LUB.mode);
}
