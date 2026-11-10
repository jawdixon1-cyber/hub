// Saved Christmas-lights quotes.
//
// Cloud (synced to every device) in the app_state table, two rows per quote:
//   lq-meta:<id>  every field except photos + a small cover photo (gallery / dashboard)
//   lq-data:<id>  just the photos: { angles, previews } (loaded when a quote is opened)
// The "draft" (quote in progress on this device) and the prep folder stay in
// this browser's IndexedDB. IndexedDB also keeps a local copy of each quote so
// the page works offline and opens instantly.

import { supabase } from './supabase';

const DB = 'hub-lights';
const STORE = 'quotes';
export const DRAFT_ID = 'draft';
const FOLDER_ID = 'prep-folder'; // the folder ChatGPT prep files get saved into
const META = 'lq-meta:';
const DATA = 'lq-data:';

let orgId = null;
export const setLightsOrg = (id) => { if (id) orgId = id; };

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}
const localPut = (q) => tx('readwrite', (s) => s.put(q));
const localGet = (id) => tx('readonly', (s) => s.get(id));
const localDel = (id) => tx('readwrite', (s) => s.delete(id));
const localAll = () => tx('readonly', (s) => s.getAll());

const isCloud = (id) => id && id !== DRAFT_ID && id !== FOLDER_ID;

// Small cover photo for the gallery (show photo first, then any photo).
function coverOf(q) {
  const sides = q.angles || [];
  return q.previews?.[0]?.image || sides.find((a) => a.ai?.image)?.ai.image
    || sides.find((a) => a.show && a.plain)?.plain || sides.find((a) => a.plain)?.plain || '';
}
function shrink(src, max = 420) {
  if (!src || typeof document === 'undefined') return Promise.resolve(src || '');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}
async function metaOf(q) {
  const { angles, previews, ...rest } = q; // eslint-disable-line no-unused-vars
  return { ...rest, cover: await shrink(coverOf(q)), sides: (angles || []).filter((a) => a.plain).length };
}

async function upsert(rows) {
  const payload = rows.map((r) => ({ ...r, ...(orgId ? { org_id: orgId } : {}) }));
  const { error } = await supabase.from('app_state').upsert(payload, { onConflict: 'key' });
  if (error) throw error;
}

// Photos only upload when they change; everything else saves every time (small).
const lastPhotos = new Map();
const photoSig = (q) => {
  const parts = [...(q.angles || []).flatMap((a) => [a.plain, a.marked, a.ai?.image]), ...(q.previews || []).map((p) => p.image)];
  return parts.map((x) => (x ? `${x.length}:${x.slice(-24)}` : '-')).join('|');
};

export async function putQuote(q) {
  await localPut(q);
  if (!isCloud(q.id)) return;
  const sig = photoSig(q);
  const rows = [{ key: META + q.id, value: await metaOf(q) }];
  if (lastPhotos.get(q.id) !== sig) rows.push({ key: DATA + q.id, value: { angles: q.angles || [], previews: q.previews || [] } });
  await upsert(rows);
  lastPhotos.set(q.id, sig);
}

export async function getQuote(id) {
  if (!isCloud(id)) return localGet(id);
  try {
    const { data, error } = await supabase.from('app_state').select('key, value').in('key', [META + id, DATA + id]);
    if (error) throw error;
    const meta = data.find((r) => r.key === META + id)?.value;
    const photos = data.find((r) => r.key === DATA + id)?.value || {};
    if (meta) {
      const { cover, sides, ...rest } = meta; // eslint-disable-line no-unused-vars
      const q = { ...rest, angles: photos.angles || [], previews: photos.previews || [] };
      lastPhotos.set(id, photoSig(q));
      localPut(q).catch(() => {});
      return q;
    }
  } catch { /* offline — fall back to this device */ }
  return localGet(id);
}

export async function deleteQuote(id) {
  await localDel(id).catch(() => {});
  if (!isCloud(id)) return;
  await supabase.from('app_state').delete().in('key', [META + id, DATA + id]);
}

export async function listQuotes() {
  try {
    const { data, error } = await supabase.from('app_state').select('key, value').like('key', `${META}%`);
    if (error) throw error;
    return (data || []).map((r) => r.value).filter(Boolean).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  } catch {
    const all = await localAll();
    return (all || []).filter((q) => isCloud(q.id)).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  }
}

// Quotes saved on this device before quotes synced to the account.
export async function localOnlyQuotes() {
  const all = (await localAll()).filter((q) => isCloud(q.id));
  if (!all.length) return [];
  const { data } = await supabase.from('app_state').select('key').like('key', `${META}%`);
  const inCloud = new Set((data || []).map((r) => r.key.slice(META.length)));
  return all.filter((q) => !inCloud.has(q.id));
}

// Remembered folder for "Prep all sides for ChatGPT" (a FileSystemDirectoryHandle).
export const getPrepFolder = () => localGet(FOLDER_ID).then((r) => r?.handle || null);
export const setPrepFolder = (handle) => localPut({ id: FOLDER_ID, handle });

// This device's copy (no network) — used by autosave to keep tracker fields.
export const getLocalQuote = (id) => localGet(id);
