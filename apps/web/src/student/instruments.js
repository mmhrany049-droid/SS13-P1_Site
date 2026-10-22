// v8 — «تست‌های نیمرخ»: short, non-diagnostic self-report instruments (docs/handoff/psy) that personalise SS.
// Answers stay on the device. Every result is a band (score ± uncertainty), never a label or a diagnosis.
import CHRONO from './data/psy/chronotype_custom.json' with { type: 'json' };
import SDT from './data/psy/motivation_sdt.json' with { type: 'json' };
import PROC from './data/psy/procrastination_triggers.json' with { type: 'json' };
import SELFC from './data/psy/selfcontrol_study.json' with { type: 'json' };
import EFF from './data/psy/selfefficacy_subject.json' with { type: 'json' };
import SESS from './data/psy/session_preference.json' with { type: 'json' };
import STRAT from './data/psy/strategy_selfreport.json' with { type: 'json' };
import ANX from './data/psy/testanxiety_short.json' with { type: 'json' };

const META = {
  'testanxiety.short': ['استرس آزمون', '😰', 'نگرانی و هیجان بدنی قبل و سر آزمون', 3],
  'procrastination.triggers': ['چرا عقب می‌اندازم؟', '⏳', 'محرک‌های اهمال‌کاری تو', 3],
  'strategy.selfreport': ['روش‌های مطالعه من', '🧠', 'چقدر از روش‌های مؤثر (خودآزمایی، فاصله، مخلوط) استفاده می‌کنی', 4],
  'selfcontrol.study': ['خودکنترلی در درس', '🎯', 'شروع، حواس‌پرتی، پشتکار و تأخیر لذت', 3],
  'motivation.sdt': ['انگیزه من', '🔥', 'درونی یا از روی فشار؟ پاداش‌ها از روی این تنظیم می‌شوند', 2],
  'session.preference': ['جلسه ایده‌آل من', '⏱', 'طول جلسه، افت بعدازظهر و محیط', 2],
  'chronotype.custom': ['صبحی یا شبی؟', '🌙', 'بهترین ساعت مغزت برای کار سخت', 2],
  'selfefficacy.subject': ['باور به توانایی', '💪', 'چقدر مطمئنی که با تلاش یاد می‌گیری', 1],
};
export const INSTRUMENTS = [ANX, PROC, STRAT, SELFC, SDT, SESS, CHRONO, EFF].map(j => ({ ...j, title: META[j.id][0], emoji: META[j.id][1], about: META[j.id][2], minutes: META[j.id][3] }));
export const instrumentById = id => INSTRUMENTS.find(x => x.id === id) || null;
export const answersOf = (s, id) => s.profile?.instruments?.[id]?.answers || null;

