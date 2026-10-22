import { useEffect, useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { normalizePhone, validPin, hashPin, ONBOARD_STEPS, phoneLabel } from './account.js';
import { setUserMeta, renameUser, currentUserId } from '@ss/domain/profiles.js';
import { GRADES, GRADE_FA, STREAMS } from '@ss/domain/curriculum.js';
import * as H from '@ss/domain/habits.js';
import { MOTIVATORS, RATIOS, suggestShop, priceOf } from './rewards.js';
import { WEEKDAYS_FA, defaultDayPlan, toMin } from '@ss/domain/schedule.js';
import { registerAtHub, siteConfig, hubError } from './sync/client.js';
import { Btn, Card, Chip, fa } from '@ss/ui/ui.jsx';
import { AuthLayout, SecretPicker, applySecret, RecoveryCard } from './Auth.jsx';
import { validEmail } from './account.js';
let pendingRecovery = null; // shown once on the last step, never stored

const inp = 'mt-1 w-full rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 text-[16px] font-normal';
const tIn = 'w-[100px] rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-center';
const Win = ({ v, onChange, label }) => <div className="flex flex-wrap items-center gap-2 text-[14px]"><span className="w-40 font-bold">{label}</span>از<input type="time" className={tIn} value={v[0]} onChange={e => onChange([e.target.value, v[1]])} />تا<input type="time" className={tIn} value={v[1]} onChange={e => onChange([v[0], e.target.value])} /></div>;
const Target = ({ v, onChange }) => <label className="flex flex-wrap items-center gap-3 text-[14px] font-bold">می‌خواهم این روزها<input type="range" min={1} max={20} step={0.5} value={v} onChange={e => onChange(+e.target.value)} className="w-48 accent-[var(--ink)]" /><b className="text-[18px] text-[var(--ink)]">{fa(v)} ساعت</b> درس بخوانم</label>;

/** Signup → personality/habit questionnaire → «روزهای من» quick setup → rewards → dashboard opens automatically. */
export default function Onboarding({ s, set, onDone }) {
  const step = Math.min(s.account?.step || 0, ONBOARD_STEPS.length - 1);
  const to = k => set(x => ({ ...x, account: { ...x.account, step: k } }));
  const TITLES = ['ثبت‌نام', 'نیمرخ تو', 'روزهای من', 'پاداش‌های تو', 'آماده‌ای'];
  return (
    <AuthLayout steps={ONBOARD_STEPS} at={step} kicker={`ساخت حساب · مرحله ${fa(step + 1)} از ${fa(ONBOARD_STEPS.length)}`} title={TITLES[step]}>
      {s.account?.legacyData && step === 0 && <p className="mb-4 rounded-[12px] bg-[var(--wash)] p-3 text-[15px]">داده‌های قبلی‌ات (جلسه‌ها، آزمون‌ها، برنامه) سر جایش است؛ فقط حسابت را کامل کن.</p>}
      {step === 0 && <Signup s={s} set={set} next={() => to(1)} />}
      {step === 1 && <ProfileQuiz s={s} set={set} next={() => to(2)} back={() => to(0)} />}
      {step === 2 && <QuickDays s={s} set={set} next={() => to(3)} back={() => to(1)} />}
      {step === 3 && <RewardPrefs s={s} set={set} next={() => to(4)} back={() => to(2)} />}
      {step === 4 && <Done s={s} set={set} onDone={onDone} back={() => to(3)} />}
    </AuthLayout>
  );
}

function Signup({ s, set, next }) {
  const [f, setF] = useState({ name: s.me?.name || '', phone: s.account?.phone ? '0' + s.account.phone.slice(2) : '', grade: s.me?.grade || 11, stream: s.me?.stream || 'rf', school: s.me?.schoolName || '', email: s.account?.email || '', secret: null, hub: s.account?.server?.url || s.settings.syncUrl || '', telegram: s.me?.consent?.telegram !== false });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [hubMsg, setHubMsg] = useState('');
  useEffect(() => { siteConfig().then(c => { if (c.hubUrl && !f.hub) setF(x => ({ ...x, hub: c.hubUrl })); }); }, []);
  const phone = normalizePhone(f.phone);
  const submit = async (online) => {
    setErr(''); setHubMsg('');
    if (f.name.trim().length < 2) return setErr('نام را کامل بنویس.');
    if (!phone) return setErr('شماره موبایل معتبر نیست (مثلاً ۰۹۱۲۳۴۵۶۷۸۹). ربات تلگرام با همین شماره اطلاعاتت را می‌دهد.');
    if (f.email.trim() && !validEmail(f.email)) return setErr('ایمیل معتبر نیست (مثلاً name@gmail.com).');
    if (f.secret && f.secret.kind !== 'none' && !f.secret.ok) return setErr(f.secret.kind === 'pin' ? 'رمز عددی ۴ تا ۶ رقم و تکرارش یکی باشد.' : 'گذرواژه حداقل ۸ کاراکتر، حرف و عدد، و تکرارش یکی باشد.');
    setBusy(true);
    let st = { ...s, me: { ...s.me, name: f.name.trim(), grade: f.grade, stream: f.stream, schoolName: f.school.trim(), consent: { ...(s.me?.consent || {}), telegram: f.telegram } }, account: { ...s.account, phone, email: f.email.trim().toLowerCase(), registeredAt: s.account?.registeredAt || new Date().toISOString(), hasSecret: !!(f.secret && f.secret.kind !== 'none'), pinHash: false }, settings: { ...s.settings, name: f.name.trim(), syncUrl: f.hub.trim() } };
    if (online && f.hub.trim()) {
      try { const srv = await registerAtHub(st, f.hub.trim()); st = { ...st, account: { ...st.account, server: srv }, hub: { ...(st.hub || {}), hubName: srv.hubName, bot: srv.bot } }; setHubMsg(`به «${srv.hubName || 'مرکز'}» وصل شدی.`); }
      catch (x) { setBusy(false); return setErr('ثبت در مرکز انجام نشد: ' + hubError(x) + ' (می‌توانی بدون مرکز ادامه بدهی.)'); }
    }
    const id = currentUserId(); renameUser(id, f.name.trim()); setUserMeta(id, { phone, email: f.email.trim().toLowerCase() }); if (f.secret && f.secret.kind !== 'none') pendingRecovery = await applySecret(id, f.secret);
    set(() => st); setBusy(false); next();
  };
  return (
    <Card>
      <p className="mb-4 text-[15px] text-[var(--pencil)]">اطلاعات پایه برای چیدن برنامه، اتصال به مرکز و ربات تلگرام.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[15px] font-bold">نام و نام خانوادگی<input autoFocus className={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label className="text-[15px] font-bold">شماره موبایل<input dir="ltr" inputMode="tel" className={inp + ' text-left'} placeholder="0912 345 6789" value={fa(f.phone)} onChange={e => setF({ ...f, phone: E.normalizeDigits(e.target.value) })} />
          <span className="mt-1 block text-[13px] font-normal text-[var(--pencil)]">{phone ? `✓ ${phoneLabel(phone)}` : 'در ربات تلگرام مرکز با همین شماره وارد می‌شوی.'}</span></label>
        <div><p className="text-[15px] font-bold">پایه</p><div className="mt-1 flex gap-2">{GRADES.map(g => <Chip key={g} active={f.grade === g} onClick={() => setF({ ...f, grade: g })}>{GRADE_FA[g]}</Chip>)}</div></div>
        <div><p className="text-[15px] font-bold">رشته</p><div className="mt-1 flex gap-2">{Object.entries(STREAMS).map(([k, v]) => <Chip key={k} active={f.stream === k} onClick={() => setF({ ...f, stream: k })}>{v}</Chip>)}</div></div>
        <label className="text-[15px] font-bold">مدرسه (اختیاری)<input className={inp} value={f.school} onChange={e => setF({ ...f, school: e.target.value })} /></label>
        <label className="text-[15px] font-bold">ایمیل (جیمیل، اختیاری)<input dir="ltr" type="email" autoComplete="email" className={inp + ' text-left'} placeholder="name@gmail.com" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <span className="mt-1 block text-[13px] font-normal text-[var(--pencil)]">برای گزارش هفتگی و بازیابی رمز از طریق مرکز.</span></label>
        <div className="sm:col-span-2 rounded-[12px] outline outline-2 outline-[var(--rule)] p-4"><p className="mb-2 text-[15px] font-black">رمز ورود این حساب</p><p className="mb-3 text-[13px] text-[var(--pencil)]">اگر دستگاه مشترک است حتماً رمز بگذار. بعد از ۵ تلاش اشتباه، ورود موقتاً قفل می‌شود.</p><SecretPicker value={f.secret} onChange={v => setF(x => ({ ...x, secret: v }))} /></div>
      </div>
      <div className="mt-5 rounded-[12px] bg-[var(--wash)] p-4">
        <p className="text-[16px] font-black">اتصال به مرکز (اختیاری)</p>
        <p className="mb-2 text-[14px] text-[var(--pencil)]">اگر مدرسه یا آموزشگاهت سایت مدیریت SS دارد، آدرسش را بزن تا کتاب‌ها، کلیدها و آزمون‌ها خودکار بیایند.</p>
        <input dir="ltr" className={inp + ' text-left'} placeholder="https://hub.example.ir" value={f.hub} onChange={e => setF({ ...f, hub: e.target.value.trim() })} />
        <label className="mt-3 flex items-start gap-2 text-[14px]"><input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--ink)]" checked={f.telegram} onChange={e => setF({ ...f, telegram: e.target.checked })} /><span>خلاصه برنامه، آزمون‌ها و درصدهایم برای ربات تلگرام مرکز فرستاده شود<span className="block text-[13px] text-[var(--pencil)]">فقط خلاصه؛ پاسخ تک‌تک تست‌ها از دستگاه بیرون نمی‌رود.</span></span></label>
      </div>
      {err && <p role="alert" className="mt-3 text-[15px] font-bold text-[var(--bad)]">{err}</p>}
      {hubMsg && <p role="status" className="mt-3 text-[15px] font-bold text-[var(--ok)]">{hubMsg}</p>}
      <div className="mt-5 flex flex-wrap gap-2">{f.hub ? <><Btn disabled={busy} onClick={() => submit(true)}>{busy ? 'در حال ثبت…' : 'ثبت‌نام و اتصال به مرکز'}</Btn><Btn kind="ghost" disabled={busy} onClick={() => submit(false)}>فعلاً بدون مرکز</Btn></> : <Btn disabled={busy} onClick={() => submit(false)}>ثبت‌نام و ادامه</Btn>}</div>
    </Card>
  );
}

