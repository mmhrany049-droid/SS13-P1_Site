import { useMemo, useState } from 'react';
import IPIP from './ipip.json' with { type: 'json' };
import { attemptsOf, behavior } from '@ss/domain/store.js';
import { Btn, Card, Head, Meter, fa } from '@ss/ui/ui.jsx';
import { INSTRUMENTS, profileInsights } from './instruments.js';
import { InstrumentRunner, InstrumentResult } from './AssistantWidget.jsx';

const TRAITS = { C: 'وجدان‌مندی (نظم و پیگیری)', N: 'حساسیت هیجانی', E: 'برون‌گرایی', A: 'همدلی و همکاری', O: 'گشودگی به تجربه' };
const SEM = { O: 0.65, C: 0.69, E: 0.77, A: 0.70, N: 0.68 };

function score(ans) {
  const out = {};
  for (const it of IPIP.items) { const v = ans[it.n]; if (!v) continue; (out[it.trait] ||= []).push(it.key < 0 ? 6 - v : v); }
  return Object.fromEntries(Object.entries(out).map(([t, v]) => { const m = v.reduce((a, x) => a + x) / v.length; const sc = (m - 1) / 4 * 100; const band = 1.96 * 18 * Math.sqrt(1 - SEM[t]); return [t, { sc, lo: Math.max(0, sc - band), hi: Math.min(100, sc + band) }]; }));
}

function hypotheses(tr, beh) {
  const out = [];
  if (tr?.C && tr.C.sc < 40) out.push(['جلسه‌های ۲۵ دقیقه‌ای و برنامه «اگر… آنگاه…» روزانه', 'Gollwitzer & Sheeran, 2006']);
  if (tr?.N && tr.N.sc > 60) out.push(['قبل از آزمون ۱۰ دقیقه نوشتن نگرانی‌ها + آزمون شبیه‌ساز بیشتر', 'Ramirez & Beilock, 2011']);
  if (tr?.O && tr.O.sc > 60) out.push(['ماموریت‌های متنوع و تست مخلوط بیشتر', 'Brunmair & Richter, 2019']);
  const best = beh.find(b => b.id === 'best'); if (best && best.n >= best.minN && best.value !== 'تفاوت معنادار نیست') out.push([`مباحث سخت در بازه «${best.value}» چیده شود`, 'رفتار خودت']);
  const g = beh.find(b => b.id === 'guess'); if (g && g.n >= g.minN) out.push([g.value.includes('حدس نزن') ? 'در استراتژی سر جلسه، حدس فقط بعد از حذف دو گزینه' : 'حدس سنجیده در استراتژی سر جلسه مجاز است', 'رفتار خودت']);
  return out;
}

