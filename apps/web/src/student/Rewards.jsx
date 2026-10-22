import { useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { attemptsOf, rewardSummary, uid, todayStr } from '@ss/domain/store.js';
import { dailyQuests, weeklyChallenge, BADGES, badgeStats, MOTIVATORS, RATIOS, suggestShop, canRedeem, weeklyUses, priceOf, goalProgress } from './rewards.js';
import { Btn, Card, Chip, Head, Meter, fa, jShort } from '@ss/ui/ui.jsx';

const inp = 'rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2';
const EMOJI = ['⭐', '🎮', '🎬', '📱', '🚶', '🍕', '🛍️', '⚽', '🎵', '😴', '🎨', '🎧', '☕', '🎁'];

/** 7.1 personalised rewards: quests from my data + habits, weekly challenge, badges, my own shop and savings goal. */
export default function Rewards({ s, set }) {
  const atts = useMemo(() => attemptsOf(s), [s.sessions, s.books, s.exams]);
  const r = rewardSummary(s); const [tab, setTab] = useState('today');
  return (
    <div>
      <Head kicker="پاداش" title={`سطح ${fa(r.level)}`}>
        <div className="text-left"><p className="text-[40px] font-black leading-none text-[var(--amber)]">{fa(r.coins)}</p><p className="text-[14px] text-[var(--pencil)]">سکه قابل خرج</p></div>
      </Head>
      <Card className="mb-5"><div className="mb-2 flex justify-between text-[14px]"><span>{fa(r.xp)} امتیاز تجربه</span><span>سطح بعد: {fa(r.next)}</span></div><Meter value={r.xp - r.prev} max={r.next - r.prev} h={14} />
        <p className="mt-2 text-[14px] text-[var(--pencil)]">{fa(r.consistency)} روز فعال از ۱۴ روز اخیر. زنجیره شکننده نداریم؛ یک روز جا افتادن چیزی را خراب نمی‌کند، دو روز پشت هم را نگذار.</p></Card>
      <div className="mb-5 flex flex-wrap gap-2">{[['today', 'امروز و این هفته'], ['shop', 'فروشگاه من'], ['badges', 'نشان‌ها'], ['prefs', 'شخصی‌سازی'], ['log', 'از کجا آمد؟']].map(([k, t]) => <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{t}</Chip>)}</div>
      {tab === 'today' && <Today s={s} set={set} atts={atts} />}
      {tab === 'shop' && <Shop s={s} set={set} coins={r.coins} />}
      {tab === 'badges' && <Badges s={s} />}
      {tab === 'prefs' && <Prefs s={s} set={set} />}
      {tab === 'log' && <Card><ul className="grid max-h-[60vh] gap-1 overflow-auto text-[14px]">{[...r.ev].filter(e => e.xp || e.coins).sort((a, z) => z.at.localeCompare(a.at)).slice(0, 80).map((e, i) => <li key={i} className="flex justify-between border-b border-[var(--rule)] py-1.5"><span>{jShort(e.at)}، {e.fa}</span><span className="text-[var(--pencil)]">{[e.xp ? `${fa(e.xp)} امتیاز` : '', e.coins ? `${fa(Math.round(e.coins))} سکه` : ''].filter(Boolean).join(' · ')}</span></li>)}</ul>
        <p className="mt-3 text-[13px] text-[var(--pencil)]">جلسه‌های مشکوک (خیلی سریع یا گزینه‌های یکسان) و تست‌های قبلیِ واردشده پاداش ندارند. سکه فقط از دقیقه‌های انجام‌شده برنامه می‌آید (حداکثر ۳۶۰ در روز).</p></Card>}
    </div>
  );
}

function Today({ s, set, atts }) {
  const qs = dailyQuests(s, atts); const wc = weeklyChallenge(s, atts); const g = goalProgress(s);
  const swap = () => set(x => ({ ...x, swaps: { ...x.swaps, [todayStr()]: (x.swaps[todayStr()] || 0) + 1 } }));
  return <div className="grid gap-5 lg:grid-cols-2">
    <Card>
      <div className="mb-3 flex items-center justify-between"><p className="text-[16px] font-black">ماموریت‌های امروز</p>{!s.swaps[todayStr()] && <Btn kind="ghost" className="min-h-[34px] text-[14px]" onClick={swap}>عوض کن</Btn>}</div>
      <ul className="grid gap-3">{qs.map(q => <li key={q.id} className={`rounded-[12px] p-3 ${q.personal ? 'bg-[var(--card)] outline outline-2 outline-[var(--ink-faint)]' : 'bg-[var(--wash)]'}`}>
        <div className="mb-2 flex justify-between gap-2 text-[15px]"><b>{q.done ? '✅ ' : ''}{q.title}</b><span className="shrink-0 text-[13px] text-[var(--pencil)]">{fa(q.xp)} امتیاز · {fa(q.coins)} سکه</span></div>
        <Meter value={Math.min(q.progress, q.target)} max={q.target} color={q.done ? 'var(--ok)' : 'var(--ink)'} h={6} />
        <p className="mt-1 text-[12px] text-[var(--pencil)]">{fa(Math.min(q.progress, q.target))} از {fa(q.target)}{q.personal ? ' · مخصوص تو' : ''}{q.hint ? ` · ${q.hint}` : ''}</p></li>)}</ul>
      <p className="mt-4 text-[13px] leading-6 text-[var(--pencil)]">ماموریت‌ها از ضعیف‌ترین مبحثت، اندازه معمول بلوک‌هایت، عادت‌های فعالت و تست‌های ستاره‌دار ساخته می‌شوند.</p>
    </Card>
    <div className="grid content-start gap-5">
      <Card className="bg-[var(--graphite)] text-[var(--paper)]"><p className="text-[13px] font-bold opacity-75">چالش این هفته</p><p className="mt-1 text-[22px] font-black">{wc.done ? '✅ ' : ''}{wc.title}</p><p className="mt-1 text-[14px] opacity-80">چرا تو؟ {wc.why} · {wc.label}</p>
        <div className="mt-3"><Meter value={Math.min(wc.progress, wc.target)} max={wc.target} color="var(--amber)" /></div><p className="mt-2 text-[13px] opacity-75">جایزه: {fa(wc.xp)} امتیاز و {fa(wc.coins)} سکه</p></Card>
      {g ? <Card><p className="text-[16px] font-black">🎯 هدف پس‌انداز: {g.title}</p><div className="mt-2 flex justify-between text-[14px]"><span>{fa(g.coins)} از {fa(g.price)} سکه</span><b>{fa(g.pct)}٪</b></div><Meter value={g.pct} max={100} color="var(--amber)" /><p className="mt-2 text-[13px] text-[var(--pencil)]">با این سرعت هر روز برنامه‌ات را کامل کنی، {fa(Math.max(0, Math.ceil((g.price - g.coins) / Math.max(30, s.settings.weekdayMin || 120))))} روز دیگر می‌رسی.</p></Card>
        : <Card><p className="text-[15px]">هدف بزرگ پس‌انداز نداری. از «شخصی‌سازی» یکی تعریف کن؛ پس‌انداز برای یک چیز بزرگ، انگیزه بلندمدت می‌سازد.</p></Card>}
    </div>
  </div>;
}

function Shop({ s, set, coins }) {
  const [msg, setMsg] = useState(''); const [f, setF] = useState({ title: '', price: '', emoji: '⭐', weekly: '' }); const [edit, setEdit] = useState(null);
  const rp = s.rewardProfile || {};
  const redeem = it => { const c = canRedeem(s, it, coins); if (!c.ok) return setMsg(c.why); set(x => ({ ...x, redemptions: [...x.redemptions, { id: uid(), itemId: it.id, price: it.price, at: new Date().toISOString() }] })); setMsg(`نوش جانت: ${it.title} 🎉`); };
  const save = () => { const p = +E.normalizeDigits(f.price); if (!f.title.trim() || !p) return; const it = { title: f.title.trim(), price: p, emoji: f.emoji, weekly: +E.normalizeDigits(f.weekly) || null };
    set(x => ({ ...x, shop: edit ? x.shop.map(z => z.id === edit ? { ...z, ...it } : z) : [...x.shop, { id: uid(), ...it }] })); setF({ title: '', price: '', emoji: '⭐', weekly: '' }); setEdit(null); };
  const sug = suggestShop(rp, s.shop);
  return <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
    <Card>
      <p className="mb-3 text-[16px] font-black">فروشگاه پاداش خودت</p>
      <ul className="grid gap-2">{s.shop.map(it => { const used = weeklyUses(s, it.id); return <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[var(--wash)] px-3 py-2">
        <span className="text-[15px]">{it.emoji} {it.title}{it.weekly ? <span className="block text-[12px] text-[var(--pencil)]">{fa(used)} از {fa(it.weekly)} بار این هفته</span> : null}</span>
        <span className="flex items-center gap-2"><button type="button" className="text-[13px] text-[var(--pencil)] underline" onClick={() => { setEdit(it.id); setF({ title: it.title, price: String(it.price), emoji: it.emoji || '⭐', weekly: it.weekly ? String(it.weekly) : '' }); }}>ویرایش</button>
          <button type="button" aria-label="حذف" className="text-[var(--pencil)]" onClick={() => set(x => ({ ...x, shop: x.shop.filter(z => z.id !== it.id) }))}>×</button>
          <Btn kind={canRedeem(s, it, coins).ok ? 'solid' : 'line'} className="min-h-[36px] px-3 text-[14px]" onClick={() => redeem(it)}>{fa(it.price)} سکه</Btn></span></li>; })}</ul>
      {msg && <p role="status" className="mt-3 text-[15px] font-bold text-[var(--ink-deep)]">{msg}</p>}
    </Card>
    <div className="grid content-start gap-5">
      <Card><p className="mb-2 text-[16px] font-black">{edit ? 'ویرایش پاداش' : 'پاداش جدید'}</p>
        <div className="mb-2 flex flex-wrap gap-1">{EMOJI.map(e => <button key={e} type="button" aria-pressed={f.emoji === e} onClick={() => setF({ ...f, emoji: e })} className={`grid h-9 w-9 place-items-center rounded-full text-[18px] ${f.emoji === e ? 'bg-[var(--ink)]' : 'bg-[var(--wash)]'}`}>{e}</button>)}</div>
        <input aria-label="عنوان" placeholder="عنوان" className={inp + ' w-full'} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label="قیمت" inputMode="numeric" placeholder="قیمت (سکه)" className={inp} value={fa(f.price)} onChange={e => setF({ ...f, price: E.normalizeDigits(e.target.value).replace(/\D/g, '') })} /><input aria-label="سقف هفتگی" inputMode="numeric" placeholder="سقف در هفته" className={inp} value={fa(f.weekly)} onChange={e => setF({ ...f, weekly: E.normalizeDigits(e.target.value).replace(/\D/g, '') })} /></div>
        <p className="mt-2 text-[12px] text-[var(--pencil)]">با نسبت {fa(rp.ratio || 3)} به ۱: هر دقیقه تفریح = {fa(rp.ratio || 3)} سکه (مثلاً ۳۰ دقیقه = {fa(priceOf(30, rp.ratio || 3))}).</p>
        <div className="mt-2 flex gap-2"><Btn onClick={save}>{edit ? 'ذخیره' : 'افزودن'}</Btn>{edit && <Btn kind="ghost" onClick={() => { setEdit(null); setF({ title: '', price: '', emoji: '⭐', weekly: '' }); }}>لغو</Btn>}</div></Card>
      {sug.length > 0 && <Card><p className="mb-2 text-[16px] font-black">پیشنهاد از علاقه‌هایت</p><ul className="grid gap-1.5">{sug.slice(0, 6).map(it => <li key={it.title} className="flex items-center justify-between rounded-[10px] bg-[var(--wash)] px-3 py-1.5 text-[14px]"><span>{it.emoji} {it.title} · {fa(it.price)}</span><button type="button" className="font-bold text-[var(--ink)]" onClick={() => set(x => ({ ...x, shop: [...x.shop, it] }))}>+ افزودن</button></li>)}</ul></Card>}
    </div>
  </div>;
}

function Badges({ s }) {
  const st = badgeStats(s);
  return <Card><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{BADGES.map(b => { const ok = b.test(st); return <div key={b.id} className={`rounded-[12px] p-4 text-center ${ok ? 'bg-[var(--wash)]' : 'opacity-45 outline outline-2 outline-dashed outline-[var(--rule)]'}`}><p className="text-[34px]">{b.emoji}</p><p className="text-[15px] font-black">{b.fa}</p><p className="text-[12px] text-[var(--pencil)]">{ok ? 'گرفتی' : `${fa(b.xp)} امتیاز`}</p></div>; })}</div>
    <p className="mt-4 text-[13px] text-[var(--pencil)]">{fa(st.tests)} تست واقعی · {fa(st.analyzed)} خطای تحلیل‌شده · {fa(st.reviews)} مرور · {fa(st.starred)} تست ستاره‌دار</p></Card>;
}

function Prefs({ s, set }) {
  const rp = s.rewardProfile || {}; const up = p => set(x => ({ ...x, rewardProfile: { ...(x.rewardProfile || {}), ...p } }));
  const [goal, setGoal] = useState({ title: rp.goal?.title || '', price: rp.goal?.price ? String(rp.goal.price) : '' });
  const st = s.settings; const upS = p => set(x => ({ ...x, settings: { ...x.settings, ...p } }));
  return <div className="grid gap-5 lg:grid-cols-2">
    <Card><p className="mb-2 text-[16px] font-black">چه چیزی انگیزه‌ات می‌دهد؟</p><div className="flex flex-wrap gap-2">{MOTIVATORS.map(x => <Chip key={x.id} active={(rp.motivators || []).includes(x.id)} onClick={() => up({ motivators: (rp.motivators || []).includes(x.id) ? rp.motivators.filter(y => y !== x.id) : [...(rp.motivators || []), x.id] })}>{x.emoji} {x.fa}</Chip>)}</div>
      <p className="mb-1 mt-4 text-[15px] font-bold">نسبت مطالعه به تفریح</p><div className="flex flex-wrap gap-2">{RATIOS.map(([v, t]) => <Chip key={v} active={(rp.ratio || 3) === v} onClick={() => up({ ratio: v })}>{t}</Chip>)}</div>
      <div className="mt-4 grid gap-3"><label className="flex items-center justify-between text-[15px]"><span>پاداش‌ها</span><input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={st.rewards} onChange={e => upS({ rewards: e.target.checked })} /></label><label className="flex items-center justify-between text-[15px]"><span>سکه (خاموش = فقط امتیاز تجربه)</span><input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={st.coins} onChange={e => upS({ coins: e.target.checked })} /></label></div></Card>
    <Card><p className="mb-2 text-[16px] font-black">هدف بزرگ پس‌انداز</p><input className={inp + ' w-full'} placeholder="مثلاً هدفون جدید" value={goal.title} onChange={e => setGoal({ ...goal, title: e.target.value })} />
      <input inputMode="numeric" className={inp + ' mt-2 w-full'} placeholder="قیمت به سکه" value={fa(goal.price)} onChange={e => setGoal({ ...goal, price: E.normalizeDigits(e.target.value).replace(/\D/g, '') })} />
      <div className="mt-2 flex gap-2"><Btn onClick={() => up({ goal: goal.title.trim() && +goal.price ? { title: goal.title.trim(), price: +goal.price } : null })}>ذخیره هدف</Btn>{rp.goal && <Btn kind="ghost" onClick={() => { up({ goal: null }); setGoal({ title: '', price: '' }); }}>حذف</Btn>}</div>
      <p className="mt-3 text-[13px] leading-6 text-[var(--pencil)]">پاداش عادت‌ها با جاافتادنشان کم می‌شود (۶ ← ۳ امتیاز) تا انگیزه کم‌کم از خودِ کار بیاید، نه از سکه.</p></Card>
  </div>;
}
