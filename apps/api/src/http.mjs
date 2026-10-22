// SS 12 — HTTP plumbing: safe URL parsing, bounded bodies, JSON replies, cookies, CSRF/Origin, error boundary.
import { randomBytes } from 'node:crypto';
import { ERR_FA } from '@ss/contracts/errors.fa.mjs';
export class HttpError extends Error { constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra; } }
export const bad = (status, code, extra) => { throw new HttpError(status, code, extra); };
export const reqId = () => randomBytes(6).toString('hex');
/** Parse once; match on pathname only, so `/api/today?x=1` hits `/api/today` (report S12). */
export function parseUrl(req) {
  if (!req.url || req.url.length > 4096) return null;
  try { const u = new URL(req.url, 'http://localhost'); let p = u.pathname; if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1); if (p.includes('..') || p.includes('\\') || p.includes('\0')) return null; return { url: u, path: p }; } catch { return null; }
}
export const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()' };
export function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const data = body == null ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...headers }); res.end(data);
}
export const errorBody = (code, extra = {}) => ({ error: code, message: ERR_FA[code] || ERR_FA.internal, ...extra });
/** Bounded body (default 1 MB) — v12 spike accepted unbounded bodies (S8). */
export function readBody(req, limit = 1024 * 1024) {
  return new Promise((ok, fail) => {
    const declared = +req.headers['content-length']; if (declared > limit) { fail(new HttpError(413, 'too-large')); req.resume(); return; }
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { fail(new HttpError(413, 'too-large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8'))); req.on('error', fail);
  });
}
export async function readJson(req, limit) {
  const ct = String(req.headers['content-type'] || ''); const raw = await readBody(req, limit);
  if (!raw) return {};
  if (!ct.includes('application/json')) throw new HttpError(415, 'invalid-input', { field: 'content-type' });
  try { const v = JSON.parse(raw); return v ?? {}; } catch { throw new HttpError(400, 'bad-json'); }
}
export function parseCookies(h = '') { const o = {}; for (const part of String(h).split(';')) { const i = part.indexOf('='); if (i > 0) { try { o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* malformed */ } } } return o; }
export function cookie(name, value, { maxAgeMs, secure }) {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', secure && 'Secure', maxAgeMs != null && `Max-Age=${Math.floor(maxAgeMs / 1000)}`].filter(Boolean).join('; ');
}
/** CSRF: SameSite=Strict cookie + a custom header (cannot be sent cross-site without CORS) + Origin check when present. */
export function csrfOk(req, allowedOrigins = []) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.headers['x-ss-csrf'] !== '1' && req.headers['x-ss-admin'] !== '1') return false;
  const o = req.headers.origin; if (!o) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host; try { const u = new URL(o); if (u.host === host) return true; } catch { return false; }
  return allowedOrigins.includes(o);
}
/** Origin-only check (used for the cookie-less login of older student apps). */
export function originOk(req, allowedOrigins = []) {
  const o = req.headers.origin; if (!o) return true; const host = req.headers['x-forwarded-host'] || req.headers.host;
  try { if (new URL(o).host === host) return true; } catch { return false; } return allowedOrigins.includes(o) || allowedOrigins.includes('*');
}