export default function Profile({ s, set }) {
  const atts = useMemo(() => attemptsOf(s), [s]);
  const beh = behavior(s, atts);
  const [ans, setAns] = useState(s.profile.ipip || {}); const [open, setOpen] = useState(false);
  const done = Object.keys(ans).length === 20; const tr = s.profile.ipip ? score(s.profile.ipip) : null;
  const hyp = [...hypotheses(tr, beh), ...profileInsights(s).map(x => [x.t, x.src])]; const [run, setRun] = useState(null);
  const lastCheck = s.profileCheckins?.at(-1); const checkDue = !lastCheck || Date.now() - Date.parse(lastCheck.at) > 21 * 864e5;
  const doCheck = () => set(x => ({ ...x, profileCheckins: [...(x.profileCheckins || []), { at: new Date().toISOString(), tests: Object.keys(x.profile?.instruments || {}).length, sessions: x.sessions.length, testsDone: x.sessions.reduce((a, z) => a + Object.keys(z.answers || {}).length, 0) }].slice(-12) }));
  return (
    <div>
      <Head kicker="نیمرخ من" title="عادت‌ها و شخصیت، بدون برچسب" />
      {checkDue && <Card className="mb-5 border-2 border-[var(--ink)]"><p className="text-[17px] font-black">وقت بازبینی نیمرخ تو رسیده</p><p className="mt-1 text-[14px] text-[var(--pencil)]">بعد از چند هفته ممکن است برنامه، سرعت پیشرفت یا فشار ذهنی‌ات عوض شده باشد. یک بار تست‌های کوتاه را دوباره بگیر تا پیشنهادها با وضعیت جدید تنظیم شوند.</p><Btn className="mt-3" onClick={doCheck}>بازبینی را شروع کردم</Btn></Card>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <p className="mb-1 text-[16px] font-black">از رفتار واقعی‌ات</p>
          <p className="mb-4 text-[14px] text-[var(--pencil)]">تا داده کافی نباشد عددی نشان نمی‌دهیم.</p>
          <ul className="grid gap-3">{beh.map(b => <li key={b.id} className="rounded-[12px] bg-[var(--wash)] p-3"><p className="text-[14px] font-bold text-[var(--pencil)]">{b.fa}</p>{b.n >= b.minN && b.value ? <><p className="text-[16px] font-black">{b.value}</p>{b.detail && <p className="text-[13px] text-[var(--pencil)]">{b.detail}</p>}</> : <p className="text-[15px]">هنوز داده کافی نیست ({fa(b.n)} از {fa(b.minN)})</p>}</li>)}</ul>
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <p className="mb-1 text-[16px] font-black">پنج عامل بزرگ شخصیت (اختیاری)</p>
            <p className="mb-3 text-[14px] leading-6 text-[var(--pencil)]">۲۰ سؤال Mini-IPIP. نتیجه عدد پیوسته با بازه خطاست، نه «تیپ». خصوصی و فقط روی دستگاه خودت. ترجمه هنوز اعتبارسنجی نشده.</p>
            {tr && !open ? (<>
              <ul className="grid gap-3">{Object.entries(TRAITS).map(([k, t]) => tr[k] && <li key={k}><div className="mb-1 flex justify-between text-[14px]"><span>{t}</span><b>{fa(Math.round(tr[k].lo))}–{fa(Math.round(tr[k].hi))}</b></div><div className="relative h-3 rounded-full bg-[var(--wash)]"><div className="absolute h-3 rounded-full bg-[var(--ink)] opacity-30" style={{ right: `${tr[k].lo}%`, width: `${tr[k].hi - tr[k].lo}%` }} /><div className="absolute top-[-3px] h-[18px] w-1 rounded bg-[var(--ink)]" style={{ right: `${tr[k].sc}%` }} /></div></li>)}</ul>
              <div className="mt-4 flex gap-2"><Btn kind="soft" onClick={() => setOpen(true)}>دوباره پر کن</Btn><Btn kind="ghost" onClick={() => { set(x => ({ ...x, profile: { ...x.profile, ipip: null } })); setAns({}); }}>حذف نتایج</Btn></div>
            </>) : !open ? <Btn onClick={() => setOpen(true)}>شروع پرسشنامه (۳ دقیقه)</Btn> : (
              <div className="max-h-[56vh] overflow-auto">
                {IPIP.items.map(it => <div key={it.n} className="border-b border-[var(--rule)] py-3"><p className="mb-2 text-[15px]">{fa(it.n)}. {it.fa}</p><div className="flex flex-wrap gap-1.5">{IPIP.scale.labels_fa.map((l, i) => <button key={i} type="button" aria-pressed={ans[it.n] === i + 1} onClick={() => setAns(a => ({ ...a, [it.n]: i + 1 }))} className={`rounded-full border-2 px-3 min-h-[32px] text-[13px] font-bold ${ans[it.n] === i + 1 ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)]'}`}>{l}</button>)}</div></div>)}
                <Btn className="mt-4 w-full" disabled={!done} onClick={() => { set(x => { const at = new Date().toISOString(); const sc = score(ans); return { ...x, profile: { ...x.profile, ipip: ans, ipipAt: at, ipipScores: sc, ipipHistory: [...(x.profile?.ipipHistory || []), { at, scores: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, { score: v.sc, name: TRAITS[k] }])) }].slice(-8) } }; }); setOpen(false); }}>{done ? 'ثبت' : `${fa(20 - Object.keys(ans).length)} سؤال مانده`}</Btn>
              </div>)}
          </Card>
          <Card>
            <p className="mb-3 text-[16px] font-black">تنظیماتی که برنامه برایت پیشنهاد می‌دهد</p>
            {!hyp.length ? <p className="text-[15px] text-[var(--pencil)]">با پرسشنامه یا داده بیشتر، پیشنهادها اینجا می‌آیند.</p> : <ul className="grid gap-2">{hyp.map(([t, src], i) => <li key={i} className="rounded-[12px] bg-[var(--wash)] p-3 text-[15px]"><b>{t}</b><p className="text-[13px] text-[var(--pencil)]">چرا؟ {src}</p></li>)}</ul>}
            <p className="mt-3 text-[13px] leading-6 text-[var(--pencil)]">پرسشنامه‌ها فقط بخش کوچکی از عملکرد را توضیح می‌دهند؛ رفتار واقعی‌ات وزن بیشتری دارد و هر پیشنهاد با نتیجه واقعی اصلاح می‌شود.</p>
          </Card>
        </div>
      </div>
      <Card className="mt-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[16px] font-black">تست‌های کوتاه نیمرخ</p><p className="text-[14px] text-[var(--pencil)]">هر کدام ۱ تا ۴ دقیقه. غیرتشخیصی؛ برای شخصی کردن برنامه، مرور و پاداش.</p></div></div>
        {run ? <div className="mx-auto max-w-[560px]"><InstrumentRunner ins={run} s={s} set={set} onDone={() => setRun(null)} /><button type="button" className="mt-3 text-[13px] font-bold text-[var(--bad)]" onClick={() => setRun(null)}>انصراف</button></div> :
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{INSTRUMENTS.map(x => { const r = s.profile?.instruments?.[x.id]; return <div key={x.id} className="rounded-[12px] bg-[var(--wash)] p-4"><p className="text-[15px] font-black">{x.emoji} {x.title}</p><p className="mb-3 text-[13px] text-[var(--pencil)]">{x.about}</p>{r ? <InstrumentResult s={s} ins={x} /> : null}<Btn kind={r ? 'ghost' : 'soft'} className="mt-3 min-h-[36px] w-full text-[14px]" onClick={() => setRun(x)}>{r ? 'دوباره پر کن' : `شروع (${fa(x.items.length)} سؤال)`}</Btn></div>; })}</div>}
      </Card>
    </div>
  );
}
