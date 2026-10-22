import { useMemo } from 'react';
import * as E from '@ss/domain/engine.js';
import { REASONS, attemptsOf, bookById, sessionStats, topicMastery, DAY, label } from '@ss/domain/store.js';
import { Card, Head, Meter, Empty, Btn, fa, pct } from '@ss/ui/ui.jsx';

export default function Analytics({ s, go }) {
  const atts = useMemo(() => attemptsOf(s), [s]);
  const valid = atts.filter(a => a.result !== 'U');
  if (valid.length < 10) return <div><Head kicker="تحلیل" title="هنوز داده کافی نیست" /><Empty title="حداقل ۱۰ تست تصحیح‌شده لازم است" text="بعد از چند جلسه، اینجا نشتی درصد، نقشه تسلط و بینش‌های هفتگی را می‌بینی." action={<Btn onClick={() => go('practice')}>ثبت تست</Btn>} /></div>;
  const { res } = topicMastery(s, atts);
  const subjects = [...new Set(s.books.filter(b => b.active !== false).map(b => b.subject))];
  const subjStats = subjects.map(sub => {
    const ses = s.sessions.filter(x => bookById(s, x.bookId)?.subject === sub).sort((a, z) => a.at.localeCompare(z.at));
    const pts = ses.map(x => ({ t: Date.parse(x.at), p: sessionStats(s, x).P })).filter(x => x.p != null);
    let slope = null;
    if (pts.length >= 4) { const now = Date.now(); const w = pts.map(p => Math.pow(0.5, (now - p.t) / DAY / 28)); const sw = w.reduce((a, x) => a + x); const mx = pts.reduce((a, p, i) => a + w[i] * p.t, 0) / sw, my = pts.reduce((a, p, i) => a + w[i] * p.p, 0) / sw; const num = pts.reduce((a, p, i) => a + w[i] * (p.t - mx) * (p.p - my), 0), den = pts.reduce((a, p, i) => a + w[i] * (p.t - mx) ** 2, 0); slope = den ? num / den * 7 * DAY : null; }
    const a = valid.filter(x => x.subject === sub); const st = E.stats(a.map(x => x.result));
    return { sub, st, slope, pts, n: a.length };
  });
  // points lost by reason
  const wb = valid.filter(a => a.result === 'W' || a.result === 'B'); const N = valid.length;
  const byReason = {}; for (const a of wb) { const share = (a.result === 'W' ? 400 : 300) / (3 * N); const rs = a.reasons.length ? a.reasons : ['none']; for (const r of rs) byReason[r] = (byReason[r] || 0) + share / rs.length; }
  const reasonRows = Object.entries(byReason).sort((a, z) => z[1] - a[1]);
  const topRows = Object.entries(res).map(([k, m]) => { const [bId, nId] = k.split('|'); const b = bookById(s, bId); return { k, b, node: b?.nodes.find(n => n.id === nId), m }; }).filter(x => x.node).sort((a, z) => a.m.pC - z.m.pC);
  const guesses = valid.filter(a => a.isGuess); const gq = guesses.length ? guesses.filter(a => a.result === 'C').length / guesses.length : null;
  // insights with guards (spec 23 §3, simplified)
  const insights = [];
  const care = (byReason.carelessness || 0) + (byReason.misread || 0); if (care >= 3 && wb.length >= 20) insights.push({ t: `بی‌دقتی و بد خواندن صورت ${fa(care.toFixed(1))} درصد از کل درصدت را گرفته؛ ارزان‌ترین درصدی که می‌توانی پس بگیری.`, a: 'قبل از زدن گزینه، صورت سؤال را دوباره بخوان.' });
  if (gq != null && guesses.length >= 15) insights.push({ t: gq > 0.35 ? `حدس‌هایت ${fa((gq * 100).toFixed(0))}٪ درست است (بالاتر از ۲۵٪ سربه‌سر)؛ حدس سنجیده برایت سود دارد.` : gq < 0.2 ? `حدس‌هایت فقط ${fa((gq * 100).toFixed(0))}٪ درست است؛ نزدن بهتر است.` : 'بازده حدس‌هایت نزدیک سربه‌سر است؛ فقط وقتی دو گزینه را حذف کردی حدس بزن.', a: `بر اساس ${fa(guesses.length)} حدس` });
  const weakest = topRows.find(r => r.m.confidence >= 0.4); if (weakest) insights.push({ t: `ضعیف‌ترین مبحث مطمئن: «${label(weakest.b, weakest.node)}» (${weakest.b.subject}) با تسلط ${fa((weakest.m.pC * 100).toFixed(0))}٪.`, a: `بر اساس ${fa(weakest.m.n)} تست` });
  const down = subjStats.find(x => x.slope != null && x.slope < -3); if (down) insights.push({ t: `روند ${down.sub} هفته‌ای ${fa(Math.abs(down.slope).toFixed(1))} درصد پایین می‌رود.`, a: 'مرور خطاهای باز این درس را جلو بینداز.' });
  return (
    <div>
      <Head kicker="تحلیل" title="درصدت کجا می‌رود؟" />
      {insights.length > 0 && <Card className="mb-5"><p className="mb-3 text-[16px] font-black">بینش‌های این هفته</p><ul className="grid gap-3">{insights.slice(0, 5).map((x, i) => <li key={i} className="rounded-[12px] bg-[var(--wash)] p-3"><p className="text-[15px] font-bold leading-7">{x.t}</p><p className="text-[14px] text-[var(--pencil)]">{x.a}</p></li>)}</ul></Card>}
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        {subjStats.map(x => (
          <Card key={x.sub}>
            <p className="text-[15px] font-bold text-[var(--pencil)]">{x.sub}</p>
            <p className="text-[34px] font-black">{pct(x.st.P)}</p>
            <p className="text-[14px] text-[var(--pencil)]">{fa(x.n)} تست، {x.slope == null ? 'روند: داده کم' : `روند ${x.slope >= 0 ? '+' : '−'}${fa(Math.abs(x.slope).toFixed(1))} در هفته`}</p>
            <Spark pts={x.pts} />
          </Card>))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <p className="mb-1 text-[16px] font-black">نشتی درصد بر اساس علت</p>
          <p className="mb-4 text-[14px] text-[var(--pencil)]">اگر این خطاها نبود، درصد کل این‌قدر بالاتر بود.</p>
          <ul className="grid gap-3">{reasonRows.map(([r, v]) => <li key={r}><div className="mb-1 flex justify-between text-[15px]"><span>{r === 'none' ? 'بدون علت ثبت‌شده' : REASONS.find(x => x.id === r)?.fa}</span><b>{fa(v.toFixed(1))}</b></div><Meter value={v} max={reasonRows[0][1]} color={r === 'none' ? 'var(--pencil)' : 'var(--bad)'} /></li>)}</ul>
        </Card>
        <Card>
          <p className="mb-1 text-[16px] font-black">نقشه تسلط مباحث</p>
          <p className="mb-3 text-[14px] text-[var(--pencil)]">از ضعیف به قوی. کم‌رنگ = داده کم (اطمینان پایین).</p>
          <ul className="grid max-h-[52vh] gap-2 overflow-auto">{topRows.map(r => <li key={r.k} style={{ opacity: 0.45 + 0.55 * r.m.confidence }} className="grid grid-cols-[1fr_auto] items-center gap-2"><span className="truncate text-[15px]">{label(r.b, r.node)} <span className="text-[13px] text-[var(--pencil)]">، {r.b.subject}، {fa(r.m.n)} تست</span></span><b className="text-[15px]">{fa((r.m.pC * 100).toFixed(0))}٪</b><div className="col-span-2"><Meter value={r.m.pC} color={r.m.pC < 0.45 ? 'var(--bad)' : r.m.pC < 0.65 ? 'var(--amber)' : 'var(--ok)'} h={6} /></div></li>)}</ul>
        </Card>
      </div>
    </div>
  );
}

function Spark({ pts }) {
  if (pts.length < 2) return null;
  const w = 260, h = 46, ys = pts.map(p => p.p), mn = Math.min(...ys, 0), mx = Math.max(...ys, 60);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(w - (i / (pts.length - 1)) * w).toFixed(1)},${(h - ((p.p - mn) / (mx - mn || 1)) * h).toFixed(1)}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-12 w-full" aria-hidden><path d={d} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" /></svg>;
}
