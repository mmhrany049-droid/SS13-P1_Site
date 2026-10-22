// node --test tests/   (Admin v3 server: accounts, security, students, mail, messages, state)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHub } from '../apps/api/src/legacy/index.mjs';
import { totpAt } from '@ss/auth/security.mjs';
import { parseMessage } from '../apps/api/src/legacy/mail.mjs';

const outbox = [];
const hub = createHub({ dataDir: mkdtempSync(path.join(tmpdir(), 'ss-hub-')), log: () => {}, startBot: false, mailTransport: async m => { outbox.push({ ...parseMessage(Buffer.from(m.raw)), to: m.to[0] }); } });
await hub.ready; await new Promise(r => hub.server.listen(0, r)); const base = `http://127.0.0.1:${hub.server.address().port}`;
let cookie = '';
const call = async (p, { method = 'GET', body, auth, admin = true, raw = false, headers = {} } = {}) => {
  const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(admin && method !== 'GET' ? { 'X-SS-Admin': '1' } : {}), ...(admin && cookie ? { Cookie: cookie } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc && admin) cookie = sc.split(';')[0];
  return { status: r.status, body: raw ? await r.text() : await r.json().catch(() => null) };
};
const lastCode = to => { const m = [...outbox].reverse().find(x => x.to === to); return /(\d{6})/.exec(m?.text || '')?.[1]; };

