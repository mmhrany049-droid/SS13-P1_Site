// SS 7.1 — account: phone normalisation (for the Telegram bot), PIN hashing (PBKDF2), onboarding steps.
import * as E from '@ss/domain/engine.js';

/** «۰۹۱۲ ۳۴۵ ۶۷۸۹», «+98 912…», «0098912…», «912…» → «989123456789». Other countries: + and 8–15 digits. */
export function normalizePhone(raw) {
  let p = E.normalizeDigits(String(raw || '')).replace(/[\s\-()]/g, '');
  if (p.startsWith('+')) p = p.slice(1); else if (p.startsWith('00')) p = p.slice(2);
  if (/^09\d{9}$/.test(p)) p = '98' + p.slice(1);
  else if (/^9\d{9}$/.test(p)) p = '98' + p;
  if (/^989\d{9}$/.test(p)) return p;
  if (/^[1-9]\d{7,14}$/.test(p) && !p.startsWith('98')) return p;
  return null;
}
export const phoneLabel = p => p && p.startsWith('98') ? E.toFa('0' + p.slice(2).replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')) : E.toFa(p || '');

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export function randomHex(n = 16) { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return hex(a); }
/** PBKDF2-SHA256, 120k iterations. Stored as «salt$hash». The PIN only locks this device's profile. */
export async function hashPin(pin, salt = randomHex(12)) {
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(E.normalizeDigits(String(pin))), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 120000 }, key, 256);
  return `${salt}$${hex(bits)}`;
}
export async function checkPin(pin, stored) { if (!stored) return true; const [salt] = stored.split('$'); return (await hashPin(pin, salt)) === stored; }
export const validPin = p => /^\d{4,6}$/.test(E.normalizeDigits(String(p || '')));

export const ONBOARD_STEPS = [['signup', 'ثبت‌نام'], ['profile', 'نیمرخ و عادت‌ها'], ['days', 'روزهای من'], ['rewards', 'پاداش‌ها'], ['done', 'شروع']];
export const needsOnboarding = s => !s.demo && !s.account?.onboarded;

// ---------- v8: real account security (password or PIN, lockout, recovery code, auto-lock) ----------
export const PASS_MIN = 8;
export const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
/** 0–4 with Persian hints. Long phrases beat short complex ones. */
export function strength(pw) {
  const p = String(pw || ''); const tips = []; let sc = 0;
  if (p.length >= PASS_MIN) sc++; else tips.push(`حداقل ${E.toFa(PASS_MIN)} کاراکتر`);
  if (p.length >= 12) sc++;
  if (/\d/.test(E.normalizeDigits(p)) && /[^\d\s]/.test(p)) sc++; else tips.push('حرف و عدد با هم');
  if (/[^A-Za-z0-9\u0600-\u06FF\s]/.test(p) || /[A-Z]/.test(p)) sc++;
  if (/^(.)\1+$/.test(p) || /^(1234|12345678|password|qwerty)/i.test(p)) { sc = 0; tips.unshift('خیلی قابل حدس است'); }
  return { score: Math.min(4, sc), label: ['خیلی ضعیف', 'ضعیف', 'متوسط', 'خوب', 'قوی'][Math.min(4, sc)], tips };
}
export const validPassword = pw => String(pw || '').length >= PASS_MIN && strength(pw).score >= 2;
const ITER = 210000;
/** «v2$iter$salt$hash» (PBKDF2-SHA256). Old 7.1 PINs («salt$hash», 120k) still verify. */
export async function hashSecret(secret, salt = randomHex(16), iter = ITER) {
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(E.normalizeDigits(String(secret))), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return `v2$${iter}$${salt}$${hex(bits)}`;
}
export async function checkSecret(secret, stored) {
  if (!stored) return true;
  if (!stored.startsWith('v2$')) return checkPin(secret, stored);
  const [, iter, salt] = stored.split('$'); const h = await hashSecret(secret, salt, +iter);
  let diff = h.length ^ stored.length; for (let i = 0; i < Math.min(h.length, stored.length); i++) diff |= h.charCodeAt(i) ^ stored.charCodeAt(i); return diff === 0;
}
export const secretOf = u => u?.secret?.hash || u?.pinHash || null;
export const secretKind = u => u?.secret?.kind || (u?.pinHash ? 'pin' : null);
/** Lockout after repeated wrong secrets: 5 free tries, then 30 s, 1 min, 5 min, 15 min… */
export function lockoutMs(failed) { if (failed < 5) return 0; return [30e3, 60e3, 300e3, 900e3][Math.min(3, failed - 5)]; }
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Recovery code shown once (e.g. «K7QM-2XPA-9RTD-HW4E»); only its hash is stored. */
export function newRecoveryCode() { const a = new Uint8Array(16); globalThis.crypto.getRandomValues(a); const s = [...a].map(b => B32[b % 32]).join(''); return s.match(/.{4}/g).join('-'); }
export const normRecovery = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
