// SS v13 — «مسیر رشد تست»: the page, the 15-question start, the end-of-day check-in and the weekly review.
// Rules shown to the student: a number never changes silently (every change has a reason), «lighter» is always instant,
// a missed day carries no debt, and the check-in questions are skippable.
import { useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { todayStr, addDays } from '@ss/domain/store.js';
import * as P from '@ss/domain/testPace.js';
import { Btn, Card, Chip, Head, Meter, fa, jShort, jWeekday } from '@ss/ui/ui.jsx';
import { LineChart, Stat } from '@ss/ui/charts.jsx';
import LEX from './data/safetyLexicon.fa.json' with { type: 'json' };

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px]';
const FEEL = ['خیلی بد', 'بد', 'معمولی', 'خوب', 'خیلی خوب']; const DIFF = ['خیلی راحت', 'راحت', 'متوسط', 'سخت', 'خیلی سخت'];
const MISS = [['no_time', 'وقت نداشتم'], ['tired', 'خسته بودم'], ['no_desire', 'حوصله نداشتم'], ['sick', 'مریض بودم'], ['exam_other', 'درس/آزمون دیگری داشتم'], ['forgot', 'یادم رفت'], ['other', 'چیز دیگر']];
const MODE_FA = { calibrate: 'شناخت سطح', normal: 'عادی', recover: 'شروع مجدد کوچک', protect: 'حفاظت', freeze: 'یخ‌زده' };
const DECISION_FA = { hold: 'همین عدد', grow: 'یک پله بالاتر', ease: 'سبک‌تر', recover: 'شروع مجدد کوچک' };

export const needsCheckin = (s, now = new Date()) => {
  const p = s.pace; if (!p?.enabled || p.mode === 'freeze') return false; const d = todayStr(now); if (!P.isPlanned(s, d) || P.checkOf(s, d)) return false;
  const done = P.testsOn(s, d); const hh = (s.settings?.checkinHour || '21:30').split(':').map(Number); const late = now.getHours() * 60 + now.getMinutes() >= hh[0] * 60 + (hh[1] || 0);
  try { if (sessionStorage.getItem('ss.checkin.skip.' + d)) return false; } catch { /* private mode */ } return done >= Math.max(1, Math.round(p.target * 0.5)) || (late && done > 0);
};
const Scale = ({ value, onChange, labels, tone }) => <div className="mt-2 grid grid-cols-5 gap-1.5">{labels.map((t, i) => <button type="button" key={i} onClick={() => onChange(i + 1)} aria-pressed={value === i + 1} className={`rounded-[10px] border-2 px-1 py-2 text-[12px] font-bold leading-4 ${value === i + 1 ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)] bg-[var(--paper)]'}`}><span className="block text-[15px]">{fa(i + 1)}</span>{t}</button>)}</div>;

