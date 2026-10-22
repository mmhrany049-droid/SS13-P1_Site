// SS 12: when the profile is bound to the unified login (auth.unified), the HttpOnly session cookie authenticates —
// no id:secret, no Bearer token in JS. Older profiles keep the v7.1 «Student id:secret» registration.
// SS 7.1 ⇄ مرکز (admin site v2). Same file formats as the offline exchange (.sspack / .ssbulletin), sent over HTTP.
//   POST {hub}/api/students/register   {id, name, phone, grade, stream}        → {studentId, secret, hub}
//   POST {hub}/api/packs                Authorization: Student <id>:<secret>    → 201 | 409 (older)
//   GET  {hub}/api/bulletin/latest?since=<seq>                                  → bulletin | 204 (nothing newer)
//   GET  {hub}/api/health                                                       → {ok, name, bot}
import { buildPack, applyBulletin } from '../exchange.js';

const ERR = { 'mail-off': 'ایمیل مرکز هنوز راه‌اندازی نشده؛ به مسئول مرکز بگو.', 'no-email': 'برای این حساب در مرکز ایمیلی ثبت نشده.', 'bad-code': 'کد درست نیست یا منقضی شده.', 'too-many': 'تلاش زیاد؛ چند دقیقه صبر کن.', 'no-summary': 'اول یک بار همگام‌سازی کن تا مرکز خلاصه‌ات را داشته باشد.', 'bad-email': 'ایمیل معتبر نیست.', 'phone-taken': 'این شماره قبلاً با دستگاه دیگری ثبت شده؛ از مسئول مرکز بخواه «بازنشانی دستگاه» را بزند.', 'bad-phone': 'شماره موبایل معتبر نیست.', 'unauthorized': 'ثبت‌نام این دستگاه در مرکز معتبر نیست؛ دوباره «اتصال به مرکز» را بزن.', 'older-than-stored': 'مرکز فایل جدیدتری از تو دارد.', 'rate-limited': 'درخواست زیاد بود؛ چند دقیقه بعد دوباره امتحان کن.', 'registration-closed': 'ثبت‌نام آنلاین در این مرکز بسته است.', 'too-large': 'حجم فایل زیاد است.' };
export const hubError = e => ERR[e?.code] || (e?.offline ? 'به سرور مرکز وصل نشد. اینترنت یا آدرس را بررسی کن.' : e?.message || 'خطای ناشناخته');

let cachedConfig = null;
/** ./config.json lets whoever deploys the student site point it at the hub (no typing for students). */
export async function siteConfig() {
  if (cachedConfig) return cachedConfig;
  try { const r = await fetch('./config.json', { cache: 'no-store' }); cachedConfig = r.ok ? await r.json() : {}; } catch { cachedConfig = {}; }
  return cachedConfig;
}
export const hubUrlOf = (s, cfg = cachedConfig || {}) => String(s.settings?.syncUrl || cfg.hubUrl || '').replace(/\/+$/, '');

export function client(baseUrl, auth = null, { timeout = 15000 } = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    let r;
    try { r = await fetch(base + path, { method, signal: ctl.signal, cache: 'no-store', credentials: auth?.unified ? 'same-origin' : 'omit', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth?.studentId && auth?.secret ? { Authorization: `Student ${auth.studentId}:${auth.secret}` } : {}), ...(auth?.unified ? { 'X-SS-CSRF': '1' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); }
    catch (x) { const e = new Error('offline'); e.offline = true; throw e; } finally { clearTimeout(t); }
    if (r.status === 204 || r.status === 304) return null;
    let j = null; try { j = await r.json(); } catch { /* not json */ }
    if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.code = j?.error; e.status = r.status; throw e; }
    return j;
  };
  return {
    enabled: /^https?:\/\//.test(base), base,
    health: () => call('/api/health'),
    register: me => call('/api/students/register', { method: 'POST', body: me }),
    sendPack: pack => call('/api/packs', { method: 'POST', body: pack }),
    fetchBulletin: since => call(`/api/bulletin/latest${since ? `?since=${since}` : ''}`),
    // v8: email (Gmail) through the hub — the hub owns the mail account, students never see its password
    updateProfile: p => call('/api/students/profile', { method: 'POST', body: p }),
    emailCode: purpose => call('/api/students/email-code', { method: 'POST', body: { purpose } }),
    emailVerify: code => call('/api/students/email-verify', { method: 'POST', body: { code } }),
    emailReport: () => call('/api/students/email-report', { method: 'POST', body: {} }),
  };
}

