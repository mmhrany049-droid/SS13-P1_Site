// SS 7.1 — «روزهای من»: every day is designed individually.
//   s.settings.dayPlan = {
//     template:  { 0..6 (getDay): DayCfg },          // the normal week
//     overrides: { 'YYYY-MM-DD': DayCfg & { note } }  // one specific date, wins over the template
//   }
//   DayCfg = { mode: 'normal' | 'catchup' | 'off', target: minutes I WANT to study,
//              windows: [{ from: 'HH:MM', to: 'HH:MM', type: 'prefer' | 'can' }] }
//     prefer = «ساعتی که می‌خواهم درس بخوانم» (filled first) · can = «ساعتی که می‌توانم» (used only if needed)
//   s.events = fixed / personal blocks (sport, music class, …): once | weekly | biweekly.
// Study time on a day = 60–120 minute sessions cut out of the free parts of the windows, preferred windows first,
// until the day's target is reached. Tasks are then laid into those sessions; a long task is split across sessions.
export const SESSION_MIN = 60, SESSION_MAX = 120;
export const EVENT_KINDS = { personal: ['کار شخصی', '👤'], sport: ['ورزش', '🏃'], music: ['کلاس موسیقی', '🎵'], class: ['کلاس درس/آموزشگاه', '🏫'], family: ['خانواده و مهمانی', '🏠'], rest: ['استراحت', '☕'], school: ['مدرسه', '🎒'], other: ['دیگر', '•'] };
export const WEEKDAYS_FA = [[6, 'شنبه'], [0, 'یکشنبه'], [1, 'دوشنبه'], [2, 'سه‌شنبه'], [3, 'چهارشنبه'], [4, 'پنج‌شنبه'], [5, 'جمعه']]; // Iranian week order
export const DAY_MODES = { normal: ['روز عادی', 'برنامه جدید چیده می‌شود'], catchup: ['روز جبرانی', 'فقط کارهای جامانده و جلو انداختن'], off: ['تعطیل', 'بدون مطالعه'] };

const pl = d => { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd).getTime(); };
export const dow = d => new Date(pl(d)).getDay();
export const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); if (!m) return null; const v = +m[1] * 60 + +m[2]; return v <= 24 * 60 ? v : null; };
export const toHHMM = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const clampSession = v => Math.max(SESSION_MIN, Math.min(SESSION_MAX, Math.round(+v || SESSION_MIN)));
const sumWin = ws => ws.reduce((a, w) => a + Math.max(0, (toMin(w.to) ?? 0) - (toMin(w.from) ?? 0)), 0);

/** Default week built from the old settings (minute caps / v7 windows) so nothing changes for existing users. */
export function defaultDayPlan(st = {}) {
  const off = st.offDays ?? [4, 5]; const template = {};
  for (let d = 0; d < 7; d++) {
    const catchup = off.includes(d);
    const v7 = st.studyWindows?.[d];
    const windows = v7?.length ? v7.map(w => ({ from: w.from, to: w.to, type: 'can' }))
      : catchup ? [{ from: '09:00', to: '12:30', type: 'prefer' }, { from: '16:00', to: '19:30', type: 'can' }] : [{ from: '16:00', to: '20:30', type: 'prefer' }, { from: '20:30', to: '22:00', type: 'can' }];
    const target = v7?.length ? sumWin(v7) : catchup ? (st.weekendMin ?? 360) : (st.weekdayMin ?? 240);
    template[d] = { mode: catchup ? 'catchup' : 'normal', target: Math.round(target), windows };
  }
  return { template, overrides: {} };
}
export const dayPlanOf = s => s.settings?.dayPlan || defaultDayPlan(s.settings);
/** Effective configuration of one date (override → template). */
export function dayCfg(s, d) {
  const p = dayPlanOf(s); const o = p.overrides?.[d];
  const t = p.template?.[dow(d)] || { mode: 'normal', target: 240, windows: [] };
  return o ? { ...t, ...o, custom: true } : { ...t, custom: false };
}
export function sessionRules(st = {}) {
  let min = clampSession(st.sessionMin ?? SESSION_MIN), max = clampSession(st.sessionMax ?? SESSION_MAX);
  if (min > max) [min, max] = [max, min];
  return { min, max, brk: Math.max(5, Math.min(45, Math.round(+st.breakMin || 15))) };
}

