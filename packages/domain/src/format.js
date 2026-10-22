export const PACK = 'sspack', BULLETIN = 'ssbulletin', FORMAT_V = 3, MIN_GROUP = 3;
export function canonical(x) { if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']'; if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}'; return JSON.stringify(x ?? null); }
export async function sha256(t) { const b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function seal(o) { const { sum, ...r } = o; return { ...r, sum: await sha256(canonical(r)) }; }
export async function verify(o) { if (!o?.sum) return false; const { sum, ...r } = o; return sum === await sha256(canonical(r)); }
export function downloadJson(obj, filename) { const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
export const readJsonFile = f => f.text().then(t => JSON.parse(t));