function ProfileQuiz({ s, set, next, back }) {
  const q = useMemo(() => H.buildQuiz(s), []);
  const [ans, setAns] = useState(s.habits?.answers || {}); const [res, setRes] = useState(null); const [pick, setPick] = useState([]);
  const left = q.items.filter(i => !ans[i.id]).length;
  const finish = () => { const sc = H.scoreQuiz(q.items, ans); const f = H.quizFindings(sc); setRes({ sc, f }); setPick(f.filter(x => x.templateId).slice(0, 2).map(x => x.templateId)); set(x => ({ ...x, habits: { ...(x.habits || {}), answers: ans, quizAt: new Date().toISOString(), scores: sc, quizHistory: [...(x.habits?.quizHistory || []), { at: new Date().toISOString(), scores: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, { score: v.sc, name: H.SUBSCALES[k]?.[0] || k }])) }] } })); };
  const save = () => { set(x => { const list = [...(x.habits?.list || [])]; for (const t of pick) if (!list.some(h => h.templateId === t)) list.push(H.newHabit(x, t)); return { ...x, habits: { ...x.habits, list } }; }); next(); };
  return (
    <Card>
      <p className="mb-4 text-[15px] text-[var(--pencil)]">{fa(q.items.length)} جمله کوتاه. جواب درست و غلط ندارد؛ برنامه و پاداش‌ها از روی همین شخصی می‌شوند. غیرتشخیصی است و روی دستگاه خودت می‌ماند.</p>
      {!res ? <>
        <div className="grid gap-2">{q.items.map((it, i) => <div key={it.id} className={`rounded-[12px] p-3 ${ans[it.id] ? 'bg-[var(--wash)]' : 'outline outline-2 outline-[var(--rule)]'}`}><p className="mb-2 text-[15px]">{fa(i + 1)}. {it.fa}</p>
          <div className="flex flex-wrap gap-1.5">{H.QUIZ_SCALE.map((x, j) => <button type="button" key={j} aria-pressed={ans[it.id] === j + 1} className={`min-h-[34px] rounded-full border-2 px-3 text-[13px] font-bold ${ans[it.id] === j + 1 ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)]'}`} onClick={() => setAns({ ...ans, [it.id]: j + 1 })}>{x}</button>)}</div></div>)}</div>
        <div className="sticky bottom-3 mt-4 flex flex-wrap items-center gap-2 rounded-[12px] bg-[var(--card)] p-2 shadow-[0_10px_30px_-18px_rgba(60,20,35,.5)]"><Btn disabled={left > 0} onClick={finish}>{left ? `${fa(left)} جمله مانده` : 'دیدن نتیجه'}</Btn><Btn kind="ghost" onClick={back}>برگشت</Btn><button type="button" className="mr-auto text-[14px] font-bold text-[var(--pencil)] underline" onClick={next}>بعداً پر می‌کنم</button></div>
      </> : <>
        <div className="grid gap-2 sm:grid-cols-2">{Object.entries(res.sc).map(([k, v]) => <div key={k} className="rounded-[12px] bg-[var(--wash)] p-3"><div className="flex justify-between text-[14px]"><span>{H.SUBSCALES[k]?.[0]}</span><b>{fa(Math.round(v.sc))}</b></div><div className="mt-1 h-2 rounded-full bg-[var(--card)]"><div className="h-2 rounded-full bg-[var(--ink)]" style={{ width: `${v.sc}%` }} /></div></div>)}</div>
        <p className="mt-4 text-[16px] font-black">عادت‌هایی که پیشنهاد می‌شود از همین حالا شروع کنی</p>
        <p className="mb-2 text-[14px] text-[var(--pencil)]">یکی یا دو تا کافی است؛ عادت‌های زیاد با هم معمولاً رها می‌شوند.</p>
        <div className="grid gap-2">{res.f.filter(x => x.templateId).map(x => <label key={x.templateId} className="flex items-start gap-3 rounded-[12px] bg-[var(--wash)] p-3 text-[15px]"><input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--ink)]" checked={pick.includes(x.templateId)} onChange={e => setPick(p => e.target.checked ? [...p, x.templateId] : p.filter(y => y !== x.templateId))} /><span><b>{H.tpl(x.templateId)?.title}</b>{x.text && <span className="block text-[13px] text-[var(--pencil)]">{x.text}</span>}</span></label>)}
          {!res.f.some(x => x.templateId) && <p className="text-[15px]">الگوی پرخطری دیده نشد 👏 بعداً از داده‌های واقعی‌ات عادت پیشنهاد می‌شود.</p>}</div>
        <div className="mt-5 flex gap-2"><Btn onClick={save}>ادامه</Btn><Btn kind="ghost" onClick={() => setRes(null)}>تغییر جواب‌ها</Btn></div>
      </>}
    </Card>
  );
}