/** Does a (possibly repeating) event happen on date d? */
export function occursOn(ev, d) {
  if (ev.active === false || !ev.from || !ev.to) return false;
  if (ev.until && d > ev.until) return false;
  if ((ev.skip || []).includes(d)) return false;
  if (ev.repeat === 'once' || !ev.repeat) return ev.date === d;
  if (ev.date && d < ev.date) return false;
  if (!(ev.weekdays || []).includes(dow(d))) return false;
  if (ev.repeat === 'biweekly') { const start = ev.date || d; const wk = Math.floor(Math.round((pl(d) - pl(start)) / 864e5) / 7); return wk % 2 === 0; }
  return true;
}
/** Busy blocks on a day: events + activated mock-exam rounds. */
export function eventsOn(s, d) {
  const out = (s.events || []).filter(e => occursOn(e, d)).map(e => ({ ...e, start: toMin(e.from), end: toMin(e.to), src: 'event' }));
  for (const ms of (s.mockSeries || []).filter(m => m.active === true)) for (const r of mockRounds(ms)) if (r.date === d) out.push({ id: `mock:${ms.id}:${r.no}`, title: `${ms.title}، مرحله ${r.no}`, kind: 'mock', from: r.from, to: r.to, start: toMin(r.from), end: toMin(r.to), src: 'mock', buffer: 30 });
  return out.filter(e => e.start != null && e.end != null && e.end > e.start).sort((a, z) => a.start - z.start);
}
/** Free parts of the day's windows (events cut out, with a buffer after each event). Preferred first. */
export function freeIntervals(s, d) {
  const cfg = dayCfg(s, d); if (cfg.mode === 'off') return [];
  const busy = eventsOn(s, d).map(e => [e.start - (e.before ?? 0), Math.min(24 * 60, e.end + (e.buffer ?? 15))]);
  const out = [];
  for (const w of cfg.windows || []) {
    const a0 = toMin(w.from), z0 = toMin(w.to); if (a0 == null || z0 == null || z0 <= a0) continue;
    let parts = [[a0, z0]];
    for (const [a, z] of busy) parts = parts.flatMap(([x, y]) => z <= x || a >= y ? [[x, y]] : [[x, a], [z, y]].filter(([p, q]) => q - p > 0));
    for (const [x, y] of parts) out.push({ start: x, end: y, type: w.type === 'prefer' ? 'prefer' : 'can' });
  }
  // merge touching intervals of the same type, drop overlaps between windows
  out.sort((a, z) => a.start - z.start); const merged = [];
  for (const iv of out) { const last = merged.at(-1); if (last && iv.start <= last.end) { if (iv.type === last.type) last.end = Math.max(last.end, iv.end); else if (iv.end > last.end) merged.push({ ...iv, start: last.end }); } else merged.push({ ...iv }); }
  return merged.filter(x => x.end > x.start);
}
/** Split one free interval of `len` minutes into k sessions of equal size within [min,max] (+breaks between). */
export function splitSessions(len, { min, max, brk }, want = Infinity) {
  if (len < min || want <= 0) return [];
  const usable = Math.min(len, want + Math.ceil(Math.max(0, want - 1) / max) * brk); // do not cut more than needed
  let k = Math.max(1, Math.ceil((usable + brk) / (max + brk)));
  while (k > 1 && (usable - (k - 1) * brk) / k < min) k--;
  let size = Math.min(max, Math.floor((usable - (k - 1) * brk) / k));
  if (size < min) size = min; // the interval fits one minimal session
  if (size > len) return [];
  return Array.from({ length: k }, () => size);
}
/** Sessions of a day: preferred windows first, then «can» windows, until the target is met.
 *  The last session may run up to (min − 1) minutes over the target rather than be shorter than 60 minutes. */
