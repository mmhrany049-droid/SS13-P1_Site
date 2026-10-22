// Multi-user on one device (v6). Each user has an isolated state under its own localStorage key.
// The very first user inherits the pre-v6 single-user data (key 'ss-v4'), so nothing is lost.
export const legacyKeys = { KEY: 'ss-v4', DEMO_KEY: 'ss-v4-demo', MODE_KEY: 'ss-v4-mode', V3_KEY: 'ss-prototype-v3' };
const REG = 'ss-users', CUR = 'ss-current-user';
const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
const read = k => { try { return JSON.parse(ls()?.getItem(k) ?? 'null'); } catch { return null; } };
const write = (k, v) => { try { ls()?.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

export function users() { return read(REG) || []; }
export function currentUserId() { try { return ls()?.getItem(CUR) || null; } catch { return null; } }
/** Storage key of the active user; 'ss-v4' for the first (legacy) user so old data loads unchanged. */
export function storageKey() {
  const id = currentUserId(); const u = users().find(x => x.id === id);
  return !u || u.legacy ? legacyKeys.KEY : `ss-v6:${u.id}`;
}
export function ensureFirstUser(name = 'کاربر ۱') {
  let us = users();
  if (!us.length) { us = [{ id: 'u-' + Date.now().toString(36), name, legacy: true, createdAt: new Date().toISOString() }]; write(REG, us); }
  if (!currentUserId() || !us.some(u => u.id === currentUserId())) { try { ls()?.setItem(CUR, us[0].id); } catch { /* */ } }
  return us;
}
export function addUser(name) {
  const u = { id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.trim() || 'کاربر جدید', createdAt: new Date().toISOString() };
  write(REG, [...users(), u]); return u;
}
export function renameUser(id, name) { write(REG, users().map(u => u.id === id ? { ...u, name } : u)); }
export function switchUser(id) { try { ls()?.setItem(CUR, id); } catch { /* */ } }
/** Deletes a user and their data (not the legacy first user's data key unless asked). */
export function removeUser(id) {
  const u = users().find(x => x.id === id); if (!u) return;
  try { ls()?.removeItem(u.legacy ? legacyKeys.KEY : `ss-v6:${u.id}`); } catch { /* */ }
  const rest = users().filter(x => x.id !== id); write(REG, rest);
  if (currentUserId() === id && rest[0]) switchUser(rest[0].id);
}
// 7.1: per-user meta in the registry (phone, PIN hash) so the login / lock screen works before a state is loaded
export function setUserMeta(id, patch) { write(REG, users().map(u => u.id === id ? { ...u, ...patch } : u)); }
const UNL = 'ss-unlocked';
export const isUnlocked = id => { try { return sessionStorage.getItem(UNL) === id; } catch { return true; } };
export const markUnlocked = id => { try { sessionStorage.setItem(UNL, id); } catch { /* */ } };
export const lockNow = () => { try { sessionStorage.removeItem(UNL); } catch { /* */ } };
// SS 12: a profile bound to a server account (unified login). Same id on every visit → same local data; no PIN,
// because the HttpOnly server session is the lock. Data from other local profiles on this device is untouched.
export function ensureBoundUser(serverUserId, name) {
  const id = 'srv-' + String(serverUserId).replace(/[^a-zA-Z0-9_-]/g, '');
  const us = users(); const cur = us.find(u => u.id === id);
  if (!cur) write(REG, [...us, { id, name: name || 'کاربر', serverUserId, createdAt: new Date().toISOString() }]);
  else if (name && cur.name !== name) write(REG, us.map(u => u.id === id ? { ...u, name } : u));
  switchUser(id); markUnlocked(id); return id;
}
