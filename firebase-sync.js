/* ============================================================
   Firebase-backed data layer for the EM dashboard.
   Loaded BEFORE app.js. Defines the same function names the rest
   of the app already calls (LS_get, LS_set, idbPut, idbGet,
   idbDelete) — only what happens *underneath* those calls changes:
   every record becomes a real Firestore document, and every
   uploaded file becomes a real Firebase Storage object, so all of
   it is now shared live with everyone who opens this site.
   ============================================================ */

const LT_MOTORS_KEY = 'em_lt_motors';
const genId = () => 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);

let cloudDb = null;
let cloudAuth = null;

/* ---------------- Editor sign-in (this is the only account that can write) ----------------
   Everyone can VIEW the dashboard without signing in at all (Firestore rules allow public
   read). Only whoever knows the shared editor password can add/edit/delete anything — signing
   in uses one single, fixed Firebase account behind the scenes, so nobody needs to remember an
   email address, just the one password. */
const EDITOR_EMAIL = 'editor@em-dashboard.local';
let currentUser = null;
let isEditor = false;

async function signInEditor(password){
  await cloudAuth.signInWithEmailAndPassword(EDITOR_EMAIL, password);
  await seedCloudIfNeeded(); // harmless no-op if already seeded; catches the very first sign-in
  try{ await seedLubricationIfNeeded(); }catch(e){ console.error('Lubrication starter data load failed', e); }
}
async function signOutEditor(){
  await cloudAuth.signOut();
}

const CLOUD_CACHE = {};      // key -> array of {id, ...fields}
const CLOUD_LISTENERS = {};  // key -> true once a listener is attached

/* ---------------- Firestore-backed record store ---------------- */