/** Mean of keyed items per subscale (reverse r → 6 − r) → 0–100 with an uncertainty band (SEM from alpha). */
export function scoreInstrument(ins, ans) {
  const out = {}; const sem = 18 * Math.sqrt(1 - (ins.alphaDefault ?? 0.7));
  for (const [sub, name] of Object.entries(ins.subscales || {})) {
    const its = ins.items.filter(i => i.sub === sub && ans[i.n] != null); if (!its.length) continue;
    const mean = its.reduce((a, i) => a + (i.key === -1 ? 6 - ans[i.n] : ans[i.n]), 0) / its.length;
    const score = (mean - 1) / 4 * 100; const band = 1.96 * sem / Math.sqrt(Math.max(1, its.length / 2));
    out[sub] = { name, score, lo: Math.max(0, score - band), hi: Math.min(100, score + band), n: its.length };
  }
  return out;
}
export const isComplete = (ins, ans) => !!ans && ins.items.every(i => ans[i.n] != null);
export function saveInstrument(s, id, ans) {
  const ins = instrumentById(id); const scores = scoreInstrument(ins, ans);
  // v10: every result is kept (history) so a retest can be compared with the previous one
  const at = new Date().toISOString(); const prev = s.profile?.instruments?.[id];
  const history = [...(prev?.history || (prev ? [{ at: prev.at, scores: prev.scores }] : [])), { at, scores }].slice(-12);
  const plan = { ...(s.assess?.plan || {}), [id]: { ...(s.assess?.plan?.[id] || {}), snoozedUntil: null } };
  return { ...s, assess: { ...(s.assess || {}), plan }, profile: { ...s.profile, instruments: { ...(s.profile?.instruments || {}), [id]: { answers: ans, scores, at, history } } } };
}
/** Which questionnaires are done / missing (for the assistant's checklist). */
export function profileStatus(s) {
  const done = INSTRUMENTS.filter(x => s.profile?.instruments?.[x.id]);
  return { done: done.length + (s.profile?.ipip ? 1 : 0) + (s.habits?.quizAt ? 1 : 0), total: INSTRUMENTS.length + 2, ipip: !!s.profile?.ipip, habits: !!s.habits?.quizAt, missing: INSTRUMENTS.filter(x => !s.profile?.instruments?.[x.id]) };
}
const sc = (s, id, sub) => s.profile?.instruments?.[id]?.scores?.[sub]?.score ?? null;
/** Concrete, sourced suggestions from the results. Non-diagnostic; each one points to a place in SS. */
export function profileInsights(s) {
  const out = []; const add = (cond, t, go, src) => cond && out.push({ t, go, src });
  const worry = sc(s, 'testanxiety.short', 'worry'), emo = sc(s, 'testanxiety.short', 'emotion');
  add(worry != null && worry >= 60, 'قبل از هر آزمون ۱۰ دقیقه نگرانی‌هایت را بنویس و چند آزمون زمان‌دار شبیه‌ساز بزن تا موقعیت آشنا شود.', 'exam', 'Ramirez & Beilock 2011');
  add(emo != null && emo >= 60, 'تپش قلب سر آزمون را «آماده شدن بدن» تفسیر کن؛ این بازتفسیر عملکرد را بهتر می‌کند.', 'exam', 'Jamieson و همکاران 2010');
  const P = sub => sc(s, 'procrastination.triggers', sub);
  add(P('big') >= 60, 'کار بزرگ را به اولین قدم ۵ تستی بشکن؛ در «ثبت تست» با بازه کوچک شروع کن.', 'practice', 'Gollwitzer 1999');
  add(P('unclear') >= 60, 'هر کار برنامه باید معیار روشن داشته باشد: چند تست، چه مبحثی، هدف چند درصد.', 'planner', 'Locke & Latham 2002');
  add(P('boring') >= 60, 'جلسه‌های مخلوط (چند مبحث) و گره زدن یک لذت کوچک به تست‌زدن، کسالت را کم می‌کند.', 'review', 'Milkman و همکاران 2014');
  add(P('time') >= 60, 'زمان‌ها را بیشتر از حدس خودت در نظر بگیر؛ «روزهای من» فقط زمان واقعی آزادت را حساب می‌کند.', 'days', 'Buehler و همکاران 1994');
  add(P('tired') >= 60, 'کار سنگین را در ساعتی بگذار که انرژی داری؛ در «روزهای من» بازه ترجیحی را جابه‌جا کن.', 'days', '');
  add(P('social') >= 60, 'با یک هم‌کلاسی جلسه هم‌زمان (حتی آنلاین) بگذار؛ برایت جواب می‌دهد.', 'network', '');
  const S = sub => sc(s, 'strategy.selfreport', sub);
  add(S('reread') >= 60 && (S('retrieval') ?? 100) < 50, 'به‌جای دوباره‌خواندن، بعد از درسنامه بدون نگاه کردن تست بزن؛ خودآزمایی اثر خیلی بیشتری دارد.', 'practice', 'Dunlosky و همکاران 2013');
  add(S('spacing') != null && S('spacing') < 50, 'مرور فاصله‌دار را جدی بگیر؛ صف «مرور» هر روز خودش آماده است.', 'review', 'Cepeda و همکاران 2006');
  add(S('error') != null && S('error') < 50, 'بعد از هر جلسه علت غلط‌ها را بزن؛ نشتی درصدت همین‌جا پیدا می‌شود.', 'analytics', '');
  const C = sub => sc(s, 'selfcontrol.study', sub);
  add(C('distract') != null && C('distract') < 45, 'گوشی را در اتاق دیگر بگذار؛ دور کردن وسوسه از مقاومت کردن آسان‌تر است.', 'habits', 'Duckworth و همکاران 2016');
  const auto = sc(s, 'motivation.sdt', 'auto'), ctrl = sc(s, 'motivation.sdt', 'ctrl');
  add(ctrl != null && auto != null && ctrl > auto + 15, 'انگیزه‌ات بیشتر از فشار بیرونی است؛ هدف‌های کوچک «برای خودم» و پیشرفت سطح را در پاداش‌ها ببین.', 'rewards', 'Ryan & Deci 2000');
  const m = sc(s, 'chronotype.custom', 'morning');
  add(m != null && m >= 65, 'صبحی هستی: سخت‌ترین درس را صبح‌های جمعه و پنج‌شنبه بگذار.', 'days', '');
  add(m != null && m <= 35, 'شبی هستی: کار سنگین را عصر بگذار ولی خواب را قربانی نکن.', 'days', '');
  const short = sc(s, 'session.preference', 'short');
  add(short != null && short >= 65, 'جلسه‌ها در SS حداقل ۶۰ دقیقه‌اند؛ داخل هر جلسه دو بلوک ۲۵ دقیقه‌ای با استراحت کوتاه بزن.', 'days', '');
  const eff = sc(s, 'selfefficacy.subject', 'general');
  add(eff != null && eff < 45, 'با تست‌های ساده‌تر شروع کن و پیشرفت سطح را ببین؛ موفقیت‌های کوچک باور می‌سازد.', 'books', 'Bandura 1997');
  return out;
}