export function sessionsOn(s, d) {
  const cfg = dayCfg(s, d); if (cfg.mode === 'off') return [];
  const rules = sessionRules(s.settings); let left = Math.max(0, +cfg.target || 0); const out = [];
  const free = freeIntervals(s, d);
  for (const type of ['prefer', 'can']) for (const iv of free.filter(x => x.type === type)) {
    if (left < rules.min / 2) break;
    let t = iv.start;
    for (const len of splitSessions(iv.end - iv.start, rules, Math.max(left, rules.min))) {
      if (left < rules.min / 2) break;
      out.push({ start: t, end: t + len, minutes: len, from: toHHMM(t), to: toHHMM(t + len), type }); left -= len; t += len + rules.brk;
    }
  }
  return out.sort((a, z) => a.start - z.start);
}
/** Real study minutes on a day (sessions). */
export const studyMinutes = (s, d) => sessionsOn(s, d).reduce((a, x) => a + x.minutes, 0);
/** Availability vs. wish: shows the student when the target does not fit. */
export function dayBudget(s, d) {
  const cfg = dayCfg(s, d); const free = freeIntervals(s, d); const ss = sessionsOn(s, d);
  return { cfg, target: cfg.mode === 'off' ? 0 : +cfg.target || 0, freeMin: free.reduce((a, x) => a + x.end - x.start, 0), studyMin: ss.reduce((a, x) => a + x.minutes, 0), sessions: ss, events: eventsOn(s, d) };
}

const INDIVISIBLE = new Set(['شرایط آزمون']);
/** Lay the day's tasks (in order) into its sessions. A task never overlaps a break: longer tasks are split into
 *  parts across consecutive sessions (۱/۲، ۲/۲). Exam-condition blocks are never split. Tasks with `at` go first
 *  into the session containing that time. Returns blocks (sessions + events), parts per session and overflow. */
export function timeline(s, d, items) {
  const slots = sessionsOn(s, d).map(x => ({ ...x, items: [], used: 0 }));
  const room = sl => sl.minutes - sl.used; const overflow = [];
  const put = (sl, p, m, part) => { sl.items.push({ ...p, partMin: m, part }); sl.used += m; };
  const ordered = [...items.filter(p => p.at), ...items.filter(p => !p.at)];
  for (const p of ordered) {
    let need = Math.max(1, +p.minutes || 0); let startIdx = 0;
    if (p.at) { const t = toMin(p.at); const i = slots.findIndex(x => t >= x.start && t < x.end); if (i >= 0) startIdx = i; }
    if (INDIVISIBLE.has(p.kind) || need <= 20) { // small or indivisible tasks: whole, in the first session that fits
      const sl = slots.slice(startIdx).find(x => room(x) >= need) || slots.find(x => room(x) >= need);
      if (sl) put(sl, p, need, null); else overflow.push(p); continue;
    }
    // whole in one session if possible (from its time onwards, then earlier); otherwise split, parts ≥ 20 min
    const whole = slots.slice(startIdx).find(x => room(x) >= need) || slots.find(x => room(x) >= need);
    if (whole) { put(whole, p, need, null); continue; }
    const parts = []; const order = [...slots.slice(startIdx), ...slots.slice(0, startIdx)];
    for (const sl of order) { if (need <= 0) break; const r = room(sl); if (r < 20 && r < need) continue; const m = Math.min(r, need); if (need - m > 0 && need - m < 20) { const m2 = need - 20; if (m2 >= 20) { parts.push([sl, m2]); need -= m2; } continue; } parts.push([sl, m]); need -= m; }
    if (need > 0) { overflow.push({ ...p, missing: need }); }
    parts.forEach(([sl, m], k) => put(sl, p, m, parts.length > 1 ? `${k + 1}/${parts.length}` : null));
  }
  const blocks = [...slots.map(x => ({ type: 'session', ...x })), ...eventsOn(s, d).map(e => ({ type: 'event', ...e }))].sort((a, z) => a.start - z.start);
  return { blocks, overflow, sessions: slots };
}

// ---------- mock exams (شبه‌کنکور): series repeating every N weeks, each round with its own topics ----------
export function mockRounds(ms) {
  const n = Math.max(1, Math.min(40, +ms.count || 10)); const every = Math.max(1, +ms.everyWeeks || 2); const out = [];
  for (let i = 0; i < n; i++) {
    const no = i + 1; const r = (ms.rounds || []).find(x => x.no === no) || {};
    const auto = new Date(pl(ms.startDate) + i * every * 7 * 864e5 + 3 * 36e5); const ds = new Date(auto.getTime() - auto.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    out.push({ no, date: r.date || ds, title: r.title || '', sections: r.sections || [], from: r.from || ms.from || '07:30', to: r.to || ms.to || '11:30', cancelled: !!r.cancelled });
  }
  return out.filter(r => !r.cancelled);
}