function QuickDays({ s, set, next, back }) {
  const base = s.settings.dayPlan || defaultDayPlan(s.settings);
  const t = base.template;
  const [school, setSchool] = useState({ prefer: [t[6]?.windows?.find(w => w.type === 'prefer')?.from || '16:00', t[6]?.windows?.find(w => w.type === 'prefer')?.to || '20:30'], can: [t[6]?.windows?.find(w => w.type === 'can')?.from || '20:30', t[6]?.windows?.find(w => w.type === 'can')?.to || '22:00'], target: Math.round((t[6]?.target || 240) / 30) / 2 });
  const [weekend, setWeekend] = useState({ thu: t[4]?.mode || 'catchup', fri: t[5]?.mode || 'catchup', prefer: ['09:00', '12:30'], can: ['16:00', '19:30'], target: Math.round((t[4]?.target || 360) / 30) / 2 });
  const okWin = ([a, z]) => toMin(a) != null && toMin(z) > toMin(a);
  const save = () => {
    const tpl = { ...t };
    const mk = (w, target, mode) => ({ mode, target: Math.round(target * 60), windows: [okWin(w.prefer) && { from: w.prefer[0], to: w.prefer[1], type: 'prefer' }, okWin(w.can) && { from: w.can[0], to: w.can[1], type: 'can' }].filter(Boolean) });
    for (const d of [6, 0, 1, 2, 3]) tpl[d] = mk(school, school.target, 'normal');
    tpl[4] = mk(weekend, weekend.target, weekend.thu); tpl[5] = mk(weekend, weekend.target, weekend.fri);
    set(x => ({ ...x, account: { ...x.account, daysSet: true }, settings: { ...x.settings, dayPlan: { ...(x.settings.dayPlan || base), template: tpl } } })); next();
  };
  return (
    <Card>
      <p className="mb-4 text-[15px] text-[var(--pencil)]">«ساعتی که می‌خواهم» اول پر می‌شود، «ساعتی که می‌توانم» فقط اگر لازم شد. هر جلسه ۶۰ تا ۱۲۰ دقیقه است. بعداً در «روزهای من» هر روز و حتی هر تاریخ را جدا می‌چینی و کلاس‌ها و ورزش را اضافه می‌کنی.</p>
      <div className="grid gap-4">
        <div className="rounded-[12px] bg-[var(--wash)] p-4"><p className="mb-2 text-[16px] font-black">شنبه تا چهارشنبه</p><div className="grid gap-2"><Win label="ساعتی که می‌خواهم" v={school.prefer} onChange={v => setSchool({ ...school, prefer: v })} /><Win label="ساعتی که می‌توانم" v={school.can} onChange={v => setSchool({ ...school, can: v })} /><Target v={school.target} onChange={v => setSchool({ ...school, target: v })} /></div></div>
        <div className="rounded-[12px] bg-[var(--wash)] p-4"><p className="mb-2 text-[16px] font-black">پنج‌شنبه و جمعه</p>
          {[['thu', 'پنج‌شنبه'], ['fri', 'جمعه']].map(([k, n]) => <div key={k} className="mb-2 flex flex-wrap items-center gap-2 text-[14px]"><span className="w-20 font-bold">{n}</span>{[['normal', 'عادی'], ['catchup', 'جبرانی'], ['off', 'تعطیل']].map(([m, t2]) => <Chip key={m} active={weekend[k] === m} onClick={() => setWeekend({ ...weekend, [k]: m })} className="min-h-[32px] text-[13px]">{t2}</Chip>)}</div>)}
          <div className="grid gap-2"><Win label="ساعتی که می‌خواهم" v={weekend.prefer} onChange={v => setWeekend({ ...weekend, prefer: v })} /><Win label="ساعتی که می‌توانم" v={weekend.can} onChange={v => setWeekend({ ...weekend, can: v })} /><Target v={weekend.target} onChange={v => setWeekend({ ...weekend, target: v })} /></div>
          <p className="mt-2 text-[13px] text-[var(--pencil)]">جبرانی = برنامه جدید ندارد؛ کارهای جامانده و جلو انداختن کارها اینجا می‌آید.</p></div>
      </div>
      <div className="mt-5 flex gap-2"><Btn onClick={save}>ذخیره و ادامه</Btn><Btn kind="ghost" onClick={back}>برگشت</Btn></div>
    </Card>
  );
}