test('first run: setup owner with a strong password, then status is authed', async () => {
  assert.equal((await call('/api/admin/status')).body.setup, false);
  assert.equal((await call('/api/admin/setup', { method: 'POST', body: { email: 'owner@gmail.com', password: '12345678', name: 'مهران' } })).status, 422);
  const r = await call('/api/admin/setup', { method: 'POST', body: { email: 'owner@gmail.com', password: 'Tehran-2026-ss', name: 'مهران', hubName: 'مرکز تست' } });
  assert.equal(r.status, 201); assert.ok(cookie.startsWith('ss_admin='));
  const st = await call('/api/admin/status'); assert.equal(st.body.authed, true); assert.equal(st.body.me.role, 'owner'); assert.equal(st.body.name, 'مرکز تست');
});
test('CSRF: admin POST without the X-SS-Admin header is refused', async () => {
  const r = await fetch(base + '/api/admin/config', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(r.status, 403);
});
test('mail settings: app password is sealed, never returned', async () => {
  const r = await call('/api/admin/mail', { method: 'POST', body: { user: 'owner@gmail.com', pass: 'abcd efgh ijkl mnop', enabled: true, fromName: 'مرکز تست', notifyEmail: 'owner@gmail.com' } }); assert.equal(r.status, 200);
  const g = await call('/api/admin/mail'); assert.equal(g.body.hasPass, true); assert.equal(g.body.pass, undefined);
  const raw = hub.db.read('mail.json', {}); assert.ok(String(raw.pass).startsWith('v1:')); assert.ok(!String(raw.pass).includes('abcd'));
});
let stToken = '';
test('student signup → verify email → login; duplicate email and weak password refused', async () => {
  assert.equal((await call('/api/auth/signup', { method: 'POST', admin: false, body: { email: 'ali@gmail.com', password: 'ali', name: 'علی' } })).status, 422);
  const r = await call('/api/auth/signup', { method: 'POST', admin: false, body: { email: 'Ali@Gmail.com', password: 'darsKhoob99', name: 'علی رضایی', phone: '09121234567', grade: 11, stream: 'rf', id: 'local-profile-123456' } });
  assert.equal(r.status, 201); assert.equal(r.body.student.email, 'ali@gmail.com'); assert.equal(r.body.verifySent, true); stToken = r.body.token;
  assert.equal((await call('/api/auth/signup', { method: 'POST', admin: false, body: { email: 'ali@gmail.com', password: 'darsKhoob99', name: 'علی' } })).status, 409);
  const code = lastCode('ali@gmail.com'); assert.match(code, /^\d{6}$/);
  assert.equal((await call('/api/auth/verify', { method: 'POST', admin: false, auth: 'Bearer ' + stToken, body: { code: '000000' === code ? '111111' : '000000' } })).status, 422);
  const v = await call('/api/auth/verify', { method: 'POST', admin: false, auth: 'Bearer ' + stToken, body: { code } }); assert.equal(v.body.student.emailVerified, true);
  const l = await call('/api/auth/login', { method: 'POST', admin: false, body: { email: 'ali@gmail.com', password: 'darsKhoob99' } }); assert.equal(l.status, 200); assert.ok(l.body.token);
});
test('forgot password: code by email, wrong code refused, reset logs in and kills old sessions', async () => {
  const f = await call('/api/auth/forgot', { method: 'POST', admin: false, body: { email: 'ali@gmail.com' } }); assert.equal(f.status, 200);
  assert.equal((await call('/api/auth/forgot', { method: 'POST', admin: false, body: { email: 'nobody@gmail.com' } })).status, 200); // no enumeration
  const code = lastCode('ali@gmail.com');
  assert.equal((await call('/api/auth/reset', { method: 'POST', admin: false, body: { email: 'ali@gmail.com', code: '999999' === code ? '888888' : '999999', password: 'newPass2026x' } })).status, 422);
  const r = await call('/api/auth/reset', { method: 'POST', admin: false, body: { email: 'ali@gmail.com', code, password: 'newPass2026x' } }); assert.equal(r.status, 200);
  assert.equal((await call('/api/auth/me', { admin: false, auth: 'Bearer ' + stToken })).status, 401); stToken = r.body.token;
  assert.equal((await call('/api/auth/me', { admin: false, auth: 'Bearer ' + stToken })).status, 200);
});
test('student lockout after 5 wrong passwords', async () => {
  for (let i = 0; i < 5; i++) await call('/api/auth/login', { method: 'POST', admin: false, body: { email: 'ali@gmail.com', password: 'wrong-' + i } });
  assert.equal((await call('/api/auth/login', { method: 'POST', admin: false, body: { email: 'ali@gmail.com', password: 'newPass2026x' } })).status, 423);
});
test('cloud backup round-trip and messages student ⇄ admin (admin gets an email)', async () => {
  const B = 'Bearer ' + stToken; const bk = { format: 'ss-cloud-backup', at: new Date().toISOString(), state: { sessions: [1, 2, 3] } };
  assert.equal((await call('/api/me/backup', { method: 'PUT', admin: false, auth: B, body: bk })).status, 200);
  assert.deepEqual((await call('/api/me/backup', { admin: false, auth: B })).body.state.sessions, [1, 2, 3]);
  const n = outbox.length; const m = await call('/api/me/messages', { method: 'POST', admin: false, auth: B, body: { subject: 'سؤال', text: 'آزمون کی است؟' } });
  assert.equal(m.status, 201); assert.equal(m.body.mailed, true); assert.equal(outbox[n].to, 'owner@gmail.com');
  const th = await call('/api/admin/messages'); const t = th.body.threads[0]; assert.equal(t.unread, 1);
  const rep = await call(`/api/admin/messages/${t.studentId}`, { method: 'POST', body: { text: 'پنج‌شنبه ساعت ۸' } }); assert.equal(rep.body.mailed, true);
  const mine = await call('/api/me/messages', { admin: false, auth: B }); assert.equal(mine.body.items[0].text, 'پنج‌شنبه ساعت ۸');
});
test('email to a class: {نام} is personalised and suspended students are skipped', async () => {
  const r2 = await call('/api/auth/signup', { method: 'POST', admin: false, body: { email: 'sara@gmail.com', password: 'kelasDars77', name: 'سارا' } });
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  const list = (await call('/api/admin/students')).body.items; const ali = list.find(s => s.email === 'ali@gmail.com'); const sara = list.find(s => s.email === 'sara@gmail.com');
  const st = await call('/api/admin/state'); await call('/api/admin/state', { method: 'POST', body: { rev: st.body.rev, hub: { classes: [{ id: 'cls-1', name: 'شیمی', members: [ali.id, sara.id] }] } } });
  await call(`/api/admin/students/${sara.id}/suspend`, { method: 'POST', body: {} });
  assert.equal((await call('/api/auth/me', { admin: false, auth: 'Bearer ' + r2.body.token })).status, 401);
  const n = outbox.length; const s = await call('/api/admin/mail/send', { method: 'POST', body: { classId: 'cls-1', subject: 'جلسه رفع اشکال', text: 'سلام {نام}، فردا جلسه داریم.' } });
  assert.equal(s.body.sent, 1); assert.equal(s.body.skipped, 1); assert.match(outbox[n].text, /سلام علی رضایی/);
});
test('hub state conflict detection (two admins editing)', async () => {
  const st = await call('/api/admin/state'); assert.equal((await call('/api/admin/state', { method: 'POST', body: { rev: st.body.rev - 1, hub: {} } })).status, 409);
});
test('2-step login (TOTP) and team roles: teacher cannot change settings', async () => {
  const s = await call('/api/admin/me/totp/setup', { method: 'POST', body: {} }); assert.equal((await call('/api/admin/me/totp/enable', { method: 'POST', body: { code: totpAt(s.body.secret) } })).status, 200);
  const add = await call('/api/admin/admins', { method: 'POST', body: { email: 'teacher@gmail.com', name: 'دبیر شیمی', role: 'teacher' } }); assert.equal(add.status, 201); assert.equal(add.body.mailed, true);
  const ownerCookie = cookie; cookie = '';
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { email: 'owner@gmail.com', password: 'Tehran-2026-ss' } })).body.error, 'totp-required');
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { email: 'owner@gmail.com', password: 'Tehran-2026-ss', code: totpAt(s.body.secret) } })).status, 200);
  cookie = ''; assert.equal((await call('/api/admin/login', { method: 'POST', body: { email: 'teacher@gmail.com', password: add.body.tempPassword } })).status, 200);
  const me = (await call('/api/admin/status')).body.me; assert.equal(me.role, 'teacher'); assert.equal(me.mustChange, true);
  assert.equal((await call('/api/admin/config', { method: 'POST', body: { name: 'x' } })).status, 403);
  assert.equal((await call('/api/admin/admins')).status, 403);
  cookie = ownerCookie;
});
test('admin forgot password sends a one-time link', async () => {
  const n = outbox.length; await call('/api/admin/forgot', { method: 'POST', body: { email: 'teacher@gmail.com' } });
  const tok = /token=([A-Za-z0-9_-]+)/.exec(outbox[n].text)?.[1]; assert.ok(tok);
  assert.equal((await call('/api/admin/reset', { method: 'POST', body: { token: tok, password: 'Shimi-Dabir-2026' } })).status, 200);
  assert.equal((await call('/api/admin/reset', { method: 'POST', body: { token: tok, password: 'Shimi-Dabir-2027' } })).status, 422);
});
test('CSV export and audit log', async () => {
  const csv = await call('/api/admin/students.csv', { raw: true }); assert.match(csv.body, /ali@gmail.com/);
  const a = await call('/api/admin/audit'); assert.ok(a.body.items.some(x => x.action === 'student-suspend'));
});
test.after(() => hub.server.close());