function ensureListener(key){
  if(CLOUD_LISTENERS[key] || !cloudDb) return;
  CLOUD_LISTENERS[key] = true;
  cloudDb.collection(key).onSnapshot(
    snap => {
      CLOUD_CACHE[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Don't yank the page out from under someone mid-form-entry in a modal.
      const modalOpen = document.querySelector('.modal-overlay');
      if(typeof render === 'function' && !modalOpen) render();
    },
    err => console.error('Firestore listen error on', key, err)
  );
}

/* LT motors are stored as one flat collection with a __unit field per record
   (rather than nested per-unit) so every record is still its own independent
   document — the grouped {unit: [...]} shape the rest of the app expects is
   reconstructed here on read. */
function groupLtMotors(flatArr){
  const obj = {};
  flatArr.forEach(rec=>{
    const unit = rec.__unit || 'Unspecified';
    (obj[unit] = obj[unit] || []).push(rec);
  });
  return obj;
}
function flattenLtMotors(obj){
  const flat = [];
  Object.keys(obj||{}).forEach(unit=>{
    (obj[unit]||[]).forEach(rec => flat.push({ ...rec, __unit: unit }));
  });
  return flat;
}

function LS_get(key, fallback){
  ensureListener(key);
  const cached = CLOUD_CACHE[key];
  if(cached === undefined) return fallback;
  if(key === LT_MOTORS_KEY) return groupLtMotors(cached);
  return cached;
}

/* ---------------- Safe per-record operations (no read-modify-write race) ----------------
   LS_set (below) works by reading the current full list, comparing it to a new list, and
   writing the difference — which is only safe if the "current list" it read was actually
   complete and up to date. On a freshly opened page, the very first read can happen before
   the live listener has delivered real data yet, making the list look empty; if that
   (incomplete) list then gets used as the basis for a write, anything genuinely missing from
   it looks like it should be deleted — and gets deleted for real. That caused real data loss.
   These three functions avoid the whole problem: each only ever touches the ONE document it's
   actually working with, never needing to know or resend anything about its siblings. */
async function cloudAddRecord(key, record){
  if(!cloudDb) throw new Error('Not connected to the shared database yet — try again in a moment.');
  const id = record.id || genId();
  const { id: _drop, ...fields } = record;
  await cloudDb.collection(key).doc(id).set(fields);
  return id;
}
async function cloudUpdateRecord(key, id, patchFields){
  if(!cloudDb) throw new Error('Not connected to the shared database yet — try again in a moment.');
  await cloudDb.collection(key).doc(id).set(patchFields, { merge: true });
}
async function cloudDeleteRecord(key, id){
  if(!cloudDb) throw new Error('Not connected to the shared database yet — try again in a moment.');
  await cloudDb.collection(key).doc(id).delete();
}

async function LS_set(key, value){
  if(!cloudDb){ if(typeof toast==='function') toast('Not connected to the shared database yet — try again in a moment.', true); return false; }
  let arr = value;
  if(key === LT_MOTORS_KEY && value && !Array.isArray(value)){
    arr = flattenLtMotors(value);
  }
  arr = arr || [];

  const old = CLOUD_CACHE[key] || [];
  const oldMap = new Map(old.map(r => [r.id, r]));
  const newMap = new Map(arr.map(r => [r.id || genId(), r]));

  const ops = [];
  newMap.forEach((rec, id) => {
    const prev = oldMap.get(id);
    const withId = { ...rec, id };
    if(!prev || JSON.stringify(prev) !== JSON.stringify(withId)){
      const { id: _drop, ...fields } = withId;
      ops.push({ type:'set', ref: cloudDb.collection(key).doc(id), fields });
    }
  });
  oldMap.forEach((rec, id) => {
    if(!newMap.has(id)) ops.push({ type:'delete', ref: cloudDb.collection(key).doc(id) });
  });

  // Optimistic local update so the UI feels instant even before the network confirms.
  CLOUD_CACHE[key] = arr.map(r => ({ ...r, id: r.id || genId() }));

  for(let i=0; i<ops.length; i+=400){
    const batch = cloudDb.batch();
    ops.slice(i, i+400).forEach(o => o.type==='set' ? batch.set(o.ref, o.fields) : batch.delete(o.ref));
    try{ await batch.commit(); }
    catch(e){ console.error('Firestore write failed', key, e); if(typeof toast==='function') toast('Sync error — check your internet connection.', true); return false; }
  }
  return true;
}

/* ---------------- File storage (inside Firestore — no billing card required) ----------------
   Firebase Storage now requires the paid "Blaze" plan even for free-tier usage (a Google
   policy change from Feb 2026), so files are instead stored as base64 data directly inside
   Firestore documents. A single Firestore document caps out at ~1 MiB, so larger files are
   automatically split into ~650 KB chunks (each its own small document) and reassembled on
   download — transparent to the rest of the app, which just calls idbPut(id, file) and
   idbGet(id) exactly as before. This supports files up to 20 MB, still entirely on Firestore's
   free tier. */

const CHUNK_RAW_BYTES = 650 * 1024;   // raw bytes per chunk before base64 encoding
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function idbPut(id, file){
  if(file.size > MAX_FILE_BYTES){
    throw new Error(`"${file.name}" is ${(file.size/1024/1024).toFixed(1)} MB — the shared free-storage limit is 20 MB per file. Try a smaller or more compressed file.`);
  }
  if(!cloudDb) throw new Error('Not connected to the shared database yet — try again in a moment.');
  const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_RAW_BYTES));
  /* A single Firestore commit is capped at ~10 MiB of data. The old code put EVERY chunk of the
     file into ONE batch, so any file over ~7 MB (base64 makes it ~33% bigger) was rejected.
     Now chunks are committed in small groups (3 chunks ≈ 2.6 MB per commit), and the metadata
     document is written LAST, so a half-finished upload is never listed as a valid file. */
  const CHUNKS_PER_COMMIT = 3;
  try{
    for(let start=0; start<chunkCount; start+=CHUNKS_PER_COMMIT){
      const batch = cloudDb.batch();
      const end = Math.min(chunkCount, start+CHUNKS_PER_COMMIT);
      for(let i=start; i<end; i++){
        const slice = file.slice(i*CHUNK_RAW_BYTES, (i+1)*CHUNK_RAW_BYTES);
        const dataUrl = await blobToDataURL(slice);
        batch.set(cloudDb.collection('em_file_chunks').doc(`${id}_${i}`), { data: dataUrl });
      }
      await batch.commit();
      if(chunkCount > 6 && typeof toast==='function')
        toast(`Uploading "${file.name}"… ${Math.round(end/chunkCount*100)}%`);
    }
    await cloudDb.collection('em_file_blobs').doc(id).set({
      name: file.name, type: file.type || 'application/octet-stream', size: file.size, chunkCount,
    });
  }catch(e){
    console.error('File upload failed', e);
    // clean up any chunks that were already written
    try{
      for(let start=0; start<chunkCount; start+=400){
        const b = cloudDb.batch();
        for(let i=start; i<Math.min(chunkCount,start+400); i++) b.delete(cloudDb.collection('em_file_chunks').doc(`${id}_${i}`));
        await b.commit();
      }
    }catch(_){}
    throw new Error(`Upload of "${file.name}" failed (${e.code || e.message || 'network error'}). Please check your connection and try again.`);
  }
}

async function idbGet(id){
  const snap = await cloudDb.collection('em_file_blobs').doc(id).get();
  if(!snap.exists) throw new Error('File not found in the shared database.');
  const meta = snap.data();
  const chunkCount = meta.chunkCount || 1;
  const parts = new Array(chunkCount);
  const GROUP = 4;   // fetch a few chunks at a time — much faster than one by one
  for(let start=0; start<chunkCount; start+=GROUP){
    const idxs = [];
    for(let i=start; i<Math.min(chunkCount,start+GROUP); i++) idxs.push(i);
    await Promise.all(idxs.map(async i=>{
      const cSnap = await cloudDb.collection('em_file_chunks').doc(`${id}_${i}`).get();
      if(!cSnap.exists) throw new Error(`File is missing a piece (chunk ${i+1} of ${chunkCount}) — it may not have finished uploading.`);
      const resp = await fetch(cSnap.data().data);
      parts[i] = await resp.blob();
    }));
  }
  return new Blob(parts, { type: meta.type || 'application/octet-stream' });
}

