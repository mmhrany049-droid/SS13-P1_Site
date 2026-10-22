// Photos of exam answer sheets (v6). Images are large, so they live in IndexedDB (not localStorage);
// state only keeps their ids. Each photo is downscaled to ≤1600px JPEG (~150–400 KB).
const DB = 'ss-media', STORE = 'photos';
function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no-indexeddb'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };

/** Downscale an image File → JPEG data URL. */
export function shrinkImage(file, max = 1600, q = 0.72) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad-image')); };
    img.src = url;
  });
}
export async function putPhoto(dataUrl) { const id = 'ph-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await tx('readwrite', st => st.put({ dataUrl, at: new Date().toISOString() }, id)); return id; }
export async function getPhoto(id) { const db = await open(); return new Promise(res => { const r = db.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => res(r.result?.dataUrl || null); r.onerror = () => res(null); }); }
export async function deletePhoto(id) { await tx('readwrite', st => st.delete(id)); }
/** For the full backup: {id: dataUrl} of the given ids. */
export async function exportPhotos(ids) { const out = {}; for (const id of ids) { const d = await getPhoto(id).catch(() => null); if (d) out[id] = d; } return out; }
export async function importPhotos(map) { for (const [id, dataUrl] of Object.entries(map || {})) await tx('readwrite', st => st.put({ dataUrl, at: new Date().toISOString() }, id)); }