/** Register this device/profile at the hub (needed for online sync and the Telegram bot). */
export async function registerAtHub(s, url) {
  const c = client(url); if (!c.enabled) throw Object.assign(new Error('آدرس مرکز باید با http:// یا https:// شروع شود.'), { code: 'bad-url' });
  const r = await c.register({ id: s.me.id, name: s.me.name, phone: s.account.phone, email: s.account.email || '', grade: s.me.grade, stream: s.me.stream });
  return { url: c.base, studentId: r.studentId, secret: r.secret, hubName: r.hub?.name || '', bot: r.hub?.bot || null, registeredAt: new Date().toISOString() };
}

/** One-tap sync: send my pack, then fetch the newest bulletin (only if newer than the one I have). */
export function mergeConcurrentState(base, latest, synced) {
  const same = (a, b) => {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return a === b; }
  };
  const merge = (before, local, remote) => {
    if (same(before, local)) return remote;
    if (Array.isArray(before) && Array.isArray(local) && Array.isArray(remote)) {
      const keyOf = x => x && (x.id ?? x.uid ?? x.key);
      const keyed = [...before, ...local, ...remote].every(x => keyOf(x) != null);
      if (!keyed) return local;
      const b = new Map(before.map(x => [keyOf(x), x]));
      const l = new Map(local.map(x => [keyOf(x), x]));
      const r = new Map(remote.map(x => [keyOf(x), x]));
      const out = [];
      for (const [key, value] of r) {
        if (b.has(key) && !l.has(key)) continue; // a local deletion wins
        out.push(b.has(key) && l.has(key) ? merge(b.get(key), l.get(key), value) : l.has(key) ? l.get(key) : value);
      }
      for (const [key, value] of l) if (!b.has(key) && !r.has(key)) out.push(value);
      return out;
    }
    if (before && local && remote && [before, local, remote].every(x => typeof x === 'object' && !Array.isArray(x))) {
      const out = { ...remote };
      for (const key of new Set([...Object.keys(before), ...Object.keys(local)])) {
        if (same(before[key], local[key])) continue;
        if (!(key in local)) delete out[key];
        else out[key] = key in before ? merge(before[key], local[key], remote[key]) : local[key];
      }
      return out;
    }
    return local;
  };
  return merge(base, latest, synced);
}

export async function syncNow(s, { send = true, getLatestState = () => s } = {}) {
  const srv = s.account?.server; if (!srv?.url) throw Object.assign(new Error('هنوز به مرکزی وصل نشده‌ای.'), { code: 'no-server' });
  const c = client(srv.url, srv); const log = []; let st = getLatestState() || s; let packedAt = null;
  if (send) { try { await c.sendPack(await buildPack(s)); packedAt = new Date().toISOString(); log.push('بسته‌ات فرستاده شد'); } catch (x) { if (x.code !== 'older-than-stored') throw x; } }
  st = getLatestState() || st;
  const b = await c.fetchBulletin(st.hub?.lastSeq || 0);
  st = getLatestState() || st;
  let summary = null;
  if (b) { const r = await applyBulletin(st, b); if (r.ok) { st = r.state; summary = r.summary; log.push('اطلاع‌رسانی تازه مرکز گرفته شد'); } else if (!r.stale) throw new Error(r.error); }
  else log.push('چیز تازه‌ای در مرکز نبود');
  return { state: { ...st, hub: { ...(st.hub || {}), ...(packedAt ? { lastPackAt: packedAt } : {}), lastSyncAt: new Date().toISOString(), lastSyncError: null } }, summary, log };
}

/** Authenticated hub client for this profile (null when not connected). */
export const hubClient = s => s.account?.server?.url ? client(s.account.server.url, s.account.server) : null;
/** Gmail compose link (fallback when there is no hub mail): opens a ready draft in the user's own Gmail. */
export const gmailCompose = ({ to = '', subject = '', body = '' }) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
