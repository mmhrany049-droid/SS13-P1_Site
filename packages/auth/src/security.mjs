// SS 12 (moved verbatim from v11 admin/server/security.mjs — logic unchanged, report §9.1) — security primitives (zero dependencies):
// scrypt password hashing, password policy, opaque session tokens, TOTP (RFC 6238) for 2-step login,
// AES-256-GCM secret box for stored credentials (Gmail app password, bot token), rate limiting and account lockout.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';

export const sha = s => createHash('sha256').update(String(s)).digest('hex');
export const token = (n = 32) => randomBytes(n).toString('base64url');
export const code6 = () => String(randomBytes(4).readUInt32BE() % 1e6).padStart(6, '0');

// ---------- passwords ----------
const SCRYPT = { N: 16384, r: 8, p: 1 };
export function hashPw(pw) { const salt = randomBytes(16).toString('hex'); return { algo: 'scrypt', salt, hash: scryptSync(String(pw), salt, 64, SCRYPT).toString('hex') }; }
export function checkPw(pw, a) {
  if (!a?.salt || !a?.hash || pw == null) { scryptSync('x', 'pad-timing', 64, SCRYPT); return false; }
  const h = scryptSync(String(pw), a.salt, 64, SCRYPT); const b = Buffer.from(a.hash, 'hex');
  return h.length === b.length && timingSafeEqual(h, b);
}
const COMMON = new Set(['12345678', '123456789', '1234567890', 'password', 'password1', 'qwerty123', '11111111', '00000000', 'iloveyou', 'admin123', 'abcd1234', 'qwertyuiop', '87654321', '12341234', 'asdfghjk']);
/** Returns null when acceptable, otherwise a Persian reason. min 8 chars, letters + digits, not a common password, not the email/name. */
export function pwProblem(pw, { email = '', name = '', min = 8 } = {}) {
  const p = String(pw || '');
  if (p.length < min) return `رمز باید حداقل ${min} کاراکتر باشد.`;
  if (p.length > 128) return 'رمز خیلی طولانی است.';
  if (!/[A-Za-z\u0600-\u06FF]/.test(p) || !/[0-9\u06F0-\u06F9]/.test(p)) return 'رمز باید هم حرف داشته باشد هم عدد.';
  if (COMMON.has(p.toLowerCase())) return 'این رمز خیلی رایج است؛ رمز دیگری انتخاب کن.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && p.toLowerCase().includes(local)) return 'رمز نباید شامل ایمیل باشد.';
  if (name && name.length >= 4 && p.toLowerCase().includes(String(name).toLowerCase())) return 'رمز نباید شامل نام باشد.';
  return null;
}
export const normEmail = e => { const x = String(e || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x) && x.length <= 120 ? x : null; };

// ---------- TOTP (Google Authenticator compatible) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32encode(buf) { let bits = 0, val = 0, out = ''; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
export function b32decode(s) { const c = String(s).replace(/=+$/, '').replace(/\s/g, '').toUpperCase(); let bits = 0, val = 0; const out = []; for (const ch of c) { const i = B32.indexOf(ch); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
export const newTotpSecret = () => b32encode(randomBytes(20));
export function totpAt(secret, t = Date.now(), step = 30) {
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / step)));
  const h = createHmac('sha1', b32decode(secret)).update(ctr).digest(); const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
export function totpCheck(secret, code, t = Date.now()) { const c = String(code || '').replace(/\D/g, ''); if (c.length !== 6 || !secret) return false; return [-1, 0, 1].some(w => totpAt(secret, t + w * 30000) === c); }
export const otpauthUrl = (secret, account, issuer = 'SS Admin') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;

// ---------- secret box (credentials at rest) ----------
export function secretKey(dataDir) {
  if (process.env.SS_SECRET) return createHash('sha256').update(process.env.SS_SECRET).digest();
  const f = path.join(dataDir, 'secret.key');
  if (!existsSync(f)) { writeFileSync(f, randomBytes(32).toString('hex')); try { chmodSync(f, 0o600); } catch { /* windows */ } }
  return Buffer.from(readFileSync(f, 'utf8').trim(), 'hex');
}
export function seal(key, text) { if (text == null || text === '') return null; const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`; }
export function unseal(key, box) {
  if (!box) return ''; if (!String(box).startsWith('v1:')) return String(box); // legacy plain value
  try { const [, iv, tag, enc] = String(box).split(':'); const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8'); } catch { return ''; }
}

// ---------- rate limiting / lockout ----------
export function limiter({ windowMs = 10 * 60e3, max = 40 } = {}) {
  const hits = new Map();
  const fn = key => { const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < windowMs); a.push(now); hits.set(key, a); if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k); return a.length > max; };
  fn.reset = key => hits.delete(key); return fn;
}
/** Account lockout: after `max` failures within 15 min the account is locked for `lockMs`. */
export function lockout({ max = 5, lockMs = 15 * 60e3 } = {}) {
  const st = new Map();
  return {
    locked: k => { const x = st.get(k); return x?.until > Date.now() ? Math.ceil((x.until - Date.now()) / 60e3) : 0; },
    fail: k => { const now = Date.now(); const x = st.get(k) || { n: 0, first: now, until: 0 }; if (now - x.first > 15 * 60e3) { x.n = 0; x.first = now; } x.n++; if (x.n >= max) { x.until = now + lockMs; x.n = 0; } st.set(k, x); return x.until > now; },
    ok: k => st.delete(k),
  };
}

// ---------- cookies ----------
export function parseCookies(h = '') { const o = {}; for (const part of String(h).split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } return o; }
export function cookie(name, value, { maxAge, secure = false, path: p = '/' } = {}) {
  return [`${name}=${encodeURIComponent(value)}`, `Path=${p}`, 'HttpOnly', 'SameSite=Strict', secure && 'Secure', maxAge != null && `Max-Age=${Math.floor(maxAge / 1000)}`].filter(Boolean).join('; ');
}