function RewardPrefs({ s, set, next, back }) {
  const rp = s.rewardProfile || {}; const [m, setM] = useState(rp.motivators || []); const [ratio, setRatio] = useState(rp.ratio || 3); const [leisure, setLeisure] = useState(rp.leisurePerDay || 60);
  const [goal, setGoal] = useState({ title: rp.goal?.title || '', price: rp.goal?.price || '' });
  const save = () => {
    const profile = { ...rp, motivators: m, ratio, leisurePerDay: leisure, goal: goal.title && +E.normalizeDigits(goal.price) ? { title: goal.title.trim(), price: +E.normalizeDigits(goal.price) } : null };
    set(x => { const customized = (x.shop || []).some(it => !['s1', 's2', 's3', 's4'].includes(it.id)); const base = customized ? x.shop : []; return { ...x, rewardProfile: profile, shop: [...base, ...suggestShop(profile, base)].slice(0, 24) }; });
    next();
  };
  return (
    <Card>
      <p className="mb-4 text-[15px] text-[var(--pencil)]">فروشگاه پاداش از روی همین ساخته می‌شود. هر دقیقه مطالعه برنامه‌ریزی‌شده = ۱ سکه.</p>
      <div className="flex flex-wrap gap-2">{MOTIVATORS.map(x => <Chip key={x.id} active={m.includes(x.id)} onClick={() => setM(a => a.includes(x.id) ? a.filter(y => y !== x.id) : [...a, x.id])}>{x.emoji} {x.fa}</Chip>)}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><p className="mb-1 text-[15px] font-bold">نسبت مطالعه به تفریح</p><div className="flex flex-wrap gap-2">{RATIOS.map(([v, t]) => <Chip key={v} active={ratio === v} onClick={() => setRatio(v)}>{t}</Chip>)}</div><p className="mt-1 text-[13px] text-[var(--pencil)]">مثلاً ۳ به ۱: یک قسمت سریال ۴۵ دقیقه‌ای = {fa(priceOf(45, ratio))} سکه.</p></div>
        <label className="text-[15px] font-bold">تفریح معمول روزانه<div className="mt-1 flex items-center gap-3"><input type="range" min={15} max={180} step={15} value={leisure} onChange={e => setLeisure(+e.target.value)} className="w-48 accent-[var(--ink)]" /><b>{fa(leisure)} دقیقه</b></div></label>
        <label className="text-[15px] font-bold">هدف بزرگ پس‌انداز (اختیاری)<input className={inp} placeholder="مثلاً هدفون جدید" value={goal.title} onChange={e => setGoal({ ...goal, title: e.target.value })} /></label>
        <label className="text-[15px] font-bold">قیمتش به سکه<input inputMode="numeric" className={inp} placeholder="۳۰۰۰" value={fa(goal.price)} onChange={e => setGoal({ ...goal, price: E.normalizeDigits(e.target.value).replace(/\D/g, '') })} /></label>
      </div>
      <div className="mt-5 flex gap-2"><Btn onClick={save}>ذخیره و ادامه</Btn><Btn kind="ghost" onClick={back}>برگشت</Btn></div>
    </Card>
  );
}

