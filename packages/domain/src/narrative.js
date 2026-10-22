// SS v13 — «روایت آماری»: deterministic rule-based Persian sentences with the numbers they stand on.
// No AI, no modal «باید», no labels («ضعیف هستی / تنبل / شکست»): every sentence names a measurable thing and one possible next step.
import * as E from './engine.js';
import { analysisCtx, counts, hourBands, optionBias, leaksBy, needRedo, stagnant, repeatOffenders, behaviorStats, weekKey, ANALYSIS_CONST } from './analysis.js';
import { reviewQueue, reviewStats, REASONS, addDays } from './store.js';

const f = E.toFa; const r1 = v => f(Math.round(v)); const ONE = v => f((Math.round(v * 10) / 10).toString());
export const BANNED = ['ضعیف هستی', 'تنبل', 'شکست خوردی', 'شکست‌خورده', 'باید'];
const SUPPORTIVE = new Set(['protect', 'recover', 'freeze']);

function facts(s, F, now) {
  const c = analysisCtx(s, F, now); const per = c.periods; const cur = counts(per.cur), prev = counts(per.prev); const rows = c.mastery; const vel = c.velocityAll;
  const q = reviewQueue(s, c.allAtts, now); const st = reviewStats(s, q.all, now); const bands = hourBands(c.atts); const bias = optionBias(c.atts, s.books || []); const leaks = leaksBy(c.atts, 'reason');
  const bySubject = Object.entries(c.velocityBySubject).map(([k, v]) => ({ subject: k, ...v })).filter(v => v.cls !== 'unknown');
  return { c, cur, prev, rows, vel, st, q, bands, bias, leaks, bySubject, beh: behaviorStats(s, c.today), redoNeed: needRedo(rows), stag: stagnant(rows, now), offenders: repeatOffenders(c.atts, 5), pace: s.pace };
}
const reasonFa = id => REASONS.find(z => z.id === id)?.fa || id;
/** Rules: {id, section, tone, need(x) → data enough?, text(x), ev(x), act?} — evaluated in order, each prints at most one sentence. */
const RULES = [
  { id: 'N01', section: 'summary', tone: 'info', need: x => x.cur.N >= 30, text: x => `در این دوره ${f(x.cur.N)} تست زدی و درصد کنکوری‌ات ${ONE(x.cur.P)}٪ بود.`, ev: x => `N=${x.cur.N}` },
  { id: 'N02', section: 'summary', tone: 'good', need: x => x.cur.N >= 30 && x.prev.N >= 30 && x.cur.P - x.prev.P >= 2, text: x => `نسبت به دورهٔ قبل ${ONE(x.cur.P - x.prev.P)} امتیاز بالاتر رفته‌ای (از ${ONE(x.prev.P)}٪ به ${ONE(x.cur.P)}٪).`, ev: x => `قبل N=${x.prev.N}، الان N=${x.cur.N}` },
  { id: 'N03', section: 'summary', tone: 'watch', need: x => x.cur.N >= 30 && x.prev.N >= 30 && x.cur.P - x.prev.P <= -2, text: x => `نسبت به دورهٔ قبل ${ONE(Math.abs(x.cur.P - x.prev.P))} امتیاز پایین‌تری؛ ممکن است نتیجهٔ مباحث تازه یا سخت‌تر باشد، نه الزاماً افت.`, ev: x => `قبل ${ONE(x.prev.P)}٪، الان ${ONE(x.cur.P)}٪`, act: 'مباحث تازه را جدا نگاه کن' },
  { id: 'N04', section: 'trend', tone: 'good', need: x => x.vel && x.vel.cls === 'improving', text: x => `روند هفتگی‌ات رو به بالاست؛ حدود ${ONE(x.vel.slope)} امتیاز در هفته، با بازهٔ اطمینان مثبت.`, ev: x => `${f(x.vel.weeks)} هفته داده` },
  { id: 'N05', section: 'trend', tone: 'info', need: x => x.vel && x.vel.cls === 'flat' && x.vel.plateau, text: () => 'سه هفتهٔ اخیر درصدت تقریباً ثابت مانده؛ معمولاً یعنی روش فعلی به سقفش رسیده، نه اینکه تلاش کم باشد.', ev: x => `${f(x.vel.weeks)} هفته داده`, act: 'یک مبحث را با «دوباره بزن» بازسازی کن' },
  { id: 'N06', section: 'trend', tone: 'info', need: x => x.vel && x.vel.eta, text: x => `با همین شیب، رسیدن به هدفت حدود ${f(x.vel.eta.weeks)} هفته دیگر برآورد می‌شود (برآورد، نه قول).`, ev: x => `هدف ${f(Math.round(x.vel.eta.weeks * x.vel.slope + x.vel.current))}٪` },
  { id: 'N07', section: 'topics', tone: 'info', need: x => x.rows.some(r => r.cls !== 'insufficient'), text: x => { const t = x.rows.filter(r => r.cls !== 'insufficient').sort((a, z) => a.pC - z.pC)[0]; return `کم‌دقت‌ترین مبحثِ دارای داده کافی: ${t.subject}، ${t.label} با احتمال درست ${r1(t.pC * 100)}٪ (${f(t.n)} تست).`; }, ev: x => `${f(x.rows.length)} مبحث دارای داده` },
  { id: 'N08', section: 'topics', tone: 'action', need: x => x.redoNeed.length > 0, text: x => `${f(x.redoNeed.length)} مبحث آن‌قدر پایین است که بازسازی‌اش می‌ارزد، از جمله ${x.redoNeed[0].label}.`, ev: x => x.redoNeed.slice(0, 3).map(r => `${r.label}: ${r1(r.pC * 100)}٪`).join('، '), act: 'دکمهٔ «دوباره بزن» روی همان مبحث' },
  { id: 'N09', section: 'topics', tone: 'info', need: x => x.stag.length > 0, text: x => `${f(x.stag.length)} مبحث بیش از سه هفته دست‌نخورده مانده و هنوز زیر ۶۰٪ است.`, ev: x => x.stag.slice(0, 3).map(r => r.label).join('، ') },
  { id: 'N10', section: 'errors', tone: 'info', need: x => x.leaks.N >= 60 && x.leaks.rows.length > 0, text: x => { const t = x.leaks.rows[0]; return `بیشترین امتیاز از راه «${t.key === 'blank' ? 'نزدن' : t.key === 'unknown' ? 'خطای بدون دلیل ثبت‌شده' : reasonFa(t.key)}» از دست رفته: حدود ${ONE(t.cost)} امتیاز.`; }, ev: x => `کل نشتی ${ONE(x.leaks.total)} امتیاز` },
  { id: 'N11', section: 'errors', tone: 'info', need: x => x.offenders.length >= 3, text: x => `${f(x.offenders.length)} تست بیش از یک بار غلط یا نزده مانده است؛ همین‌ها بهترین هدف مرورند.`, ev: x => x.offenders.map(o => o.ref).join('، ') },
  { id: 'N12', section: 'memory', tone: 'info', need: x => x.st.retention != null, text: x => `از کارت‌های مرورِ ۳۰ روز اخیر ${r1(x.st.retention * 100)}٪ را درست یادآوری کرده‌ای.`, ev: x => `سررسید امروز ${f(x.q.dueNow.length)}` },
  { id: 'N13', section: 'memory', tone: 'info', need: x => x.q.dueNow.length >= 40, text: x => `${f(x.q.dueNow.length)} کارت مرور سررسید دارد؛ مجموعه‌های ۲۰تایی آن را بدون فشار کم می‌کنند.`, ev: x => `سقف روزانه ${f(x.c.s.settings.reviewLimit ?? 40)}` },
  { id: 'N14', section: 'habits', tone: 'info', need: x => { const b = x.bands.filter(z => z.enough); return b.length >= 2; }, text: x => { const b = x.bands.filter(z => z.enough).sort((a, z) => z.P - a.P); return `در بازهٔ «${b[0].fa}» دقتت از بقیه بیشتر است (${ONE(b[0].P)}٪ با ${f(b[0].N)} تست)؛ برای تست سخت‌تر گزینهٔ خوبی است.`; }, ev: x => x.bands.filter(z => z.enough).map(z => `${z.fa}:${f(z.N)}`).join(' ') },
  { id: 'N15', section: 'habits', tone: 'info', need: x => x.bias && x.bias.significant, text: x => `وقتی مطمئن نیستی بیشتر گزینهٔ ${f(x.bias.topOption)} را می‌زنی (${r1(x.bias.topShare * 100)}٪ در برابر ${r1(x.bias.keyShare * 100)}٪ در کلید)؛ این الگو ساده است و با حذف گزینه‌ها بهتر می‌شود.`, ev: x => `χ²=${ONE(x.bias.chi2)}، n=${f(x.bias.n)}` },
  { id: 'N16', section: 'habits', tone: 'good', need: x => x.beh.active28 >= 14, text: x => `در ${f(x.beh.active28)} روز از ۲۸ روز اخیر مطالعه ثبت کرده‌ای؛ این پایداری ارزشمندتر از هر عدد درصدی است.`, ev: x => `بلندترین رشتهٔ پیاپی ${f(x.beh.best)} روز` },
  { id: 'N17', section: 'habits', tone: 'info', need: x => x.pace && x.pace.target && x.pace.history.length >= 5, text: x => { const h = x.pace.history.slice(-7).filter(r => r.completion != null); const done = h.filter(r => r.completion >= 0.9).length; return `از ${f(h.length)} روز برنامه‌ایِ اخیر، ${f(done)} روز هدف تست را کامل زده‌ای (هدف فعلی ${f(x.pace.target)} تست).`; }, ev: x => `حالت: ${x.pace.mode}` },
];
export function buildNarrative(s, F = { range: '4w' }, now = Date.now()) {
  const x = facts(s, F, now); const supportive = SUPPORTIVE.has(s.pace?.mode); const items = [];
  for (const r of RULES) { let ok = false; try { ok = r.need(x); } catch { ok = false; } if (!ok) continue; if (supportive && r.tone === 'watch') continue; items.push({ id: r.id, section: r.section, tone: r.tone, text: r.text(x), evidence: r.ev(x), action: r.act || null }); }
  if (supportive) items.unshift({ id: 'N00', section: 'summary', tone: 'info', text: 'این روزها هدف اصلی حال خوبِ درس‌خواندن است؛ عددها فقط راهنمای ملایم‌اند.', evidence: '', action: null });
  const order = ['summary', 'trend', 'topics', 'errors', 'memory', 'habits']; const titles = { summary: 'خلاصه', trend: 'روند', topics: 'مبحث‌ها', errors: 'خطاها', memory: 'حافظه و مرور', habits: 'عادت‌ها و الگوها' };
  return { at: now, supportive, n: items.length, sections: order.map(k => ({ id: k, title: titles[k], items: items.filter(i => i.section === k) })).filter(sec => sec.items.length), insufficient: items.length === 0, headline: items.find(i => i.tone !== 'info')?.text || items[0]?.text || null };
}
/** Weekly report: built once per Saturday-based week (the first time the page opens), stored compactly. */
export function ensureWeeklyReport(s, now = Date.now()) {
  const today = analysisCtx(s, {}, now).today; const wk = weekKey(today); if ((s.analysis?.reports || []).some(r => r.weekStart === wk)) return s;
  const nar = buildNarrative(s, { range: '4w' }, now); if (nar.insufficient) return s; const c = analysisCtx(s, { range: '4w' }, now); const tot = counts(c.periods.cur);
  const rep = { weekStart: wk, at: now, N: tot.N, P: tot.P, headline: nar.headline, lines: nar.sections.flatMap(sec => sec.items.slice(0, 1).map(i => i.text)).slice(0, 5) };
  return { ...s, analysis: { ...(s.analysis || {}), reports: [...(s.analysis?.reports || []), rep].slice(-26) } };
}
export { ANALYSIS_CONST, addDays };
