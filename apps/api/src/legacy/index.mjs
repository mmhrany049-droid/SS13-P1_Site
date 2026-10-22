#!/usr/bin/env node
// SS 12 — legacy hub core (was «SS Admin 5 / مرکز» in v10–v11). Kept intact so every v11 hub feature keeps working;
// in v12 it is mounted INSIDE the unified API (apps/api/src/app.mjs): identity comes from the single v12 session
// (opts.resolveAdmin), and the old admin cookie login is off unless flags.legacyAdminLogin. Bugs fixed in v12 are marked «v12 fix».
//   • admin site (dist/) + student site at /app/ (../student/dist or SS_APP_DIST)
//   • admin accounts: email + password (scrypt), roles (owner / manager / teacher), optional 2-step code (TOTP),
//     HttpOnly cookie sessions, lockout after failed logins, password reset by email, session list + revoke, audit log
//   • student accounts for SS 8: signup / login / forgot (email code) / verify email / change password, cloud backup,
//     messages to the hub, plan e-mails; legacy SS 7.1 registration (id:secret) still accepted
//   • Gmail (SMTP send + IMAP inbox read) with the App Password sealed on disk (AES-256-GCM)
//   • hub state stored on the server (was browser-only in v2), packs, bulletins, Telegram bot, backup / restore
//
//   node server/index.mjs        → http://localhost:8080
//   env: PORT · DATA_DIR · DIST_DIR · SS_APP_DIST · TRUST_PROXY=1 · PUBLIC_URL · SS_SECRET · CORS_ORIGINS · ADMIN_EMAIL + ADMIN_PASSWORD (first run)
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './db.mjs';
import { Bot, normPhone, defaultTelegram } from './telegram.mjs';
import { parseProxy, testProxy, proxyLink } from './proxy.mjs';
import * as SEC from '@ss/auth/security.mjs';
import * as MAIL from './mail.mjs';

export const VERSION = '13.0.0'; // v12 fix (S15): one version number for package, data and server
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 8080);
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));
const APP_DIST = path.resolve(process.env.SS_APP_DIST || path.join(ROOT, '..', 'student', 'dist'));
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY = 12 * 1024 * 1024;
const MIME_T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const ROLES = { owner: 'مالک', manager: 'مدیر', teacher: 'دبیر / مشاور' };
  const CAN = { // what each role may do
  owner: new Set(['*']),
  manager: new Set(['state:read', 'state:write', 'students:read', 'students:write', 'students:export', 'packs:read', 'mail:send', 'mail:config', 'mail:inbox', 'mail:outbox', 'telegram', 'bulletin', 'messages', 'audit']),
  teacher: new Set(['state:read', 'students:read', 'packs:read', 'mail:send', 'messages']),
};
const DAY = 864e5;