function Done({ s, set, onDone, back }) {
  const [code] = useState(() => pendingRecovery); const [kept, setKept] = useState(!pendingRecovery);
  const finish = () => { pendingRecovery = null; set(x => ({ ...x, account: { ...x.account, onboarded: true, step: 0 } })); onDone(); };
  return (
    <Card className="text-center">
      <p className="text-[56px]">🎉</p>
      <p className="text-[28px] font-black">حسابت آماده است، {s.me?.name}</p>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-[var(--pencil)]">{(s.habits?.list || []).length ? `${fa(s.habits.list.length)} عادت هدف فعال شد. ` : ''}{s.account?.server ? `به «${s.hub?.hubName || 'مرکز'}» وصل هستی${s.hub?.bot?.username ? `؛ در تلگرام به @${s.hub.bot.username} شماره‌ات را بفرست` : ''}.` : 'هر وقت خواستی از «مرکز و همگام‌سازی» به مرکز وصل شو.'}</p>
      {code && <div className="mx-auto mt-6 max-w-md text-right"><RecoveryCard code={code} name={s.me?.name} /><label className="mt-3 flex items-center gap-2 text-[14px] font-bold"><input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={kept} onChange={e => setKept(e.target.checked)} />کد بازیابی را جای امنی نگه داشتم</label></div>}
      <div className="mt-6 flex justify-center gap-2"><Btn className="min-h-[52px] px-8 text-[17px]" disabled={!kept} onClick={finish}>ورود به داشبورد</Btn><Btn kind="ghost" onClick={back}>برگشت</Btn></div>
    </Card>
  );
}
