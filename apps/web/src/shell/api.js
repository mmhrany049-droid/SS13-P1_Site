// SS 12 — the one API client of the site. Session = HttpOnly cookie (JS never sees it); every write carries X-SS-CSRF.
// Errors come back with a Persian message from the server (contracts/errors.fa.mjs); offline is its own state.
export class ApiError extends Error {}
export async function call(path, { method = 'GET', body, headers = {}, timeout = 15000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(path, { method, signal: ctl.signal, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-SS-CSRF': '1' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw Object.assign(new ApiError('offline'), { offline: true }); } finally { clearTimeout(t); }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json') && r.status !== 204) {
    if (r.ok) throw Object.assign(new ApiError('not-json'), { offline: true, status: r.status }); // static hosting without the API
    throw Object.assign(new ApiError(`HTTP ${r.status}`), { status: r.status, offline: r.status === 404 || r.status === 503 });
  }
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new ApiError(j?.message || `HTTP ${r.status}`), { code: j?.error, status: r.status, data: j || {} });
  return j;
}
export const errFa = e => {
  if (!e) return '';
  if (e.offline) return 'به سرور SS وصل نشد. اینترنت یا روشن بودن سرور را بررسی کن.';
  if (e.code === 'locked' && e.data?.minutes) return `${e.message} (${e.data.minutes} دقیقه)`;
  if (e.code === 'weak-password' && e.data?.detail) return `${e.message} ${e.data.detail}`;
  return e.message || 'خطای ناشناخته';
};
export const newKey = (p = 'k') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