/** End-of-day check-in: 4 short taps + an optional note. Skippable, never nagging (one skip hides it for the day). */
export function CheckinSheet({ s, set, onClose }) {
  const today = todayStr(); const done = P.testsOn(s, today); const target = s.pace.target; const missed = done < target * 0.5;
  const [c, setC] = useState({ difficulty: null, energy: null, liking: null, tomorrow: 'same', missReason: null, note: '' }); const [care, setCare] = useState(false);
  const save = () => { const note = c.note.trim(); if (note && E.safetyMatch(note, LEX.phrases)) { setCare(true); return; }
    set(x => { const withCheck = P.saveDailyCheck(x, { d: today, ...c, note: note || null, at: new Date().toISOString() }); return P.closeDay(withCheck, today, new Date()); }); onClose(); };
  const skip = () => { try { sessionStorage.setItem('ss.checkin.skip.' + today, '1'); } catch { /* */ } onClose(); };
  if (care) return <Shell onClose={onClose}><p className="text-[18px] font-black">ممنون که گفتی.</p><p className="mt-2 text-[15px] leading-7">الان مهم‌ترین چیز خودت هستی، نه تست. اگر حالت خوب نیست با کسی که بهش اعتماد داری صحبت کن؛ در خطر فوری با {fa(LEX.helpNumbers?.emergency || 115)} تماس بگیر. چیزی از این یادداشت ذخیره نشد.</p><div className="mt-4 flex gap-2"><Btn onClick={onClose}>باشه</Btn><Btn kind="soft" onClick={() => { setCare(false); setC(x => ({ ...x, note: '' })); }}>ادامه بدون یادداشت</Btn></div></Shell>;
  return <Shell onClose={skip}>
    <p className="text-[19px] font-black">پایان روز · {fa(done)} از {fa(target)} تست</p>
    <p className="mb-3 text-[13px] text-[var(--pencil)]">چهار ضربهٔ کوتاه؛ فقط برای تنظیم عدد فردا. هر کدام را خواستی رد کن.</p>
    <p className="mt-2 text-[14px] font-bold">امروز تست زدن چقدر سخت بود؟</p><Scale value={c.difficulty} onChange={v => setC({ ...c, difficulty: v })} labels={DIFF} />
    <p className="mt-3 text-[14px] font-bold">انرژی‌ات چطور بود؟</p><Scale value={c.energy} onChange={v => setC({ ...c, energy: v })} labels={FEEL} />
    <p className="mt-3 text-[14px] font-bold">چقدر از تست زدن امروز حس خوب گرفتی؟</p><Scale value={c.liking} onChange={v => setC({ ...c, liking: v })} labels={FEEL} />
    {missed && <><p className="mt-3 text-[14px] font-bold">چه چیزی مانع شد؟ (بدون قضاوت)</p><div className="mt-2 flex flex-wrap gap-2">{MISS.map(([k, t]) => <Chip key={k} active={c.missReason === k} onClick={() => setC({ ...c, missReason: c.missReason === k ? null : k })}>{t}</Chip>)}</div></>}
    <p className="mt-3 text-[14px] font-bold">فردا؟</p><div className="mt-2 flex gap-2">{[['lighter', 'سبک‌تر'], ['same', 'همین‌طور'], ['harder', 'کمی بیشتر']].map(([k, t]) => <Chip key={k} active={c.tomorrow === k} onClick={() => setC({ ...c, tomorrow: k })}>{t}</Chip>)}</div>
    <label className="mt-3 block text-[14px] font-bold">یادداشت (اختیاری)<input className={inp} value={c.note} maxLength={140} onChange={e => setC({ ...c, note: e.target.value })} placeholder="مثلاً: بعد از ظهر تمرکزم بهتر بود" /></label>
    <div className="mt-4 flex gap-2"><Btn onClick={save}>ثبت و دیدن فردا</Btn><Btn kind="ghost" onClick={skip}>الان نه</Btn></div>
  </Shell>;
}
function Shell({ children, onClose }) { return <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-3" role="dialog" aria-modal="true"><Card className="max-h-[92vh] w-full max-w-lg overflow-auto"><div className="mb-1 flex justify-end"><button type="button" onClick={onClose} aria-label="بستن" className="text-[20px]">×</button></div>{children}</Card></div>; }

/** The 15 questions + a short «we learn your level in 3 days» note. Everything is optional. */
function Onboard({ s, set, onClose }) {
  const items = P.ONBOARD_ITEMS; const [i, setI] = useState(0); const [a, setA] = useState({}); const it = items[i];
  const finish = () => { set(x => P.ensurePace(x, todayStr(), { onboard: { answers: a } })); onClose(); };
  const val = a[it.id]; const set1 = v => setA(z => ({ ...z, [it.id]: v }));
  return <Shell onClose={onClose}>
    <p className="text-[13px] font-bold text-[var(--pencil)]">پرسش {fa(i + 1)} از {fa(items.length)} · همه اختیاری و فقط روی دستگاه خودت</p><Meter value={i + 1} max={items.length} />
    <p className="mt-4 text-[18px] font-black leading-8">{it.fa}</p>
    {it.type === 'single' && <div className="mt-3 flex flex-wrap gap-2">{it.options.map((o, k) => <Chip key={String(o)} active={val === o} onClick={() => set1(o)}>{it.labels[k]}</Chip>)}</div>}
    {it.type === 'number' && <input type="number" min={it.min} max={it.max} step="0.5" className={inp} value={val ?? ''} onChange={e => set1(e.target.value === '' ? undefined : Math.min(it.max, Math.max(it.min, +e.target.value)))} />}
    {it.type === 'scale5' && <Scale value={val} onChange={set1} labels={it.scale === 'like' ? ['اصلاً', 'کم', 'متوسط', 'زیاد', 'خیلی'] : ['اصلاً', 'کم', 'گاهی', 'اغلب', 'همیشه']} />}
    <div className="mt-5 flex flex-wrap gap-2"><Btn kind="ghost" disabled={!i} onClick={() => setI(i - 1)}>قبلی</Btn><Btn kind="soft" onClick={() => (i < items.length - 1 ? setI(i + 1) : finish())}>{val == null ? 'رد کردن' : i < items.length - 1 ? 'بعدی' : 'پایان'}</Btn>{i === items.length - 1 && val != null && <Btn onClick={finish}>شروع مسیر رشد</Btn>}<Btn kind="ghost" onClick={finish}>همین‌قدر کافی است</Btn></div>
    {i === items.length - 1 && <p className="mt-3 text-[13px] leading-6 text-[var(--pencil)]">سه روز اول فقط سطح تو را یاد می‌گیریم؛ عدد بالا نمی‌رود. «تست سنجش ۱۵تایی زمان‌دار» را بعداً از صفحهٔ مسیر رشد هم می‌شود زد.</p>}
  </Shell>;
}
/** Weekly review: 3 questions, once a week. */
function WeeklyReview({ s, set, onClose }) {
  const w = P.weekOf(todayStr()); const [r, setR] = useState({ rating: null, helped: '', plan: 'same' });
  const save = () => { set(x => P.saveWeeklyCheck(x, { w, rating: r.rating, helped: r.helped.trim() || null, plan: r.plan, at: new Date().toISOString() })); onClose(); };
  return <Shell onClose={onClose}><p className="text-[19px] font-black">مرور هفته</p>
    <p className="mt-3 text-[14px] font-bold">هفتهٔ گذشته تست زدن چطور بود؟</p><Scale value={r.rating} onChange={v => setR({ ...r, rating: v })} labels={FEEL} />
    <label className="mt-3 block text-[14px] font-bold">چه چیزی کمکت کرد؟ (اختیاری)<input className={inp} value={r.helped} maxLength={120} onChange={e => setR({ ...r, helped: e.target.value })} /></label>
    <p className="mt-3 text-[14px] font-bold">برای هفتهٔ بعد؟</p><div className="mt-2 flex gap-2">{[['lighter', 'سبک‌تر'], ['same', 'همین‌طور'], ['harder', 'کمی بیشتر']].map(([k, t]) => <Chip key={k} active={r.plan === k} onClick={() => setR({ ...r, plan: k })}>{t}</Chip>)}</div>
    <div className="mt-4 flex gap-2"><Btn onClick={save}>ثبت</Btn><Btn kind="ghost" onClick={onClose}>بعداً</Btn></div></Shell>;
}

/** Small card for the Today page and the habits page. */
export function PaceCard({ s, go }) {
  const p = s.pace; const today = todayStr(); const done = P.testsOn(s, today);
  if (!p?.enabled) return <Card><p className="text-[16px] font-black">مسیر رشد تست</p><p className="mt-1 text-[14px] leading-7 text-[var(--pencil)]">هدف تست روزانه‌ات خودش با توان واقعی‌ات بالا و پایین می‌شود؛ بدون پله‌ثابت و بدون فشار.</p><Btn className="mt-3" onClick={() => go('pace')}>شروع</Btn></Card>;
  const planned = P.isPlanned(s, today);
  return <Card><div className="flex items-start justify-between gap-3"><div><p className="text-[14px] font-bold text-[var(--pencil)]">هدف تست امروز · {MODE_FA[p.mode]}</p><p className="text-[40px] font-black leading-none">{planned ? fa(p.target) : '—'}</p></div><Btn kind="soft" onClick={() => go('pace')}>مسیر رشد</Btn></div>
    {planned ? <><div className="mt-3"><Meter value={Math.min(done, p.target)} max={p.target} /></div><p className="mt-1 text-[13px] text-[var(--pencil)]">{fa(done)} از {fa(p.target)} تست · بلوک‌های {fa(p.block || 15)}تایی با استراحت کوتاه</p></> : <p className="mt-2 text-[14px] text-[var(--pencil)]">امروز روز جبرانی است؛ بدون هدف تازه.</p>}
    {p.nextTarget && <p className="mt-2 text-[13px] text-[var(--pencil)]">فردا: <b>{fa(p.nextTarget.value)}</b> · {p.nextTarget.reasons?.[0]}</p>}</Card>;
}

export default function Pace({ s, set, go }) {
  const p = s.pace; const today = todayStr(); const [sheet, setSheet] = useState(null); const [fz, setFz] = useState({ days: 2, why: 'مریضی' });
  const pat = useMemo(() => (p ? P.weeklyPatterns(s) : null), [s.sessions, p]); const miss = useMemo(() => (p ? P.missedPlan(s, today) : null), [s, p]);
  const preview = useMemo(() => (p ? P.decideTomorrow(s, today) : null), [s, p]); const rd = useMemo(() => (p ? P.readiness(s, today) : null), [s, p]);
  const wk = P.weekOf(today); const weeklyDone = (s.weeklyChecks || []).some(w => w.w === wk);
  if (!p?.enabled) return <div><Head kicker="بیشتر" title="مسیر رشد تست" /><Card><p className="text-[17px] font-black">تعداد تست روزانه‌ات را سطح خودت تعیین می‌کند، نه یک نردبان ثابت.</p>
    <ul className="mt-3 grid gap-2 text-[14px] leading-7"><li>• سه روز اول فقط سطحت را می‌شناسیم.</li><li>• وقتی چند روز پشت‌سرهم راحت بودی و نشانهٔ خستگی نبود، یک پله کوچک بالاتر می‌رویم؛ همیشه با دلیل.</li><li>• یک روز جا افتاد؟ بدون جریمه و بدون بدهی. دو روز؟ دو روز شروع مجدد کوچک.</li><li>• «سبک‌تر» را هر وقت بزنی همان لحظه اعمال می‌شود.</li></ul><div className="mt-4 flex gap-2"><Btn onClick={() => setSheet('onboard')}>شروع با ۱۵ پرسش کوتاه</Btn><Btn kind="soft" onClick={() => set(x => P.ensurePace(x, today))}>شروع بدون پرسش (۲۰ تست)</Btn></div></Card>{sheet === 'onboard' && <Onboard s={s} set={set} onClose={() => setSheet(null)} />}</div>;
  const hist = p.history.slice(-14); const done = P.testsOn(s, today); const planned = P.isPlanned(s, today);
  const setCheckTomorrow = v => set(x => P.saveDailyCheck(x, { ...(P.checkOf(x, today) || { d: today }), d: today, tomorrow: v }));
  return <div>
    <Head kicker="مسیر رشد تست" title={<>هدف امروز <span className="text-[var(--ink)]">{planned ? fa(p.target) : '—'}</span> تست</>}><div className="flex flex-wrap gap-2"><Btn kind="soft" onClick={() => setSheet('checkin')} disabled={!planned}>چک پایان روز</Btn>{!weeklyDone && <Btn kind="soft" onClick={() => setSheet('weekly')}>مرور هفته</Btn>}</div></Head>
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="grid content-start gap-5">
        <Card>{planned ? <><Meter value={Math.min(done, p.target)} max={p.target} h={14} /><p className="mt-2 text-[15px]">{fa(done)} از {fa(p.target)} تست · حالت <b>{MODE_FA[p.mode]}</b>{p.mode === 'calibrate' && ` · ${fa(Math.max(0, 3 - (p.history.filter(h => h.done > 0).length)))} روز تا شناخت سطح`}</p>
          <p className="mt-1 text-[13px] text-[var(--pencil)]">پیشنهاد: بلوک‌های {fa(p.block || 15)}تایی با استراحت کوتاه بین‌شان. اگر وسط کار خسته شدی همین‌جا بایست؛ جریمه‌ای نیست.</p></> : <p className="text-[15px]">امروز پنجشنبه/جمعه یا روز یخ‌زده است؛ هدف تازه‌ای نیست و چیزی عقب نمی‌ماند.</p>}
          <div className="mt-4 flex flex-wrap gap-2"><Btn kind="soft" onClick={() => set(x => P.requestLighter(x, today))}>امروز سبک‌تر</Btn><Btn kind="soft" onClick={() => setCheckTomorrow('harder')}>فردا کمی بیشتر</Btn><Btn kind="ghost" onClick={() => setCheckTomorrow('lighter')}>فردا سبک‌تر</Btn></div></Card>
        <Card><p className="mb-1 text-[16px] font-black">فردا و دلیلش</p>{preview && <><p className="text-[15px]"><b className="text-[24px]">{fa(preview.value)}</b> تست · {DECISION_FA[preview.decision] || preview.decision}</p><ul className="mt-2 grid gap-1 text-[14px] text-[var(--pencil)]">{preview.reasons.map((t, i) => <li key={i}>• {t}</li>)}</ul>
          {rd && !rd.ok && preview.decision === 'hold' && <p className="mt-2 text-[12px] text-[var(--pencil)]">برای یک پله بالاتر: {rd.blockers.slice(0, 3).map(b => P.REASON_FA[b] || b).join('، ')}.</p>}</>}
          <p className="mt-2 text-[12px] text-[var(--pencil)]">این پیش‌نمایش است؛ عدد نهایی بعد از چک پایان روز تثبیت می‌شود.</p></Card>
        {hist.length >= 3 && <Card><p className="mb-2 text-[16px] font-black">هدف و انجام‌شده، ۱۴ روز اخیر</p><LineChart labels={hist.map(h => jShort(h.d))} series={[{ name: 'هدف', color: 'var(--graphite)', dash: true, values: hist.map(h => h.target) }, { name: 'انجام', color: 'var(--ink)', values: hist.map(h => h.done) }]} unit="" ariaLabel="هدف و انجام تست" /></Card>}
        {miss?.level > 0 && <Card className="border-2 border-[var(--rule)]"><p className="text-[16px] font-black">{miss.level >= 3 ? 'چند روز جا ماند؛ اشکالی ندارد' : 'یک گام کوچک برای برگشتن'}</p><p className="mt-1 text-[14px] leading-7">{miss.plan}</p>{miss.askDialog && <p className="mt-2 text-[14px]">کمک می‌کند بگویی چه چیزی سخت شد: وقت، انرژی یا حوصله؟ می‌توانی در چک پایان روز علتش را بزنی یا یخ‌زدن را روشن کنی.</p>}</Card>}
        {miss?.gentlePing && !miss.level && <Card><p className="text-[14px]">چند روز است تستی ثبت نشده. همه‌چیز خوب است؟ اگر مریض یا درگیر بودی یخ‌زدن را روشن کن تا چیزی حساب نشود.</p></Card>}
      </div>
      <div className="grid content-start gap-5">
        <Card><p className="mb-2 text-[16px] font-black">وضعیت</p><div className="grid grid-cols-3 gap-2"><Stat value={fa(p.comfort)} label="سطح راحت" /><Stat value={fa(Math.round(p.g * 100)) + '٪'} label="ضریب رشد" /><Stat value={p.ceiling ? fa(p.ceiling) : '—'} label="سقف خستگی" hint={p.ceiling ? '' : 'داده کم'} /></div></Card>
        <Card><p className="mb-2 text-[16px] font-black">یخ‌زدن (مریضی، سفر، رویداد)</p>{p.mode === 'freeze' && p.freeze ? <><p className="text-[14px]">تا {jShort(p.freeze.to)} یخ‌زده است؛ هیچ روزی حساب نمی‌شود.</p><Btn className="mt-2" kind="soft" onClick={() => set(x => P.endFreeze(x, today))}>پایان یخ‌زدن</Btn></> :
          <><div className="flex flex-wrap items-end gap-2"><label className="text-[13px] font-bold">چند روز<input type="number" min="1" max="14" className={inp + ' w-20'} value={fz.days} onChange={e => setFz({ ...fz, days: Math.max(1, Math.min(14, +e.target.value || 1)) })} /></label><Btn kind="soft" onClick={() => set(x => P.setFreeze(x, today, addDays(today, fz.days - 1), fz.why))}>روشن کن</Btn></div></>}</Card>
        <Card><p className="mb-2 text-[16px] font-black">الگوهای من</p>{pat && (pat.bestHour || pat.dropPoint || pat.strongDays.length) ? <ul className="grid gap-1 text-[14px]">{pat.bestHour && <li>بهترین بازه: {({ morning: 'صبح', noon: 'ظهر', evening: 'عصر', night: 'شب' })[pat.bestHour]}</li>}{pat.dropPoint && <li>نقطهٔ افت دقت: حدود {fa(pat.dropPoint)} تست پشت‌سرهم</li>}{pat.strongDays.length > 0 && <li>روزهای قوی‌تر: {pat.strongDays.map(d => jWeekday(addDays(today, ((d.dow - new Date(today + 'T12:00:00').getDay() + 7) % 7)))).join('، ')}</li>}</ul> : <p className="text-[14px] text-[var(--pencil)]">با چند هفته داده، بهترین ساعت و نقطهٔ افت دقتت اینجا می‌آید.</p>}</Card>
        <Card><p className="mb-2 text-[16px] font-black">چرا فلان عدد؟</p><p className="text-[13px] leading-7 text-[var(--pencil)]">قاعده‌ها ثابت و قابل‌خواندن‌اند: رشد فقط وقتی که چند روز پشت‌سرهم ≥۹۰٪ هدف را راحت زدی و نشانهٔ خستگی، کم‌دقتی، شب‌بیداری یا آزمون نزدیک نبود. ضریب‌ها قابل‌تنظیم و حدس اولیه‌اند، نه حکم علمی.</p></Card>
      </div>
    </div>
    {sheet === 'checkin' && <CheckinSheet s={s} set={set} onClose={() => setSheet(null)} />}{sheet === 'weekly' && <WeeklyReview s={s} set={set} onClose={() => setSheet(null)} />}
  </div>;
}
