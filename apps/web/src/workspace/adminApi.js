// Admin client for server/index.mjs (same origin). Session = HttpOnly cookie; every write carries X-SS-Admin (CSRF guard).
export const ERR = {
  'wrong-login': 'ایمیل یا رمز درست نیست.', 'wrong-password': 'رمز فعلی درست نیست.', 'weak-password': 'رمز ضعیف است.', 'rate-limited': 'تلاش زیاد بود؛ چند دقیقه بعد دوباره امتحان کن.',
  locked: 'به خاطر چند تلاش ناموفق، این حساب موقتاً قفل شد.', 'totp-required': 'کد ورود دومرحله‌ای لازم است.', 'bad-code': 'کد درست نیست یا منقضی شده.', disabled: 'این حساب غیرفعال شده است.',
  'bad-email': 'ایمیل معتبر نیست.', 'email-taken': 'این ایمیل قبلاً ثبت شده.', 'bad-token': 'لینک بازیابی نامعتبر یا منقضی است.', 'mail-off': 'Gmail هنوز تنظیم نشده (بخش ایمیل ← تنظیمات Gmail).',
  forbidden: 'نقش تو اجازه این کار را ندارد.', conflict: 'یک مدیر دیگر همزمان تغییر داده است.', 'admin-only': 'نشست تمام شده؛ دوباره وارد شو.', 'no-recipient': 'گیرنده‌ای با ایمیل پیدا نشد.', 'daily-cap': 'سقف ارسال روزانه Gmail پر شد.',
  'no-email': 'این دانش‌آموز ایمیل ثبت نکرده.', 'send-failed': 'ارسال ایمیل ناموفق بود.', 'owner-protected': 'حساب مالک قابل تغییر نیست.', 'bad-role': 'نقش نامعتبر است.', empty: 'متن خالی است.', 'not-a-backup': 'این فایل پشتیبان مرکز نیست.', csrf: 'درخواست نامعتبر.',
};
export const errText = e => (e?.message && e.code === 'weak-password' && e.detail) ? e.detail : ERR[e?.code] ? (e.code === 'locked' && e.minutes ? `${ERR.locked} (${e.minutes} دقیقه)` : ERR[e.code]) : e?.offline ? 'به سرور مرکز وصل نشد.' : (e?.message || 'خطای ناشناخته');
export async function api(p, { method = 'GET', body, raw = false } = {}) {
  let r; try { r = await fetch(p, { method, credentials: 'same-origin', cache: 'no-store', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-SS-Admin': '1' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch { throw Object.assign(new Error('offline'), { offline: true }); }
  if (raw) return r;
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.message || j?.error || `HTTP ${r.status}`), { code: j?.error, status: r.status, detail: j?.message, minutes: j?.minutes, data: j });
  return j;
}
/** v2-compatible wrapper (Telegram page, hub sync). */
export function adminApi() {
  const call = (p, method = 'GET', body) => api(p, { method, body: method === 'GET' ? undefined : (body ?? {}) });
  return { enabled: true, call,
    listPacks: () => call('/api/admin/packs'), getPack: id => call(`/api/admin/packs/${encodeURIComponent(id)}`), uploadPack: p => call('/api/admin/packs', 'POST', p),
    bulletinInfo: () => call('/api/admin/bulletin'), publishBulletin: x => call('/api/admin/bulletin', 'POST', x),
    telegram: () => call('/api/admin/telegram'), students: () => call('/api/admin/students') };
}