async function idbDelete(id){
  try{
    const snap = await cloudDb.collection('em_file_blobs').doc(id).get();
    const chunkCount = snap.exists ? (snap.data().chunkCount || 1) : 1;
    const batch = cloudDb.batch();
    for(let i=0; i<chunkCount; i++){
      batch.delete(cloudDb.collection('em_file_chunks').doc(`${id}_${i}`));
    }
    batch.delete(cloudDb.collection('em_file_blobs').doc(id));
    await batch.commit();
  }catch(e){ /* already gone — fine */ }
}

/* ---------------- One-time, race-safe starter data seeding ---------------- */

const KEYS_HT_MOTORS = 'em_ht_motors';
const KEYS_HT_BEARINGS = 'em_ht_bearings';
const KEYS_LT_BEARINGS = 'em_lt_bearings';

async function bulkSeed(){
  const ops = [];
  const addRecords = (coll, records) => {
    records.forEach(rec => {
      const id = rec.id || genId();
      const { id:_drop, ...fields } = rec;
      ops.push({ coll, id, fields });
    });
  };
  addRecords(KEYS_HT_MOTORS, SEED_HT_MOTORS);
  addRecords(LT_MOTORS_KEY, flattenLtMotors(SEED_LT_MOTORS));
  addRecords(KEYS_HT_BEARINGS, SEED_HT_BEARINGS);
  addRecords(KEYS_LT_BEARINGS, SEED_LT_BEARINGS);

  for(let i=0; i<ops.length; i+=400){
    const batch = cloudDb.batch();
    ops.slice(i, i+400).forEach(o => batch.set(cloudDb.collection(o.coll).doc(o.id), o.fields));
    await batch.commit();
  }
}

async function seedCloudIfNeeded(){
  const metaRef = cloudDb.collection('em_meta').doc('init');
  const iAmSeeder = await cloudDb.runTransaction(async tx => {
    const snap = await tx.get(metaRef);
    if(snap.exists && snap.data().seeded) return false;
    tx.set(metaRef, { seeded: true, seededAt: firebase.firestore.FieldValue.serverTimestamp() });
    return true;
  });
  if(iAmSeeder) await bulkSeed();
}

/* ---------------- Lubrication Details: one-time starter data (from the Excel greasing sheets) ----------------
   Separate flag (em_meta/lub_init) from the main seed above, because the main seed has usually already
   run on an existing site. Guarded by a transaction so it can never run twice. Runs automatically the
   first time an editor is signed in after this update is deployed. */
const KEYS_LUB_EQUIP = 'em_lub_equipment';

async function bulkSeedLubrication(){
  const recs = (typeof SEED_LUB_EQUIPMENT !== 'undefined') ? SEED_LUB_EQUIPMENT : [];
  for(let i=0; i<recs.length; i+=100){          // small batches: each record carries its full history
    const batch = cloudDb.batch();
    recs.slice(i, i+100).forEach(rec=>{
      const { id, ...fields } = rec;
      batch.set(cloudDb.collection(KEYS_LUB_EQUIP).doc(id), fields);
    });
    await batch.commit();
  }
  return recs.length;
}

async function seedLubricationIfNeeded(){
  if(typeof SEED_LUB_EQUIPMENT === 'undefined' || !cloudDb) return false;
  const metaRef = cloudDb.collection('em_meta').doc('lub_init');
  const iAmSeeder = await cloudDb.runTransaction(async tx => {
    const snap = await tx.get(metaRef);
    if(snap.exists && snap.data().seeded) return false;
    tx.set(metaRef, { seeded: true, seededAt: firebase.firestore.FieldValue.serverTimestamp() });
    return true;
  });
  if(iAmSeeder){
    try{ await bulkSeedLubrication(); }
    catch(e){ await metaRef.delete().catch(()=>{}); throw e; }   // let the next sign-in retry
  }
  return iAmSeeder;
}

/* ---------------- Boot sequence ---------------- */

async function initCloudSync(){
  firebase.initializeApp(FIREBASE_CONFIG);
  cloudDb = firebase.firestore();
  cloudAuth = firebase.auth();
  // Deliberately NOT enabling offline persistence (IndexedDB-based) — browser privacy
  // features like Edge's "Tracking Prevention" or Safari's ITP can block that storage,
  // especially when the page is opened as a local file:// URL, which caused files/data
  // to appear to "disappear" for some users. The app works perfectly without it — it
  // just means no offline cache, every read talks to Firestore directly.
  cloudAuth.onAuthStateChanged(user => {
    currentUser = user;
    isEditor = !!user;
    document.body.classList.toggle('edit-mode', isEditor);
    if(typeof onAuthChange === 'function') onAuthChange(user);
    if(user){
      seedLubricationIfNeeded()
        .then(did => { if(did && typeof toast==='function') toast('Lubrication Details loaded from the Excel greasing sheets.'); })
        .catch(e => console.error('Lubrication starter data load failed', e));
    }
    if(typeof render === 'function' && document.getElementById('main')) render();
  });
  // Viewing works immediately with no sign-in at all (public read rule). Seeding only
  // happens once the editor actually signs in for the first time — see signInEditor().
}
