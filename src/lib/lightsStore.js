// Saved Christmas-lights quotes, kept in this browser's IndexedDB (photos are
// too big for localStorage). One "draft" record autosaves the quote in
// progress; every saved client quote is its own record.

const DB = 'hub-lights';
const STORE = 'quotes';
export const DRAFT_ID = 'draft';
const FOLDER_ID = 'prep-folder'; // the folder ChatGPT prep files get saved into

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

export const putQuote = (q) => tx('readwrite', (s) => s.put(q));
export const getQuote = (id) => tx('readonly', (s) => s.get(id));
export const deleteQuote = (id) => tx('readwrite', (s) => s.delete(id));

export async function listQuotes() {
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).filter((q) => q.id !== DRAFT_ID && q.id !== FOLDER_ID).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

// Remembered folder for "Prep all sides for ChatGPT" (a FileSystemDirectoryHandle).
export const getPrepFolder = () => getQuote(FOLDER_ID).then((r) => r?.handle || null);
export const setPrepFolder = (handle) => putQuote({ id: FOLDER_ID, handle });