export function createHub({ dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'), log = console.log, startBot = true, mailTransport = null, resolveAdmin = null, resolveStudent = null, flags = { legacyAdminLogin: true, legacyStudentApi: true }, onAudit = null } = {}) {
  const db = new Store(dataDir); db.ensure('backups');
  const KEY = SEC.secretKey(db.dir);
  const cfg = () => db.read('config.json', { name: 'مرکز SS', registrationOpen: true, requireVerify: false, allowAnonymousPacks: false, cloudBackup: true, publicUrl: '', studentSiteUrl: '', mailDailyCap: 450, admin: null, sessions: {} });
  const setCfg = fn => db.update('config.json', cfg(), fn);
  const admins = () => db.read('admins.json', {}); const setAdmins = fn => db.update('admins.json', {}, fn);
  const sessions = () => db.read('sessions.json', {}); const setSessions = fn => db.update('sessions.json', {}, fn);
  const students = () => db.read('students.json', {}); const setStudents = fn => db.update('students.json', {}, fn);
  const now = () => new Date().toISOString();
  const uidOf = p => p + '-' + SEC.token(9).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);

  // ---- first run / migration from v2 (password-only admin) ----
  if (!Object.keys(admins()).length) {
    const legacy = cfg().admin; const email = SEC.normEmail(process.env.ADMIN_EMAIL);
    if (legacy?.hash) setAdmins(() => ({ 'adm-owner': { id: 'adm-owner', email: email || 'admin', name: 'مالک مرکز', role: 'owner', pw: legacy, createdAt: now(), legacy: true } }));
    else if (email && process.env.ADMIN_PASSWORD && !SEC.pwProblem(process.env.ADMIN_PASSWORD)) setAdmins(() => ({ 'adm-owner': { id: 'adm-owner', email, name: 'مالک مرکز', role: 'owner', pw: SEC.hashPw(process.env.ADMIN_PASSWORD), createdAt: now() } }));
  }

  // ---------- helpers ----------
  const canonical = x => Array.isArray(x) ? '[' + x.map(canonical).join(',') + ']' : x && typeof x === 'object' ? '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}' : JSON.stringify(x ?? null);
  const verify = o => { if (!o?.sum) return false; const { sum, ...rest } = o; return createHash('sha256').update(canonical(rest)).digest('hex') === sum; };
  const safeId = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const packs = new Map();
  const loadPacks = async () => { for (const n of await db.list('packs')) { const p = db.read('packs/' + n, null); if (p?.user?.id) packs.set(p.user.id, p); } };
  const latest = () => db.read('latest.json', null);
  const hubState = () => db.read('state.json', { rev: 0, hub: null });
  const classesOf = id => (hubState().hub?.classes || latest()?.classes || []).filter(c => (c.members || []).some(m => (m.id || m) === id));
  const announcementsFor = id => { const b = latest(); if (!b) return []; const cls = classesOf(id).map(c => c.id); return (b.announcements || []).filter(a => !a.classId || cls.includes(a.classId)); };
  const findStudentByPhone = phone => { const st = Object.values(students()).find(s => s.phone === phone); if (st) return { id: st.id, name: st.name }; for (const p of packs.values()) if (normPhone(p.user?.phone) === phone) return { id: p.user.id, name: p.user.name }; return null; };
  const bot = new Bot({ store: db, findStudentByPhone, packOf: id => packs.get(id) || null, announcementsFor, hubName: () => cfg().name, log });
  const audit = (who, action, target = '', ip = '') => { db.update('audit.json', [], a => [{ at: now(), who, action, target: String(target).slice(0, 200), ip }, ...a].slice(0, 3000)); onAudit?.({ who, action, target: String(target).slice(0, 200), ip }); };

  const ipLimit = SEC.limiter({ max: 60 }); const loginLimit = SEC.limiter({ max: 20 }); const mailLimit = SEC.limiter({ windowMs: DAY, max: 8 }); const msgLimit = SEC.limiter({ windowMs: DAY, max: 30 });
  const lock = SEC.lockout({ max: 5, lockMs: 15 * 60e3 });
  const ipOf = req => TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  const isHttps = req => TRUST_PROXY ? req.headers['x-forwarded-proto'] === 'https' : !!req.socket.encrypted;
  const originOf = req => cfg().publicUrl || process.env.PUBLIC_URL || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;

  const corsOrigins = () => (process.env.CORS_ORIGINS || cfg().corsOrigins || '').split(',').map(s => s.trim()).filter(Boolean);
  const cors = req => { const o = req.headers.origin; if (!o) return {}; const list = corsOrigins(); const ok = list.includes('*') || list.includes(o); return ok ? { 'Access-Control-Allow-Origin': list.includes('*') ? '*' : o, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' } : {}; };
  const send = (req, res, code, body, extra = {}) => { const data = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra }); res.end(data); };
  const readBody = req => new Promise((ok, bad) => { let n = 0; const ch = []; req.on('data', c => { n += c.length; if (n > MAX_BODY) { bad(Object.assign(new Error('too-large'), { status: 413 })); req.destroy(); } else ch.push(c); }); req.on('end', () => ok(Buffer.concat(ch).toString('utf8'))); req.on('error', bad); });
  const json = async req => { if (req._ssBody !== undefined) return req._ssBody || {}; try { return JSON.parse(await readBody(req) || 'null') || {}; } catch (e) { if (e.status) throw e; throw Object.assign(new Error('bad-json'), { status: 400 }); } };

  // ---------- sessions ----------
  function newSession(kind, uid, req, ttl) {
    const t = SEC.token(32); const id = SEC.sha(t);
    setSessions(ss => { const keep = Object.fromEntries(Object.entries(ss).filter(([, v]) => v.exp > Date.now())); keep[id] = { kind, uid, exp: Date.now() + ttl, createdAt: now(), lastSeen: now(), ip: ipOf(req), ua: String(req.headers['user-agent'] || '').slice(0, 160) }; return keep; });
    return t;
  }
  const sessionOf = (t, kind) => { if (!t) return null; const id = SEC.sha(t); const s = sessions()[id]; if (!s || s.kind !== kind || s.exp < Date.now()) return null; if (Date.now() - Date.parse(s.lastSeen) > 5 * 60e3) setSessions(ss => ss[id] ? { ...ss, [id]: { ...ss[id], lastSeen: now() } } : ss); return { id, ...s }; };
  const dropSessions = (pred) => setSessions(ss => Object.fromEntries(Object.entries(ss).filter(([k, v]) => !pred(k, v))));
  const adminOf = req => { const u = resolveAdmin?.(req); if (u) return u; if (!flags.legacyAdminLogin) return null; const t = SEC.parseCookies(req.headers.cookie).ss_admin; const s = sessionOf(t, 'admin'); if (!s) return null; const a = admins()[s.uid]; return a && !a.disabled ? { ...a, sid: s.id } : null; };
  const studentOf = req => {
    const u12 = resolveStudent?.(req); if (u12) return u12; // v12: the unified session (cookie) is accepted for the student endpoints
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) { const s = sessionOf(h.slice(7), 'student'); const st = s && students()[s.uid]; return st && st.status !== 'suspended' ? { ...st, sid: s.id } : null; }
    const m = /^Student ([a-zA-Z0-9_-]+):([a-f0-9]{32,})$/.exec(h); if (!m) return null; const st = students()[m[1]];
    return st?.secretHash && st.secretHash === SEC.sha(m[2]) && st.status !== 'suspended' ? st : null;
  };
  const pubAdmin = a => a && ({ id: a.id, email: a.email, name: a.name, role: a.role, roleFa: ROLES[a.role], totp: !!a.totp?.enabled, createdAt: a.createdAt, lastLoginAt: a.lastLoginAt || null, disabled: !!a.disabled, mustChange: !!a.mustChange, legacy: !!a.legacy });
  const pubStudent = s => s && ({ id: s.id, name: s.name, email: s.email || null, emailVerified: !!s.emailVerified, phone: s.phone || null, grade: s.grade, stream: s.stream, createdAt: s.registeredAt || null, status: s.status || 'active' });
  const can = (a, perm) => !!a && (CAN[a.role]?.has('*') || CAN[a.role]?.has(perm));
  const publicHub = () => { const tg = db.read('telegram.json', defaultTelegram()); const u = bot.status.username || tg.username; return { name: cfg().name, bot: u ? { username: u } : null, mail: mailReady(), requireVerify: !!cfg().requireVerify, registration: cfg().registrationOpen !== false }; };

  // ---------- mail ----------
  const mailCfg = () => db.read('mail.json', { provider: 'gmail', user: '', pass: null, fromName: '', ...MAIL.GMAIL, enabled: false, notifyEmail: '' });
  const mailReady = () => { const m = mailCfg(); return !!(m.enabled && m.user && m.pass) || !!mailTransport; };
  const sentToday = () => { const t0 = Date.now() - DAY; return db.read('outbox.json', []).filter(x => x.status === 'sent' && Date.parse(x.at) > t0).length; };
  const plainCfg = () => { const m = mailCfg(); return { ...m, pass: SEC.unseal(KEY, m.pass) }; };
  async function sendMail({ to, subject, text, html, kind = 'custom', by = 'system', replyTo }) {
    const list = [...new Set([].concat(to).map(SEC.normEmail).filter(Boolean))]; if (!list.length) return { sent: 0, failed: 0, error: 'no-recipient' };
    if (!mailReady()) return { sent: 0, failed: list.length, error: 'mail-off' };
    const m = plainCfg(); const from = m.user || 'noreply@ss.local'; let sent = 0, failed = 0, lastErr = null;
    for (const r of list) {
      if (sentToday() >= (+cfg().mailDailyCap || 450)) { failed++; lastErr = 'daily-cap'; continue; }
      const raw = MAIL.buildMime({ from, fromName: m.fromName || cfg().name, to: [r], subject, text, html, replyTo });
      let status = 'sent', error = null;
      try { if (mailTransport) await mailTransport({ from, to: [r], raw, subject }); else await MAIL.smtpSend(m, { from, to: [r], raw }); sent++; }
      catch (e) { status = 'failed'; error = e.message; failed++; lastErr = e.message; }
      db.update('outbox.json', [], a => [{ id: SEC.token(6), at: now(), to: r, subject: String(subject).slice(0, 200), kind, by, status, error }, ...a].slice(0, 1500));
    }
    return { sent, failed, error: lastErr };
  }
  const brand = () => cfg().name || 'SS';
  const T = {
    code: (title, code, why) => ({ subject: `${title} · ${brand()}`, html: MAIL.layout({ brand: brand(), title, body: `<p>${why}</p><p style="font-size:30px;font-weight:900;letter-spacing:6px;color:#1D5FA8;direction:ltr;text-align:center;margin:18px 0">${code}</p><p>این کد تا ۱۵ دقیقه معتبر است. اگر تو درخواست نکرده‌ای، این ایمیل را نادیده بگیر.</p>` }), text: `${why}\n\nکد: ${code}\n(۱۵ دقیقه معتبر)` }),
    link: (title, text, url, btn) => ({ subject: `${title} · ${brand()}`, html: MAIL.layout({ brand: brand(), title, body: `<p>${MAIL.escapeHtml(text)}</p>`, button: { text: btn, url }, footer: `اگر دکمه کار نکرد این آدرس را باز کن:<br><span dir="ltr">${MAIL.escapeHtml(url)}</span>` }), text: `${text}\n\n${url}` }),
    note: (title, text, footer = '') => ({ subject: title, html: MAIL.layout({ brand: brand(), title, body: MAIL.escapeHtml(text).split('\n').map(l => `<p style="margin:0 0 8px">${l || '&nbsp;'}</p>`).join(''), footer }), text }),
  };

  // ---------- packs ----------
  async function storePack(pack, { admin = false } = {}) {
    if (pack?.format !== 'sspack' || !verify(pack)) return [422, { error: 'invalid-pack' }];
    const id = safeId(pack.user?.id); if (!id) return [422, { error: 'no-user' }];
    const old = packs.get(id); if (old && old.createdAt >= pack.createdAt) return [409, { error: 'older-than-stored' }];
    if (pack.dossier) db.write(`dossiers/${id}.json`, { ...pack.dossier, receivedAt: now() }); // v4: student database (پرونده تحصیلی)
    db.write(`packs/${id}.json`, pack); packs.set(id, pack);
    const phone = normPhone(pack.user.phone);
    setStudents(s => { const cur = s[id] || { id, registeredAt: now(), via: admin ? 'file' : 'online' }; return { ...s, [id]: { ...cur, name: pack.user.name || cur.name, phone: phone || cur.phone || null, grade: pack.user.grade, stream: pack.user.stream, lastPackAt: pack.createdAt } }; });
    return [201, { id }];
  }

  // ---------- student auth helpers ----------
  const byEmail = email => Object.values(students()).find(s => s.email === email);
  const codeBox = () => { const c = SEC.code6(); return { c, box: { hash: SEC.sha(c), exp: Date.now() + 15 * 60e3, tries: 0 } }; };
  const checkCode = (box, code) => !!box && box.exp > Date.now() && box.tries < 5 && box.hash === SEC.sha(String(code || '').replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  async function sendVerify(st) { if (!mailReady() || !st.email) return false; const { c, box } = codeBox(); setStudents(s => ({ ...s, [st.id]: { ...s[st.id], verify: box } })); const t = T.code('تأیید ایمیل', c, `سلام ${MAIL.escapeHtml(st.name || '')}، برای تأیید ایمیلت در ${MAIL.escapeHtml(brand())} این کد را در برنامه بزن:`); const r = await sendMail({ to: st.email, ...t, kind: 'verify' }); return r.sent > 0; }

  // =====================================================================================
  async function api(req, res, url) {
    const p = url.pathname; const C = cors(req); const ip = ipOf(req);
    const out = (code, body, extra = {}) => send(req, res, code, body, { ...C, ...extra });
    if (req.method === 'OPTIONS') return out(204, null);
    if (p === '/api/catalog' && req.method === 'GET') { const L = hubState().hub?.catalog; return L && Object.keys(L).length ? out(200, { layer: L }) : out(204, null); }
    if (p === '/api/health') return out(200, { ok: true, version: VERSION, name: cfg().name, bot: publicHub().bot?.username || null, registration: cfg().registrationOpen !== false, mail: mailReady(), time: now() });

    // ===================== students (public, CORS) =====================
    if (p.startsWith('/api/auth/') || p.startsWith('/api/me/') || p === '/api/students/register' || p === '/api/packs' || p === '/api/bulletin/latest') {
      if (!flags.legacyStudentApi && p !== '/api/bulletin/latest') return out(410, { error: 'legacy-student-api-off' });
      if (p === '/api/bulletin/latest' && req.method === 'GET') { const b = latest(); if (!b) return out(204, null); const since = +url.searchParams.get('since') || 0; if (since && (b.seq || 0) <= since) return out(204, null); return send(req, res, 200, db.readRaw('latest.json'), C); }
      if (req.method !== 'GET' && ipLimit(ip)) return out(429, { error: 'rate-limited' });
      if (p === '/api/auth/signup' && req.method === 'POST') {
        if (cfg().registrationOpen === false) return out(403, { error: 'registration-closed' });
        const b = await json(req); const email = SEC.normEmail(b.email); const name = String(b.name || '').trim().slice(0, 80);
        if (!email) return out(422, { error: 'bad-email' }); if (name.length < 2) return out(422, { error: 'bad-name' });
        const prob = SEC.pwProblem(b.password, { email, name }); if (prob) return out(422, { error: 'weak-password', message: prob });
        if (byEmail(email)) return out(409, { error: 'email-taken' });
        const phone = b.phone ? normPhone(b.phone) : null;
        if (phone && Object.values(students()).some(s => s.phone === phone && s.email && s.email !== email)) return out(409, { error: 'phone-taken' });
        let id = safeId(b.id); if (!id || id.length < 8 || students()[id]) id = uidOf('st');
        const st = { ...(students()[id] || {}), id, name, email, emailVerified: false, phone, grade: b.grade, stream: b.stream, pw: SEC.hashPw(b.password), registeredAt: now(), via: 'account', status: 'active' };
        setStudents(s => ({ ...s, [id]: st })); audit('student:' + id, 'signup', email, ip);
        const mailed = await sendVerify(st).catch(() => false);
        if (mailReady()) { const t = T.note(`عضو جدید: ${name}`, `${name} (${email}) در ${brand()} ثبت‌نام کرد.`); const n = mailCfg().notifyEmail; if (n) sendMail({ to: n, ...t, kind: 'notify' }).catch(() => {}); }
        const token = newSession('student', id, req, 30 * DAY);
        return out(201, { token, student: pubStudent(students()[id]), hub: publicHub(), verifySent: mailed });
      }
      if (p === '/api/auth/login' && req.method === 'POST') {
        if (loginLimit('st:' + ip)) return out(429, { error: 'rate-limited' });
        const b = await json(req); const email = SEC.normEmail(b.email); const k = 'st:' + email;
        const left = lock.locked(k); if (left) return out(423, { error: 'locked', minutes: left });
        const st = email && byEmail(email);
        if (!st || !SEC.checkPw(b.password, st.pw)) { SEC.checkPw('x', null); lock.fail(k); audit('student:?', 'login-failed', email || '', ip); return out(401, { error: 'wrong-login' }); }
        if (st.status === 'suspended') return out(403, { error: 'suspended' });
        lock.ok(k); setStudents(s => ({ ...s, [st.id]: { ...s[st.id], lastLoginAt: now() } }));
        return out(200, { token: newSession('student', st.id, req, 30 * DAY), student: pubStudent(st), hub: publicHub() });
      }
      if (p === '/api/auth/forgot' && req.method === 'POST') {
        const b = await json(req); const email = SEC.normEmail(b.email); if (!email) return out(422, { error: 'bad-email' });
        if (!mailReady()) return out(503, { error: 'mail-off' });
        if (mailLimit('forgot:' + email)) return out(429, { error: 'rate-limited' });
        const st = byEmail(email);
        if (st && st.status !== 'suspended') { const { c, box } = codeBox(); setStudents(s => ({ ...s, [st.id]: { ...s[st.id], reset: box } })); await sendMail({ to: email, ...T.code('بازیابی رمز', c, 'برای ساختن رمز جدید، این کد را در صفحه ورود بزن:'), kind: 'reset' }); }
        return out(200, { ok: true }); // same answer for unknown emails (no account enumeration)
      }
      if (p === '/api/auth/reset' && req.method === 'POST') {
        const b = await json(req); const email = SEC.normEmail(b.email); const st = email && byEmail(email);
        if (!st || !checkCode(st.reset, b.code)) { if (st?.reset) setStudents(s => ({ ...s, [st.id]: { ...s[st.id], reset: { ...s[st.id].reset, tries: (s[st.id].reset.tries || 0) + 1 } } })); return out(422, { error: 'bad-code' }); }
        const prob = SEC.pwProblem(b.password, { email, name: st.name }); if (prob) return out(422, { error: 'weak-password', message: prob });
        setStudents(s => ({ ...s, [st.id]: { ...s[st.id], pw: SEC.hashPw(b.password), reset: null, emailVerified: true } }));
        dropSessions((_, v) => v.kind === 'student' && v.uid === st.id); lock.ok('st:' + email); audit('student:' + st.id, 'password-reset', email, ip);
        return out(200, { token: newSession('student', st.id, req, 30 * DAY), student: pubStudent(students()[st.id]), hub: publicHub() });
      }
      if (p === '/api/students/register' && req.method === 'POST') { // SS 7.1 legacy device registration
        if (cfg().registrationOpen === false) return out(403, { error: 'registration-closed' });
        const b = await json(req); const id = safeId(b?.id); const phone = normPhone(b?.phone);
        if (!id || id.length < 8) return out(422, { error: 'bad-id' }); if (!phone) return out(422, { error: 'bad-phone' });
        if (Object.values(students()).some(s => s.phone === phone && s.id !== id && (s.secretHash || s.email))) return out(409, { error: 'phone-taken' });
        const secret = SEC.token(24).replace(/[^a-zA-Z0-9]/g, ''); const hex = Buffer.from(secret).toString('hex').slice(0, 48);
        setStudents(s => ({ ...s, [id]: { ...(s[id] || {}), id, name: String(b.name || '').slice(0, 80), phone, grade: b.grade, stream: b.stream, secretHash: SEC.sha(hex), registeredAt: s[id]?.registeredAt || now(), via: 'online', status: s[id]?.status || 'active' } }));
        return out(201, { studentId: id, secret: hex, hub: publicHub() });
      }
      // ---- authenticated student ----
      const me = studentOf(req);
      if (p === '/api/packs' && req.method === 'POST') { const pack = await json(req); if (!me && !cfg().allowAnonymousPacks) return out(401, { error: 'unauthorized' }); if (me && pack?.user?.id !== me.id) return out(403, { error: 'wrong-user' }); const [code, body] = await storePack(pack); return out(code, body); }
      if (!me) return out(401, { error: 'unauthorized' });
      if (p === '/api/auth/me' && req.method === 'GET') { const unread = db.read('messages.json', []).filter(m => m.studentId === me.id && m.from === 'admin' && !m.read).length; return out(200, { student: pubStudent(me), hub: publicHub(), unread, hasBackup: db.exists(`backups/${me.id}.json`) }); }
      if (p === '/api/auth/logout' && req.method === 'POST') { if (me.sid) dropSessions(k => k === me.sid); return out(200, { ok: true }); }
      if (p === '/api/auth/verify' && req.method === 'POST') { const b = await json(req); if (me.emailVerified) return out(200, { ok: true }); if (!checkCode(me.verify, b.code)) { if (me.verify) setStudents(s => ({ ...s, [me.id]: { ...s[me.id], verify: { ...s[me.id].verify, tries: (s[me.id].verify.tries || 0) + 1 } } })); return out(422, { error: 'bad-code' }); } setStudents(s => ({ ...s, [me.id]: { ...s[me.id], emailVerified: true, verify: null } })); return out(200, { ok: true, student: pubStudent(students()[me.id]) }); }
      if (p === '/api/auth/verify/resend' && req.method === 'POST') { if (!me.email) return out(422, { error: 'bad-email' }); if (mailLimit('verify:' + me.id)) return out(429, { error: 'rate-limited' }); if (!mailReady()) return out(503, { error: 'mail-off' }); await sendVerify(me); return out(200, { ok: true }); }
      if (p === '/api/auth/password' && req.method === 'POST') {
        const b = await json(req); if (me.pw && !SEC.checkPw(b.old, me.pw)) return out(401, { error: 'wrong-password' });
        const prob = SEC.pwProblem(b.password, { email: me.email, name: me.name }); if (prob) return out(422, { error: 'weak-password', message: prob });
        setStudents(s => ({ ...s, [me.id]: { ...s[me.id], pw: SEC.hashPw(b.password) } })); dropSessions((k, v) => v.kind === 'student' && v.uid === me.id && k !== me.sid);
        if (me.email && mailReady()) sendMail({ to: me.email, ...T.note('رمزت عوض شد', 'رمز حساب SS تو همین الان عوض شد. اگر خودت نبودی فوراً با مسئول مرکز تماس بگیر.'), kind: 'security' }).catch(() => {});
        return out(200, { ok: true });
      }
      if (p === '/api/auth/profile' && req.method === 'POST') {
        const b = await json(req); const patch = {};
        if (b.name && String(b.name).trim().length >= 2) patch.name = String(b.name).trim().slice(0, 80);
        if (b.phone !== undefined) { const ph = b.phone ? normPhone(b.phone) : null; if (b.phone && !ph) return out(422, { error: 'bad-phone' }); patch.phone = ph; }
        if (b.grade) patch.grade = b.grade; if (b.stream) patch.stream = b.stream;
        if (b.email && SEC.normEmail(b.email) && SEC.normEmail(b.email) !== me.email) { const e = SEC.normEmail(b.email); if (byEmail(e)) return out(409, { error: 'email-taken' }); patch.email = e; patch.emailVerified = false; }
        setStudents(s => ({ ...s, [me.id]: { ...s[me.id], ...patch } })); if (patch.email) sendVerify(students()[me.id]).catch(() => {});
        return out(200, { student: pubStudent(students()[me.id]) });
      }
      if (p === '/api/me/backup') {
        if (cfg().cloudBackup === false) return out(403, { error: 'backup-off' });
        if (req.method === 'GET') { const raw = db.readRaw(`backups/${me.id}.json`); return raw ? send(req, res, 200, raw, C) : out(404, { error: 'not-found' }); }
        if (req.method === 'PUT' || req.method === 'POST') { const raw = await readBody(req); if (raw.length > 8 * 1024 * 1024) return out(413, { error: 'too-large' }); let o; try { o = JSON.parse(raw); } catch { return out(400, { error: 'bad-json' }); } if (o?.format !== 'ss-cloud-backup') return out(422, { error: 'bad-backup' }); db.writeRaw(`backups/${me.id}.json`, raw); setStudents(s => ({ ...s, [me.id]: { ...s[me.id], backupAt: now(), backupBytes: raw.length } })); return out(200, { ok: true, at: now() }); }
      }
      if (p === '/api/me/messages' && req.method === 'GET') { const list = db.read('messages.json', []).filter(m => m.studentId === me.id).slice(0, 200); db.update('messages.json', [], a => a.map(m => m.studentId === me.id && m.from === 'admin' ? { ...m, read: true } : m)); return out(200, { items: list.map(({ studentId, ...m }) => m) }); }
      if (p === '/api/me/messages' && req.method === 'POST') {
        const b = await json(req); const text = String(b.text || '').trim().slice(0, 4000); const subject = String(b.subject || 'پیام از برنامه SS').trim().slice(0, 150);
        if (text.length < 2) return out(422, { error: 'empty' }); if (msgLimit('msg:' + me.id)) return out(429, { error: 'rate-limited' });
        const m = { id: SEC.token(8), studentId: me.id, from: 'student', subject, text, at: now(), read: false };
        db.update('messages.json', [], a => [m, ...a].slice(0, 5000));
        let mailed = false; const n = mailCfg().notifyEmail || mailCfg().user;
        if (n && mailReady()) { const r = await sendMail({ to: n, ...T.note(`پیام از ${me.name}: ${subject}`, `${text}\n\n— ${me.name}${me.email ? ` · ${me.email}` : ''}${me.phone ? ` · ${me.phone}` : ''}`, 'برای پاسخ، از بخش «پیام‌ها» در سایت مدیریت جواب بده یا همین ایمیل را پاسخ بده.'), replyTo: me.emailVerified ? me.email : undefined, kind: 'student-message', by: 'student:' + me.id }); mailed = r.sent > 0; }
        return out(201, { ok: true, mailed });
      }
      if (p === '/api/me/email' && req.method === 'POST') {
        const b = await json(req); if (!me.email) return out(422, { error: 'no-email' }); if (cfg().requireVerify && !me.emailVerified) return out(403, { error: 'not-verified' });
        if (!mailReady()) return out(503, { error: 'mail-off' }); if (mailLimit('self:' + me.id)) return out(429, { error: 'rate-limited' });
        const title = String(b.subject || 'برنامه من').slice(0, 150); const text = String(b.text || '').slice(0, 20000);
        const r = await sendMail({ to: me.email, ...T.note(title, text, 'این ایمیل را خودت از برنامه SS درخواست کردی.'), kind: 'self', by: 'student:' + me.id });
        return r.sent ? out(200, { ok: true }) : out(502, { error: r.error || 'send-failed' });
      }
      // v8 compatibility aliases: the current student client uses these names.
      if (p === '/api/students/profile' && req.method === 'POST') {
        const b = await json(req); const patch = {};
        if (b.name) patch.name = String(b.name).trim().slice(0, 80);
        if (b.email !== undefined) { const e = SEC.normEmail(b.email); if (!e) return out(422, { error: 'bad-email' }); if (byEmail(e) && byEmail(e).id !== me.id) return out(409, { error: 'email-taken' }); patch.email = e; patch.emailVerified = false; }
        if (b.phone !== undefined) patch.phone = b.phone ? normPhone(b.phone) : null;
        setStudents(s => ({ ...s, [me.id]: { ...s[me.id], ...patch } })); return out(200, { ok: true });
      }
      if (p === '/api/students/email-code' && req.method === 'POST') { if (!me.email || !mailReady()) return out(409, { error: !me.email ? 'no-email' : 'mail-off' }); await sendVerify(me); return out(200, { ok: true }); }
      if (p === '/api/students/email-verify' && req.method === 'POST') { if (!checkCode(me.verify, (await json(req)).code)) return out(401, { error: 'bad-code' }); setStudents(s => ({ ...s, [me.id]: { ...s[me.id], emailVerified: true, verify: null } })); return out(200, { ok: true }); }
      if (p === '/api/students/email-report' && req.method === 'POST') { const pk = packs.get(me.id); if (!pk?.summary) return out(409, { error: 'no-summary' }); if (!me.email || !mailReady()) return out(409, { error: 'mail-off' }); const r = await sendMail({ to: me.email, ...T.note('گزارش مطالعه SS', JSON.stringify(pk.summary, null, 2)), kind: 'report', by: 'student:' + me.id }); return r.sent ? out(200, { ok: true }) : out(502, { error: r.error || 'send-failed' }); }
      return out(404, { error: 'not-found' });
    }

    // ===================== admin =====================
    if (!p.startsWith('/api/admin/')) return out(404, { error: 'not-found' });
    const A = (code, body, extra) => send(req, res, code, body, extra); // admin API is same-origin only (no CORS)
    if (req.method !== 'GET' && req.headers['x-ss-admin'] !== '1') return A(403, { error: 'csrf' });
    const me = adminOf(req);
    const setCookie = (t, ttl) => ({ 'Set-Cookie': SEC.cookie('ss_admin', t, { maxAge: ttl, secure: isHttps(req) }) });
    if (p === '/api/admin/status') return A(200, { setup: Object.keys(admins()).length > 0 || !!resolveAdmin, authed: !!me, me: pubAdmin(me), version: VERSION, name: cfg().name, appMounted: existsSync(path.join(APP_DIST, 'index.html')), mail: mailReady(), roles: ROLES });
    if (!flags.legacyAdminLogin && ['/api/admin/setup', '/api/admin/login', '/api/admin/forgot', '/api/admin/reset'].includes(p)) return A(410, { error: 'use-unified-login' }); // v12: one identity, one login
    if (p === '/api/admin/setup' && req.method === 'POST') {
      if (Object.keys(admins()).length) return A(409, { error: 'already-setup' });
      const b = await json(req); const email = SEC.normEmail(b.email); if (!email) return A(422, { error: 'bad-email' });
      const prob = SEC.pwProblem(b.password, { email, min: 10 }); if (prob) return A(422, { error: 'weak-password', message: prob });
      const a = { id: 'adm-owner', email, name: String(b.name || 'مالک مرکز').slice(0, 80), role: 'owner', pw: SEC.hashPw(b.password), createdAt: now(), lastLoginAt: now() };
      setAdmins(() => ({ [a.id]: a })); if (b.hubName) setCfg(c => ({ ...c, name: String(b.hubName).slice(0, 80) })); audit(a.email, 'setup', '', ip);
      return A(201, { me: pubAdmin(a) }, setCookie(newSession('admin', a.id, req, 12 * 3600e3), 12 * 3600e3));
    }
    if (p === '/api/admin/login' && req.method === 'POST') {
      if (loginLimit('adm:' + ip)) return A(429, { error: 'rate-limited' });
      const b = await json(req); const ident = String(b.email || '').trim().toLowerCase(); const k = 'adm:' + ident;
      const left = lock.locked(k); if (left) return A(423, { error: 'locked', minutes: left });
      const a = Object.values(admins()).find(x => x.email === ident);
      if (!a || !SEC.checkPw(b.password, a.pw)) { lock.fail(k); audit(ident || '?', 'login-failed', '', ip); return A(401, { error: 'wrong-login' }); }
      if (a.disabled) return A(403, { error: 'disabled' });
      if (a.totp?.enabled) { if (!b.code) return A(401, { error: 'totp-required' }); if (!SEC.totpCheck(a.totp.secret, b.code)) { lock.fail(k); return A(401, { error: 'bad-code' }); } }
      lock.ok(k); const ttl = b.remember ? 30 * DAY : 12 * 3600e3;
      setAdmins(x => ({ ...x, [a.id]: { ...x[a.id], lastLoginAt: now() } })); audit(a.email, 'login', '', ip);
      return A(200, { me: pubAdmin(a) }, setCookie(newSession('admin', a.id, req, ttl), ttl));
    }
    if (p === '/api/admin/forgot' && req.method === 'POST') {
      const b = await json(req); const email = SEC.normEmail(b.email); if (!email) return A(422, { error: 'bad-email' }); if (!mailReady()) return A(503, { error: 'mail-off' });
      if (mailLimit('admforgot:' + email)) return A(429, { error: 'rate-limited' });
      const a = Object.values(admins()).find(x => x.email === email);
      if (a && !a.disabled) { const t = SEC.token(24); setAdmins(x => ({ ...x, [a.id]: { ...x[a.id], reset: { hash: SEC.sha(t), exp: Date.now() + 30 * 60e3 } } })); await sendMail({ to: email, ...T.link('بازیابی رمز سایت مدیریت', 'برای ساختن رمز جدید روی دکمه بزن. این لینک ۳۰ دقیقه معتبر است و فقط یک بار کار می‌کند.', `${originOf(req)}/#/reset?token=${t}`, 'ساختن رمز جدید'), kind: 'admin-reset' }); audit(email, 'forgot', '', ip); }
      return A(200, { ok: true });
    }
    if (p === '/api/admin/reset' && req.method === 'POST') {
      const b = await json(req); const h = SEC.sha(String(b.token || '')); const a = Object.values(admins()).find(x => x.reset?.hash === h && x.reset.exp > Date.now());
      if (!a) return A(422, { error: 'bad-token' }); const prob = SEC.pwProblem(b.password, { email: a.email, min: 10 }); if (prob) return A(422, { error: 'weak-password', message: prob });
      setAdmins(x => ({ ...x, [a.id]: { ...x[a.id], pw: SEC.hashPw(b.password), reset: null, mustChange: false } })); dropSessions((_, v) => v.kind === 'admin' && v.uid === a.id); audit(a.email, 'password-reset', '', ip);
      return A(200, { ok: true });
    }
    if (!me) return A(401, { error: 'admin-only' });
    const who = me.email; const need = perm => { if (!can(me, perm)) { A(403, { error: 'forbidden' }); return false; } return true; };
    if (me.mustChange && !['/api/admin/me/password', '/api/admin/me/profile', '/api/admin/logout'].includes(p)) return A(403, { error: 'must-change-password' });

    // ---- my account ----
    if (p === '/api/admin/logout' && req.method === 'POST') { dropSessions(k => k === me.sid); return A(200, { ok: true }, { 'Set-Cookie': SEC.cookie('ss_admin', '', { maxAge: 0 }) }); }
    if (p === '/api/admin/me/password' && req.method === 'POST') { const b = await json(req); if (!SEC.checkPw(b.old, me.pw)) return A(401, { error: 'wrong-password' }); const prob = SEC.pwProblem(b.password, { email: me.email, min: 10 }); if (prob) return A(422, { error: 'weak-password', message: prob }); setAdmins(x => ({ ...x, [me.id]: { ...x[me.id], pw: SEC.hashPw(b.password), mustChange: false, legacy: false } })); dropSessions((k, v) => v.kind === 'admin' && v.uid === me.id && k !== me.sid); audit(who, 'password-change', '', ip); return A(200, { ok: true }); }
    if (p === '/api/admin/me/profile' && req.method === 'POST') { const b = await json(req); const patch = {}; if (b.name) patch.name = String(b.name).slice(0, 80); if (b.email !== undefined) { const e = SEC.normEmail(b.email); if (!e) return A(422, { error: 'bad-email' }); if (Object.values(admins()).some(x => x.email === e && x.id !== me.id)) return A(409, { error: 'email-taken' }); patch.email = e; patch.legacy = false; } setAdmins(x => ({ ...x, [me.id]: { ...x[me.id], ...patch } })); audit(who, 'profile', JSON.stringify(patch), ip); return A(200, { me: pubAdmin(admins()[me.id]) }); }
    if (p === '/api/admin/me/totp/setup' && req.method === 'POST') { const secret = SEC.newTotpSecret(); setAdmins(x => ({ ...x, [me.id]: { ...x[me.id], totpPending: secret } })); return A(200, { secret, url: SEC.otpauthUrl(secret, me.email, `SS ${cfg().name}`) }); }
    if (p === '/api/admin/me/totp/enable' && req.method === 'POST') { const b = await json(req); const sec = admins()[me.id].totpPending; if (!sec || !SEC.totpCheck(sec, b.code)) return A(422, { error: 'bad-code' }); setAdmins(x => ({ ...x, [me.id]: { ...x[me.id], totp: { secret: sec, enabled: true, at: now() }, totpPending: null } })); audit(who, '2fa-on', '', ip); return A(200, { ok: true }); }
    if (p === '/api/admin/me/totp/disable' && req.method === 'POST') { const b = await json(req); if (!SEC.checkPw(b.password, me.pw)) return A(401, { error: 'wrong-password' }); setAdmins(x => ({ ...x, [me.id]: { ...x[me.id], totp: null } })); audit(who, '2fa-off', '', ip); return A(200, { ok: true }); }
    if (p === '/api/admin/me/sessions' && req.method === 'GET') return A(200, { items: Object.entries(sessions()).filter(([, v]) => v.kind === 'admin' && v.uid === me.id && v.exp > Date.now()).map(([k, v]) => ({ id: k.slice(0, 16), current: k === me.sid, createdAt: v.createdAt, lastSeen: v.lastSeen, ip: v.ip, ua: v.ua, exp: new Date(v.exp).toISOString() })) });
    if (p === '/api/admin/me/sessions/revoke' && req.method === 'POST') { const b = await json(req); dropSessions((k, v) => v.kind === 'admin' && v.uid === me.id && k !== me.sid && (b.id === 'others' || k.startsWith(String(b.id || '-')))); audit(who, 'sessions-revoke', b.id, ip); return A(200, { ok: true }); }

    // ---- team (owner) ----
    if (p === '/api/admin/admins' && req.method === 'GET') { if (!need('team')) return; return A(200, { items: Object.values(admins()).map(pubAdmin), roles: ROLES }); }
    if (p === '/api/admin/admins' && req.method === 'POST') {
      if (!need('team')) return; const b = await json(req); const email = SEC.normEmail(b.email); if (!email) return A(422, { error: 'bad-email' }); if (!ROLES[b.role] || b.role === 'owner') return A(422, { error: 'bad-role' });
      if (Object.values(admins()).some(x => x.email === email)) return A(409, { error: 'email-taken' });
      const temp = 'Ss' + SEC.token(9).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '7'; const id = uidOf('adm');
      setAdmins(x => ({ ...x, [id]: { id, email, name: String(b.name || email).slice(0, 80), role: b.role, pw: SEC.hashPw(temp), mustChange: true, createdAt: now(), invitedBy: who } })); audit(who, 'admin-add', `${email} (${b.role})`, ip);
      let mailed = false; if (mailReady()) { const r = await sendMail({ to: email, ...T.link(`دعوت به سایت مدیریت ${brand()}`, `${me.name} تو را با نقش «${ROLES[b.role]}» اضافه کرد. رمز موقت: ${temp} (بعد از اولین ورود عوضش کن)`, originOf(req), 'ورود به سایت مدیریت'), kind: 'invite', by: who }); mailed = r.sent > 0; }
      return A(201, { id, tempPassword: temp, mailed });
    }
    let m = p.match(/^\/api\/admin\/admins\/([a-zA-Z0-9_-]+)\/(role|disable|enable|delete)$/);
    if (m && req.method === 'POST') { if (!need('team')) return; const [, id, act] = m; const t = admins()[id]; if (!t) return A(404, { error: 'not-found' }); if (t.role === 'owner') return A(403, { error: 'owner-protected' }); const b = await json(req);
      if (act === 'role') { if (!ROLES[b.role] || b.role === 'owner') return A(422, { error: 'bad-role' }); setAdmins(x => ({ ...x, [id]: { ...x[id], role: b.role } })); }
      if (act === 'disable' || act === 'enable') { setAdmins(x => ({ ...x, [id]: { ...x[id], disabled: act === 'disable' } })); if (act === 'disable') dropSessions((_, v) => v.kind === 'admin' && v.uid === id); }
      if (act === 'delete') { setAdmins(x => { const y = { ...x }; delete y[id]; return y; }); dropSessions((_, v) => v.kind === 'admin' && v.uid === id); }
      audit(who, 'admin-' + act, t.email + (b.role ? ' → ' + b.role : ''), ip); return A(200, { ok: true }); }

    // ---- center settings ----
    if (p === '/api/admin/config') {
      if (req.method === 'GET') { const c = cfg(); return A(200, { name: c.name, registrationOpen: c.registrationOpen !== false, requireVerify: !!c.requireVerify, allowAnonymousPacks: !!c.allowAnonymousPacks, cloudBackup: c.cloudBackup !== false, publicUrl: c.publicUrl || '', studentSiteUrl: c.studentSiteUrl || '', corsOrigins: c.corsOrigins || '', /* v12 fix (S10): the server default is empty (same-origin only); the UI used to show «*» */ mailDailyCap: c.mailDailyCap || 450 }); }
      if (!need('config')) return; const b = await json(req);
      setCfg(c => ({ ...c, ...['name', 'registrationOpen', 'requireVerify', 'allowAnonymousPacks', 'cloudBackup', 'publicUrl', 'studentSiteUrl', 'corsOrigins', 'mailDailyCap'].reduce((a, k) => b[k] !== undefined ? { ...a, [k]: b[k] } : a, {}) })); audit(who, 'config', Object.keys(b).join(','), ip); return A(200, { ok: true });
    }
    if (p === '/api/admin/overview' && req.method === 'GET') {
      const st = Object.values(students()); const t7 = Date.now() - 7 * DAY; const msgs = db.read('messages.json', []);
      return A(200, { students: st.length, accounts: st.filter(s => s.email).length, verified: st.filter(s => s.emailVerified).length, active7: st.filter(s => Date.parse(s.lastPackAt || s.lastLoginAt || 0) > t7).length, suspended: st.filter(s => s.status === 'suspended').length, packs: packs.size, unreadMessages: msgs.filter(x => x.from === 'student' && !x.read).length, mail: mailReady(), sentToday: sentToday(), mailCap: cfg().mailDailyCap || 450, bulletinSeq: latest()?.seq || 0, bot: bot.status.state, recent: db.read('audit.json', []).slice(0, 8) });
    }
    // ---- hub state (books, classes, exams…) now lives on the server ----
    if (p === '/api/admin/state') {
      if (req.method === 'GET') { if (!need('state:read')) return; return A(200, hubState()); }
      if (!need('state:write')) return; const b = await json(req); const cur = hubState();
      if (b.rev !== cur.rev && !b.force) return A(409, { error: 'conflict', rev: cur.rev, savedBy: cur.savedBy, savedAt: cur.savedAt });
      const next = { rev: (cur.rev || 0) + 1, savedAt: now(), savedBy: who, hub: b.hub }; db.write('state.json', next); return A(200, { rev: next.rev, savedAt: next.savedAt });
    }
    if (p === '/api/admin/packs' && req.method === 'GET') { if (!need('packs:read')) return; const full = url.searchParams.get('full') === '1'; return A(200, { items: [...packs.values()].map(x => full ? x : { id: x.user.id, name: x.user.name, createdAt: x.createdAt }) }); }
    if (p === '/api/admin/packs' && req.method === 'POST') { if (!need('state:write')) return; const [code, body] = await storePack(await json(req), { admin: true }); return A(code, body); }
    m = p.match(/^\/api\/admin\/packs\/([a-zA-Z0-9_-]+)$/); if (m && req.method === 'GET') { const x = packs.get(m[1]); return x ? A(200, x) : A(404, { error: 'not-found' }); }

    // ---- students ----
    if (p === '/api/admin/students' && req.method === 'GET') {
      if (!need('students:read')) return;
      const links = db.read('telegram.json', defaultTelegram()).links || {}; const msgs = db.read('messages.json', []);
      return A(200, { items: Object.values(students()).map(s => ({ ...pubStudent(s), via: s.via, registeredAt: s.registeredAt, lastLoginAt: s.lastLoginAt || null, lastPackAt: s.lastPackAt || null, backupAt: s.backupAt || null, online: !!(s.secretHash || s.pw), hasPassword: !!s.pw, telegram: Object.values(links).some(l => l.studentId === s.id), hasSummary: !!packs.get(s.id)?.summary, unread: msgs.filter(x => x.studentId === s.id && x.from === 'student' && !x.read).length, classes: classesOf(s.id).map(c => c.name) })) });
    }
    if (p === '/api/admin/students.csv' && req.method === 'GET') {
      if (!need('students:export')) return;
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`; const rows = [['id', 'name', 'email', 'verified', 'phone', 'grade', 'stream', 'status', 'registered', 'lastPack'], ...Object.values(students()).map(s => [s.id, s.name, s.email, s.emailVerified ? 'yes' : 'no', s.phone, s.grade, s.stream, s.status || 'active', s.registeredAt, s.lastPackAt])];
      audit(who, 'students-export', '', ip); return send(req, res, 200, '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\r\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ss-students.csv"' });
    }
    m = p.match(/^\/api\/admin\/students\/([a-zA-Z0-9_-]+)\/(suspend|activate|reset|delete|verify|send-reset|summary)$/);
    if (m) {
      const [, id, act] = m; const st = students()[id]; if (!st) return A(404, { error: 'not-found' });
      if (act === 'summary' && req.method === 'GET') { if (!need('students:read')) return; const pk = packs.get(id); return A(200, { student: pubStudent(st), dossier: pk?.dossier || null, summary: pk?.summary || null, stats: (pk?.stats || []).slice(0, 60), results: pk?.results || [], books: (pk?.books || []).map(b => ({ title: b.title, publisher: b.publisher, subject: b.subject })), packAt: pk?.createdAt || null, messages: db.read('messages.json', []).filter(x => x.studentId === id).slice(0, 50) }); }
      if (req.method !== 'POST') return A(405, { error: 'method' }); if (!need('students:write')) return;
      if (act === 'suspend' || act === 'activate') { setStudents(s => ({ ...s, [id]: { ...s[id], status: act === 'suspend' ? 'suspended' : 'active' } })); if (act === 'suspend') dropSessions((_, v) => v.kind === 'student' && v.uid === id); }
      if (act === 'reset') { setStudents(s => ({ ...s, [id]: { ...s[id], secretHash: null, resetAt: now() } })); dropSessions((_, v) => v.kind === 'student' && v.uid === id); }
      if (act === 'verify') setStudents(s => ({ ...s, [id]: { ...s[id], emailVerified: true, verify: null } }));
      if (act === 'send-reset') { if (!st.email) return A(422, { error: 'no-email' }); if (!mailReady()) return A(503, { error: 'mail-off' }); const { c, box } = codeBox(); setStudents(s => ({ ...s, [id]: { ...s[id], reset: { ...box, exp: Date.now() + 24 * 3600e3 } } })); const r = await sendMail({ to: st.email, ...T.code('ساختن رمز جدید', c, `مسئول مرکز برای حسابت درخواست رمز جدید فرستاد. در صفحه ورود «رمز را فراموش کردم» را بزن و این کد را وارد کن (۲۴ ساعت معتبر):`), kind: 'reset', by: who }); if (!r.sent) return A(502, { error: r.error || 'send-failed' }); }
      if (act === 'delete') { setStudents(s => { const x = { ...s }; delete x[id]; return x; }); packs.delete(id); await db.remove(`packs/${id}.json`); await db.remove(`backups/${id}.json`); dropSessions((_, v) => v.kind === 'student' && v.uid === id); db.update('messages.json', [], a => a.filter(x => x.studentId !== id)); }
      audit(who, 'student-' + act, `${st.name} (${st.email || st.phone || id})`, ip); return A(200, { ok: true });
    }

    // ---- messages (student ⇄ hub) ----
    if (p === '/api/admin/messages' && req.method === 'GET') { if (!need('messages')) return; const st = students(); const all = db.read('messages.json', []); const by = {}; for (const x of all) (by[x.studentId] ||= []).push(x); return A(200, { threads: Object.entries(by).map(([sid, list]) => ({ studentId: sid, name: st[sid]?.name || '—', email: st[sid]?.email || null, last: list[0], unread: list.filter(x => x.from === 'student' && !x.read).length, items: list.slice(0, 100) })).sort((a, z) => z.last.at.localeCompare(a.last.at)) }); }
    m = p.match(/^\/api\/admin\/messages\/([a-zA-Z0-9_-]+)(\/read)?$/);
    if (m && req.method === 'POST') {
      if (!need('messages')) return; const id = m[1]; const st = students()[id]; if (!st) return A(404, { error: 'not-found' });
      if (m[2]) { db.update('messages.json', [], a => a.map(x => x.studentId === id && x.from === 'student' ? { ...x, read: true } : x)); return A(200, { ok: true }); }
      const b = await json(req); const text = String(b.text || '').trim().slice(0, 4000); if (!text) return A(422, { error: 'empty' });
      const msg = { id: SEC.token(8), studentId: id, from: 'admin', by: me.name, subject: String(b.subject || 'پاسخ مرکز').slice(0, 150), text, at: now(), read: false };
      db.update('messages.json', [], a => [msg, ...a.map(x => x.studentId === id && x.from === 'student' ? { ...x, read: true } : x)].slice(0, 5000));
      let mailed = false; if (b.email !== false && st.email && mailReady()) { const r = await sendMail({ to: st.email, ...T.note(`${msg.subject} · ${brand()}`, `${text}\n\n— ${me.name}`, 'این پیام در بخش «پیام‌ها»ی برنامه SS هم هست.'), kind: 'reply', by: who }); mailed = r.sent > 0; }
      audit(who, 'message', st.name, ip); return A(201, { ok: true, mailed });
    }

    // ---- mail (Gmail) ----
    if (p === '/api/admin/mail' && req.method === 'GET') { const x = mailCfg(); return A(200, { ...x, pass: undefined, hasPass: !!x.pass, ready: mailReady(), sentToday: sentToday(), cap: cfg().mailDailyCap || 450 }); }
    if (p === '/api/admin/mail' && req.method === 'POST') {
      if (!need('mail:config')) return; const b = await json(req);
      db.update('mail.json', mailCfg(), x => ({ ...x, ...['provider', 'user', 'fromName', 'smtpHost', 'smtpPort', 'imapHost', 'imapPort', 'enabled', 'notifyEmail'].reduce((a, k) => b[k] !== undefined ? { ...a, [k]: typeof b[k] === 'string' ? b[k].trim() : b[k] } : a, {}), ...(b.pass ? { pass: SEC.seal(KEY, String(b.pass).replace(/\s/g, '')) } : {}) }));
      audit(who, 'mail-config', b.user || '', ip); return A(200, { ok: true, ready: mailReady() });
    }
    if (p === '/api/admin/mail/test' && req.method === 'POST') { if (!need('mail:config')) return; const b = await json(req); const to = SEC.normEmail(b.to) || me.email; if (!mailReady()) return A(503, { error: 'mail-off' }); const r = await sendMail({ to, ...T.note('ایمیل آزمایشی', `اتصال Gmail سایت مدیریت ${brand()} درست کار می‌کند ✅`), kind: 'test', by: who }); return r.sent ? A(200, { ok: true, to }) : A(502, { error: r.error }); }
    if (p === '/api/admin/mail/send' && req.method === 'POST') {
      if (!need('mail:send')) return; const b = await json(req); const st = students(); let ids = [];
      if (Array.isArray(b.studentIds)) ids = b.studentIds; if (b.classId) ids = [...ids, ...((hubState().hub?.classes || []).find(c => c.id === b.classId)?.members || []).map(x => x.id || x)]; if (b.all) ids = Object.keys(st);
      const subject = String(b.subject || '').trim().slice(0, 150); const text = String(b.text || '').trim().slice(0, 20000); if (!subject || !text) return A(422, { error: 'empty' });
      const targets = [...new Set(ids)].map(i => st[i]).filter(s => s?.email && s.status !== 'suspended'); const extra = [].concat(b.emails || []).map(SEC.normEmail).filter(Boolean);
      if (!targets.length && !extra.length) return A(422, { error: 'no-recipient' }); if (!mailReady()) return A(503, { error: 'mail-off' });
      let sent = 0, failed = 0, error = null;
      for (const s of targets) { const body = text.replace(/\{نام\}|\{name\}/g, s.name || ''); const r = await sendMail({ to: s.email, ...T.note(subject, body), kind: 'broadcast', by: who }); sent += r.sent; failed += r.failed; error ||= r.error; if (b.copyToApp !== false) db.update('messages.json', [], a => [{ id: SEC.token(8), studentId: s.id, from: 'admin', by: me.name, subject, text: body, at: now(), read: false }, ...a].slice(0, 5000)); }
      for (const e of extra) { const r = await sendMail({ to: e, ...T.note(subject, text), kind: 'custom', by: who }); sent += r.sent; failed += r.failed; error ||= r.error; }
      const skipped = [...new Set(ids)].length - targets.length; audit(who, 'mail-send', `${subject} → ${sent}`, ip); return A(200, { sent, failed, skipped, error });
    }
    if (p === '/api/admin/mail/outbox' && req.method === 'GET') { if (!need('mail:outbox')) return; return A(200, { items: db.read('outbox.json', []).slice(0, 300) }); }
    if (p === '/api/admin/mail/inbox' && req.method === 'GET') { if (!need('mail:inbox')) return; if (!mailReady() || mailTransport) return A(503, { error: 'mail-off' }); try { return A(200, await MAIL.inbox(plainCfg(), { limit: Math.min(50, +url.searchParams.get('limit') || 25) })); } catch (e) { return A(502, { error: e.message }); } }
    m = p.match(/^\/api\/admin\/mail\/inbox\/(\d+)$/);
    if (m && req.method === 'GET') { if (!need('mail:inbox')) return; try { const msg = await MAIL.message(plainCfg(), +m[1]); return msg ? A(200, msg) : A(404, { error: 'not-found' }); } catch (e) { return A(502, { error: e.message }); } }

    // ---- bulletin / backup ----
    if (p === '/api/admin/bulletin' && req.method === 'GET') { const b = latest(); return A(200, { seq: b?.seq || 0, createdAt: b?.createdAt || null }); }
    if (p === '/api/admin/bulletin' && req.method === 'POST') {
      if (!need('bulletin')) return; const b = await json(req); if (b?.format !== 'ssbulletin' || !verify(b) || b.partial) return A(422, { error: 'invalid-bulletin' });
      const cur = latest(); if ((b.seq || 0) <= (cur?.seq || 0)) return A(409, { error: 'stale-seq', seq: cur?.seq || 0 });
      const raw = JSON.stringify(b); db.writeRaw(`bulletins/${String(b.seq).padStart(6, '0')}.json`, raw); db.writeRaw('latest.json', raw);
      let notified = 0, mailed = 0; const tg = db.read('telegram.json', defaultTelegram()); const prevIds = new Set((cur?.announcements || []).map(a => a.id)); const fresh = (b.announcements || []).filter(a => !prevIds.has(a.id));
      if (tg.notifyOnPublish && bot.status.state === 'running') for (const a of fresh) { const ids = a.classId ? (b.classes.find(c => c.id === a.classId)?.members || []).map(x => x.id || x) : null; notified += await bot.broadcast(`📣 ${a.title}\n\n${a.text || ''}`, ids); }
      if (b.emailAnnouncements && mailReady()) for (const a of fresh) { const ids = a.classId ? (b.classes.find(c => c.id === a.classId)?.members || []).map(x => x.id || x) : Object.keys(students()); for (const s of ids.map(i => students()[i]).filter(s => s?.email && s.status !== 'suspended')) mailed += (await sendMail({ to: s.email, ...T.note(`📣 ${a.title}`, a.text || ''), kind: 'announcement', by: who })).sent; }
      audit(who, 'bulletin', `#${b.seq}`, ip); return A(201, { seq: b.seq, notified, mailed });
    }
    if (p === '/api/admin/audit' && req.method === 'GET') { if (!need('audit')) return; return A(200, { items: db.read('audit.json', []).slice(0, 500) }); }
    if (p === '/api/admin/backup' && req.method === 'GET') { if (!need('backup')) return; audit(who, 'backup', '', ip); return A(200, { format: 'ss-hub-backup', version: VERSION, at: now(), config: { ...cfg(), admin: undefined, sessions: undefined }, state: hubState(), students: Object.fromEntries(Object.entries(students()).map(([k, v]) => [k, { ...v, verify: undefined, reset: undefined }])), packs: [...packs.values()], latest: latest(), messages: db.read('messages.json', []), telegram: { ...db.read('telegram.json', defaultTelegram()), token: undefined } }); }
    if (p === '/api/admin/restore' && req.method === 'POST') {
      if (!need('backup')) return; const b = await json(req); if (b?.format !== 'ss-hub-backup') return A(422, { error: 'not-a-backup' });
      if (b.state) db.write('state.json', { ...b.state, rev: (hubState().rev || 0) + 1 });
      if (b.students) db.write('students.json', b.students); if (b.messages) db.write('messages.json', b.messages);
      for (const x of b.packs || []) if (x?.user?.id) { db.write(`packs/${safeId(x.user.id)}.json`, x); packs.set(x.user.id, x); }
      if (b.latest) db.writeRaw('latest.json', JSON.stringify(b.latest));
      if (b.telegram) db.update('telegram.json', defaultTelegram(), t => ({ ...t, ...b.telegram, token: t.token }));
      if (b.config) setCfg(c => ({ ...c, name: b.config.name ?? c.name, registrationOpen: b.config.registrationOpen ?? c.registrationOpen, studentSiteUrl: b.config.studentSiteUrl ?? c.studentSiteUrl }));
      audit(who, 'restore', '', ip); return A(200, { ok: true, packs: (b.packs || []).length });
    }

    // ---- telegram ----
    if (p.startsWith('/api/admin/telegram') && !need('telegram')) return;
    if (p === '/api/admin/telegram' && req.method === 'GET') { const t = db.read('telegram.json', defaultTelegram()); const st = students(); return A(200, { ...t, token: t.token ? t.token.slice(0, 6) + '…' + t.token.slice(-4) : '', hasToken: !!t.token, status: bot.status, links: Object.entries(t.links || {}).map(([chat, l]) => ({ chat, ...l, name: st[l.studentId]?.name || l.name })), proxies: (t.proxies || []).map(x => ({ ...x, link: proxyLink(x) })) }); }
    if (p === '/api/admin/telegram' && req.method === 'POST') {
      const b = await json(req);
      db.update('telegram.json', defaultTelegram(), t => ({ ...t, ...(b.token !== undefined && b.token !== '' ? { token: String(b.token).trim(), username: null, offset: 0 } : {}), ...['enabled', 'notifyOnPublish', 'welcome', 'proxyMode', 'activeProxyId'].reduce((a, k) => b[k] !== undefined ? { ...a, [k]: b[k] } : a, {}) }));
      if (b.token !== undefined || b.enabled !== undefined || b.proxyMode !== undefined || b.activeProxyId !== undefined) { if (db.read('telegram.json', defaultTelegram()).enabled) bot.restart(); else bot.stop(); }
      audit(who, 'telegram', Object.keys(b).filter(k => k !== 'token').join(',') + (b.token ? ',token' : ''), ip); return A(200, { ok: true, status: bot.status });
    }
    if (p === '/api/admin/telegram/proxies' && req.method === 'POST') {
      const b = await json(req); const r = b?.link ? parseProxy(b.link) : parseProxy(`${b?.type === 'http' ? 'http' : 'socks5'}://${b?.user ? `${encodeURIComponent(b.user)}:${encodeURIComponent(b.pass || '')}@` : ''}${b?.host}:${b?.port}`);
      if (r.error) return A(422, { error: r.error });
      const px = { ...r.proxy, name: String(b.name || '').slice(0, 40), share: !!b.share };
      db.update('telegram.json', defaultTelegram(), t => ({ ...t, proxies: [...(t.proxies || []).filter(x => !(x.host === px.host && x.port === px.port && x.type === px.type)), px] }));
      return A(201, { proxy: px });
    }
    m = p.match(/^\/api\/admin\/telegram\/proxies\/([a-f0-9-]+)(?:\/(test|delete|update))?$/);
    if (m && req.method === 'POST') {
      const id = m[1]; const t = db.read('telegram.json', defaultTelegram()); const px = (t.proxies || []).find(x => x.id === id); if (!px) return A(404, { error: 'not-found' });
      if (m[2] === 'test') { const r = await testProxy(px, t.token); db.update('telegram.json', defaultTelegram(), x => ({ ...x, proxies: x.proxies.map(y => y.id === id ? { ...y, lastTest: { ...r, at: now() } } : y) })); return A(200, r); }
      if (m[2] === 'delete') { db.update('telegram.json', defaultTelegram(), x => ({ ...x, proxies: x.proxies.filter(y => y.id !== id), activeProxyId: x.activeProxyId === id ? null : x.activeProxyId })); return A(200, { ok: true }); }
      const b = await json(req); db.update('telegram.json', defaultTelegram(), x => ({ ...x, proxies: x.proxies.map(y => y.id === id ? { ...y, ...['enabled', 'share', 'name'].reduce((a, k) => b[k] !== undefined ? { ...a, [k]: b[k] } : a, {}) } : y) })); return A(200, { ok: true });
    }
    if (p === '/api/admin/telegram/test-all' && req.method === 'POST') return A(200, { results: await bot.testAll() });
    if (p === '/api/admin/telegram/direct-test' && req.method === 'POST') return A(200, await testProxy(null, db.read('telegram.json', defaultTelegram()).token));
    if (p === '/api/admin/telegram/broadcast' && req.method === 'POST') { const b = await json(req); if (bot.status.state !== 'running') return A(409, { error: 'bot-not-running' }); const n = await bot.broadcast(String(b.text || '').slice(0, 3500), Array.isArray(b.studentIds) ? b.studentIds : null); audit(who, 'telegram-broadcast', String(n), ip); return A(200, { sent: n }); }
    m = p.match(/^\/api\/admin\/telegram\/links\/(-?\d+)\/delete$/); if (m && req.method === 'POST') { db.update('telegram.json', defaultTelegram(), x => { const l = { ...(x.links || {}) }; delete l[m[1]]; return { ...x, links: l }; }); return A(200, { ok: true }); }
    return A(404, { error: 'not-found' });
  }

  // ---------- static ----------
  function serveStatic(req, res, url) {
    let base = DIST; let rel; try { rel = decodeURIComponent(url.pathname); } catch { return send(req, res, 400, { error: 'bad-path' }); }
    if (rel === '/app') { res.writeHead(301, { Location: '/app/' }); return res.end(); }
    if (rel.startsWith('/app/') && existsSync(path.join(APP_DIST, 'index.html'))) {
      base = APP_DIST; rel = rel.slice(4);
      if (rel === '/config.json') return send(req, res, 200, { hubUrl: originOf(req), siteName: 'SS · سیستم مطالعه', hubName: cfg().name });
    }
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.join(base, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(base)) return send(req, res, 403, { error: 'forbidden' });
    if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(base, 'index.html');
    if (!existsSync(file)) return send(req, res, 404, 'build first: npm run build', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME_T[ext] || 'application/octet-stream', 'Cache-Control': /[/\\]assets[/\\]/.test(file) ? 'public, max-age=3600' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src *; frame-ancestors 'none'; base-uri 'self'" , ...(isHttps(req) ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}) });
    createReadStream(file).pipe(res);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    (url.pathname.startsWith('/api/') ? api(req, res, url) : Promise.resolve(serveStatic(req, res, url)))
      .catch(e => { if (!res.headersSent) send(req, res, e.status || 500, { error: e.status ? e.message : 'server-error' }, cors(req)); log('error: ' + (e.stack || e.message)); });
  });
  return { server, db, bot, sendMail, handleApi: api, serveStatic, ready: loadPacks().then(() => { if (startBot) bot.start(); }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hub = createHub();
  hub.ready.then(() => hub.server.listen(PORT, () => {
    console.log(`SS مرکز v${VERSION} · http://localhost:${PORT}  (data: ${hub.db.dir})`);
    if (existsSync(path.join(APP_DIST, 'index.html'))) console.log(`      سایت دانش‌آموز: http://localhost:${PORT}/app/`);
    if (!existsSync(path.join(DIST, 'index.html'))) console.log('      ⚠ dist/ پیدا نشد: npm run build');
  }));
  process.on('SIGTERM', () => { hub.bot.stop(); hub.server.close(() => process.exit(0)); });
}
