import { useEffect, useMemo, useRef, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { todayStr, upcomingExams, attemptsOf, bookById, leaves, examForecast, questsFor, rewardSummary, sessionStats, uid, topicMastery, label } from '@ss/domain/store.js';
import { Card, Head, fa, pct } from '@ss/ui/ui.jsx';
import { PAGE_GUIDE, checklist, searchFaq, FAQ } from './guide.js';
import { profileStatus, profileInsights } from './instruments.js';

import LEX from './data/safetyLexicon.fa.json' with { type: 'json' };
const HN = LEX.helpNumbers; const VERIFY = HN.verified ? '' : ' (برای اطمینان شماره را بررسی کن)';
const MENU0 = [[['🧭 راهنمای تازه‌کار', 'guide'], ['✅ کارهایی که باید بکنم', 'todo']], [['🧪 تست‌های شخصیت', 'tests'], ['❓ راهنمای این صفحه', 'page']]];
const MENU = [[['📝 ثبت تست سریع', 'log'], ['📅 امروز چی کار کنم؟', 'today']], [['🎯 آمادگی آزمون', 'exam'], ['📊 وضعیت من', 'status']], [['🧭 مشاور مطالعه', 'coach'], ['🎁 پاداش و ماموریت', 'rewards']], [['🔎 جستجو', 'search']]];
const COACH = {
  root: { t: 'مشکل اصلی چیه؟', b: [[['شروع نمی‌کنم', 'c:proc'], ['زود فراموش می‌کنم', 'c:forget']], [['سر آزمون استرس دارم', 'c:anx'], ['درصدم افت کرده', 'c:drop']]] },
  proc: { t: 'بیشتر کدومه؟', b: [[['کار خیلی بزرگه', 'c:big'], ['نمی‌دونم از کجا', 'c:unclear']], [['حوصله‌ام سر میره', 'c:bored']]] },
  big: { t: 'کار رو به یه قدم ۲ دقیقه‌ای بشکن: فقط ۵ تست اول. یه جمله «اگر… آنگاه…» هم بنویس: «اگر ساعت ۱۷ شد، ۵ تست اول آلکان‌ها رو می‌زنم».\n\nمنبع: Gollwitzer & Sheeran, 2006 (فراتحلیل)', b: [[['📝 همین الان ۵ تست', 'log']]] },
  unclear: { t: 'حجم و معیار موفقیت رو مشخص کن: «۱۵ تست، هدف ۶۰٪». ماموریت‌های امروز دقیقاً همین رو بهت می‌دن.\n\nمنبع: Locke & Latham, 2002', b: [[['🎁 ماموریت‌های امروز', 'rewards']]] },
  bored: { t: 'یه لذت رو فقط به همین کار گره بزن (مثلاً موسیقی فقط موقع تست) و تست‌ها رو مخلوط بزن تا یکنواخت نباشه.\n\nمنبع: Milkman و همکاران, 2014؛ Brunmair & Richter, 2019', b: [] },
  forget: { t: 'به‌جای دوباره‌خوانی خودت رو بیازما و مرور رو فاصله‌دار کن. هر غلط و نزده خودکار به صف مرور می‌ره.\n\nمنبع: Yang و همکاران, 2021 (۲۲۲ پژوهش)؛ Cepeda و همکاران, 2008', b: [] },
  anx: { t: '۱۰ دقیقه قبل آزمون نگرانی‌هات رو بنویس و تپش قلب رو «آماده شدن بدن» تفسیر کن. چند آزمون شبیه‌ساز زمان‌دار هم بزن.\n\nمنبع: Ramirez & Beilock, 2011؛ Jamieson و همکاران, 2010\nاگه استرس ادامه‌دار بود با مشاور مدرسه یا یه بزرگ‌تر مورد اعتماد حرف بزن.', b: [] },
};

export function AssistantChat({ s, set, go, page = 'home', compact = false, onTab }) {
  const atts = useMemo(() => attemptsOf(s), [s]);
  const [msgs, setMsgs] = useState([]);
  const [ctx, setCtx] = useState({});
  const [text, setText] = useState('');
  const end = useRef(null);
  const bot = (t, b = [], extra = {}) => setMsgs(m => [...m, { from: 'bot', t, b, id: uid(), ...extra }]);
  const me = t => setMsgs(m => [...m, { from: 'me', t, id: uid() }]);
  useEffect(() => { const c = checklist(s); bot(c.done < 6 ? `سلام ${s.me?.name || ''} 👋 تازه شروع کرده‌ای؛ ${fa(c.done)} از ${fa(c.total)} قدم را برداشته‌ای. قدم بعدی: «${c.next?.t}». هر سؤالی داری بنویس، مثلاً «کلید را از کجا بیاورم؟»` : 'سلام 👋 از منو انتخاب کن یا سؤالت را بنویس، مثلاً «امروز چی بخونم؟» یا «رمزم را فراموش کردم».', [...MENU0, ...MENU]); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs]);
  const home = [['🏠 منو', 'menu']];

  const run = (act, lbl) => {
    if (lbl) me(lbl);
    const [k, v] = act.split(/:(.+)/);
    if (k === 'menu') return bot('چه کار کنیم؟', [...MENU0, ...MENU]);
    if (k === 'guide') { const c = checklist(s); const rows = c.items.filter(x => !x.done).slice(0, 3).map(x => [[`▫️ ${x.t}`, x.go === 'tests' ? 'tab:tests' : `go:${x.go}`]]);
      return bot(`راهنمای تازه‌کار 🧭\nSS سه کار اصلی می‌کند: تست‌هایت را تصحیح و تحلیل می‌کند، غلط‌ها را در زمان مناسب برای مرور برمی‌گرداند، و برنامه هفته را از روی زمان واقعی‌ات می‌چیند.\n\nپیشرفت شروع: ${fa(c.done)} از ${fa(c.total)}${c.next ? `\nقدم بعدی: ${c.next.t}` : '\nهمه قدم‌های شروع انجام شده 👏'}`, [...rows, [['📋 فهرست کامل', 'tab:todo'], ['❓ پرسش‌های پرتکرار', 'faqs']], home]); }
    if (k === 'todo') { const c = checklist(s); const td = s.placements.filter(p => p.status === 'approved' && p.date === todayStr()); const open = s.errorTasks.filter(t => t.status === 'open').length;
      const lines = [...c.items.filter(x => !x.done).slice(0, 4).map(x => `▫️ ${x.t}`), ...td.map(p => `📌 ${p.title} (${fa(p.minutes)} دقیقه)`), open ? `🔎 ${fa(open)} تحلیل خطای معوق` : null].filter(Boolean);
      return bot(lines.length ? `کارهایی که الان باید انجام بدهی:\n${lines.join('\n')}` : 'فعلاً کار عقب‌افتاده‌ای نداری 👌', [...(c.next ? [[[`شروع: ${c.next.t}`, c.next.go === 'tests' ? 'tab:tests' : `go:${c.next.go}`]]] : []), [['📅 برنامه امروز', 'today']], home]); }
    if (k === 'tests') { const ps = profileStatus(s); const ins = profileInsights(s);
      return bot(`تست‌های شخصیت و نیمرخ 🧪\n${fa(ps.done)} از ${fa(ps.total)} پر شده.\n${ps.ipip ? '✅' : '▫️'} تست شخصیت پنج‌عاملی (۲۰ سؤال)\n${ps.habits ? '✅' : '▫️'} پرسشنامه عادت و تست‌زدن\n${ps.missing.length ? `▫️ ${ps.missing.map(x => x.title).join('، ')}` : '✅ همه تست‌های کوتاه'}\n\nهمه غیرتشخیصی‌اند و فقط برای شخصی کردن برنامه و پیشنهادها.${ins.length ? `\n\nاز روی جواب‌هایت:\n• ${ins.slice(0, 3).map(x => x.t).join('\n• ')}` : ''}`, [[['🧪 شروع تست‌ها', 'tab:tests'], ['◐ نیمرخ من', 'go:profile']], home]); }
    if (k === 'page') { const g = PAGE_GUIDE[page] || PAGE_GUIDE.home; return bot(`${g.t}\n${g.what}${g.steps?.length ? `\n\n${g.steps.map((x, i) => `${fa(i + 1)}. ${x}`).join('\n')}` : ''}${g.tips?.length ? `\n\n💡 ${g.tips.join('\n💡 ')}` : ''}`, [[['❓ پرسش‌های پرتکرار', 'faqs']], home]); }
    if (k === 'faqs') return bot('کدام سؤال؟', [...FAQ.slice(0, 8).map(f => [[f.q, `faq:${f.id}`]]), [['سؤال‌های بیشتر', 'faqs2']], home]);
    if (k === 'faqs2') return bot('کدام سؤال؟', [...FAQ.slice(8, 20).map(f => [[f.q, `faq:${f.id}`]]), home]);
    if (k === 'faq') { const f = FAQ.find(x => x.id === v); return bot(f.a, [[[`رفتن به ${PAGE_GUIDE[f.go]?.t || 'تست‌ها'}`, f.go === 'tests' ? 'tab:tests' : `go:${f.go}`]], [['سؤال دیگر', 'faqs']], home]); }
    if (k === 'tab') return onTab ? onTab(v) : go(v === 'tests' ? 'profile' : 'home');
    if (k === 'log') return bot('کدام درس؟', [s.books.filter(b => b.active !== false).map(b => [b.subject, `logb:${b.id}`]), home]);
    if (k === 'logb') { const b = bookById(s, v); const ls = leaves(b).filter(n => n.qStart != null); setCtx({ bookId: v });
      const last = [...s.sessions].filter(x => x.bookId === v).sort((a, z) => z.at.localeCompare(a.at))[0];
      const rows = []; if (last) { const n = b.nodes.find(x => x.id === last.nodeId); rows.push([[`ادامه: ${label(b, n)}`, `logn:${n.id}`]]); }
      ls.filter(n => s.taught[v]?.[n.id]).slice(0, 6).forEach(n => rows.push([[label(b, n), `logn:${n.id}`]]));
      if (!ls.length) return bot('برای این کتاب هنوز بازه‌ای ثبت نشده. از صفحه «ثبت تست» یک بار بازه را وارد کن.', [[['رفتن به ثبت تست', 'go:practice']], home]);
      return bot('کدام مبحث؟', [...rows, home]); }
    if (k === 'logn') { const b = bookById(s, ctx.bookId); const n = b.nodes.find(x => x.id === v);
      const done = new Set(atts.filter(a => a.bookId === b.id).map(a => a.num)); let from = n.qStart; while (from <= n.qEnd && done.has(from)) from++; if (from > n.qEnd) from = n.qStart;
      const to = Math.min(n.qEnd, from + 9); setCtx(c => ({ ...c, nodeId: v, from, to, await: 'answers' }));
      return bot(`تست ${fa(from)} تا ${fa(to)} از «${label(b, n)}».\nپاسخ‌های ${fa(to - from + 1)} تست را پشت هم بفرست (۰ = نزده). مثل: ۳۱۴۰۲۲۱۴۳۱`, [home]); }
    if (k === 'time') { const minutes = +v; const b = bookById(s, ctx.bookId);
      const answers = {}; ctx.values.forEach((x, i) => answers[ctx.from + i] = x);
      const ses = { id: uid(), bookId: b.id, nodeId: ctx.nodeId, ranges: [{ nodeId: ctx.nodeId, from: ctx.from, to: ctx.to }], answers, guesses: {}, reasons: {}, minutes: minutes || null, timeSource: minutes ? 'estimated' : 'none', at: new Date().toISOString(), mixed: false };
      const st = sessionStats(s, ses); ses.flags = E.antiGamingFlags(st, minutes ? E.secPerQ(minutes * 60, st) : null, ctx.values);
      set(x => ({ ...x, sessions: [...x.sessions, ses] })); setCtx({});
      return bot(`ثبت شد ✅\nدرست ${fa(st.C)}، غلط ${fa(st.W)}، نزده ${fa(st.B)}${st.U ? `، بدون کلید ${fa(st.U)}` : ''}\nدرصد: ${pct(st.P)}`, [[['تحلیل خطا بعداً', `later:${ses.id}`], ['یک جلسه دیگر', 'log']], home]); }
    if (k === 'later') { set(x => ({ ...x, errorTasks: [...x.errorTasks, { id: uid(), sessionId: v, status: 'open', at: new Date().toISOString() }] })); return bot('به کارهای امروزت اضافه شد. وقتی بستی‌اش ۵ امتیاز و ۵ سکه می‌گیری.', [home]); }
    if (k === 'today') { const q = questsFor(s, atts); const open = s.errorTasks.filter(t => t.status === 'open').length; const td = { items: s.placements.filter(p => p.status === 'approved' && p.date === todayStr()) }; if (!td.items.length) td.items = null;
      const lines = [...(td?.items ? td.items.map(i => `• ${i.title} (${fa(i.minutes)} دقیقه)`) : []), ...q.filter(x => !x.done).map(x => `• ${x.title}`), open ? `• ${fa(open)} تحلیل خطای معوق` : null].filter(Boolean);
      return bot(lines.length ? `برای امروز:\n${lines.join('\n')}${td ? '' : '\n\n(برنامه آمادگی تأییدشده‌ای نداری؛ از «آمادگی آزمون» بساز.)'}` : 'امروز کاری باز نداری 👌', [[['📝 ثبت تست', 'log'], ['🎯 آمادگی آزمون', 'exam']], home]); }
    if (k === 'status') { const v2 = atts.filter(a => a.result !== 'U'); if (v2.length < 10) return bot('هنوز داده کافی نیست. حداقل ۱۰ تست تصحیح‌شده لازم است.', [[['📝 ثبت تست', 'log']], home]);
      const bySub = [...new Set(s.books.map(b => b.subject))].map(sub => { const st = E.stats(v2.filter(a => a.subject === sub).map(a => a.result)); return `• ${sub}: ${pct(st.P)} (${fa(st.N)} تست)`; });
      return bot(`وضعیت کلی:\n${bySub.join('\n')}`, [[['نشتی درصدم کجاست؟', 'leak'], ['ضعیف‌ترین مبحثم؟', 'weak']], home]); }
    if (k === 'leak') { const v2 = atts.filter(a => a.result !== 'U'); const N = v2.length; const by = {}; v2.filter(a => a.result === 'W' || a.result === 'B').forEach(a => { const sh = (a.result === 'W' ? 400 : 300) / (3 * N); (a.reasons.length ? a.reasons : ['بدون علت']).forEach(r => by[r] = (by[r] || 0) + sh / (a.reasons.length || 1)); });
      const names = { unknown: 'بلد نبودم', conceptual: 'مفهومی', forgotFormula: 'فرمول', timeShortage: 'کمبود وقت', calculation: 'محاسبه', carelessness: 'بی‌دقتی', misread: 'بد خواندن', wrongGuess: 'حدس غلط' };
      return bot(`بیشترین درصدی که از دست دادی:\n${Object.entries(by).sort((a, z) => z[1] - a[1]).slice(0, 4).map(([r, x]) => `• ${names[r] || r}: ${fa(x.toFixed(1))} درصد`).join('\n')}`, [[['📊 تحلیل کامل', 'go:analytics']], home]); }
    if (k === 'weak') { const { res } = topicMastery(s, atts); const w = Object.entries(res).filter(([, m]) => m.confidence >= 0.4).sort((a, z) => a[1].pC - z[1].pC).slice(0, 3);
      if (!w.length) return bot('هنوز روی هیچ مبحثی داده کافی نیست.', [home]);
      return bot(`ضعیف‌ترین‌ها (با اطمینان کافی):\n${w.map(([key, m]) => { const [b, n] = key.split('|'); const bb = bookById(s, b); return `• ${bb.subject}، ${label(bb, bb.nodes.find(x => x.id === n))}: ${fa(Math.round(m.pC * 100))}٪ (${fa(m.n)} تست)`; }).join('\n')}`, [[['📝 تمرین', 'log']], home]); }
    if (k === 'exam') { const ups = upcomingExams(s); if (!ups.length) return bot('هنوز آزمونی تعریف نکردی.', [[['ساخت آزمون', 'go:exam']], home]); return bot('کدام آزمون؟', [...ups.map(e => [[e.title, `examx:${e.id}`]]), home]); }
    if (k === 'examx') { const e = s.exams.find(x => x.id === v); const fc = examForecast(s, e, atts, { runs: 1500 }); if (!fc) return bot('بودجه‌بندی این آزمون خالی است.', [home]);
      const lines = Object.entries(fc.sim.sections).map(([sub, x]) => `• ${sub}: ${fa(Math.round(x.P10))} تا ${fa(Math.round(x.P90))}`);
      return bot(`${e.title}، ${fa(fc.daysLeft)} روز مانده\nشاخص آمادگی: ${fa(Math.round(fc.RI))} از ۱۰۰\n${lines.join('\n')}\nنخوانده ${fa(fc.gaps.untaught.length)}، نزده ${fa(fc.gaps.untested.length)}، در حال فراموشی ${fa(fc.gaps.fading.length)}\n\nاولویت اول: ${fc.actions[0].kind} «${label(fc.actions[0].t.b, fc.actions[0].t.node)}» (+${fa(fc.actions[0].gain.toFixed(1))} درصد در ${fa(fc.actions[0].minutes)} دقیقه)`, [[['دیدن جزئیات و برنامه', 'go:exam']], home]); }
    if (k === 'rewards') { const r = rewardSummary(s); const q = questsFor(s, atts); return bot(`سطح ${fa(r.level)}، ${fa(r.coins)} سکه\nماموریت‌ها:\n${q.map(x => `${x.done ? '✅' : '▫️'} ${x.title} (${fa(Math.min(x.progress, x.target))}/${fa(x.target)})`).join('\n')}`, [[['🛍️ فروشگاه', 'go:rewards']], home]); }
    if (k === 'coach') { const n = COACH[v || 'root']; return bot(n.t, [...n.b, home]); }
    if (k === 'c') { if (v === 'drop') return run('leak'); const n = COACH[v]; return bot(n.t, [...n.b, [['⬅️ برگشت', 'coach'], ...home]]); }
    if (k === 'search') { setCtx({ await: 'search' }); return bot('دنبال چی می‌گردی؟ (مثل «آنتالپی» یا «لگاریتم»)', [home]); }
    if (k === 'go') return go(v);
  };

  const onSend = () => {
    const t = text.trim(); if (!t) return; setText(''); me(t);
    const n = t.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
    if (E.safetyMatch(t, LEX.phrases)) return bot(`ممنون که گفتی. الان مهم‌ترین چیز خودت هستی، نه درس. اگر در خطر فوری هستی با ${fa(HN.emergency)} یا ${fa(HN.police)} تماس بگیر؛ صدای مشاور بهزیستی: ${fa(HN.counsel)}، اورژانس اجتماعی: ${fa(HN.socialEmergency)}${VERIFY}. لطفاً با یک بزرگ‌تر مورد اعتماد هم حرف بزن.`, [home]);
    if (ctx.await === 'answers') { const len = ctx.to - ctx.from + 1; const r = E.parseAnswerString(n, len);
      if (!r.ok) return bot(r.error === 'E_KEY_LENGTH' ? `${fa(r.got)} پاسخ فرستادی ولی ${fa(len)} تا لازم است. دوباره بفرست.` : 'فقط ارقام ۰ تا ۴. دوباره بفرست.', [home]);
      setCtx(c => ({ ...c, values: r.values, await: null })); return bot('حدوداً چقدر طول کشید؟', [[['۱۰ دقیقه', 'time:10'], ['۱۵', 'time:15'], ['۲۰', 'time:20']], [['۳۰', 'time:30'], ['۴۵', 'time:45'], ['نمی‌دانم', 'time:0']]]); }
    if (ctx.await === 'search') { setCtx({}); const hits = s.books.flatMap(b => b.nodes.filter(x => x.title.includes(n)).map(x => `• ${b.subject}، ${x.title}${x.qStart != null ? ` (${fa(x.qStart)}–${fa(x.qEnd)})` : ''}`));
      return bot(hits.length ? `${fa(hits.length)} نتیجه:\n${hits.slice(0, 8).join('\n')}` : 'چیزی پیدا نکردم.', [[['جستجوی دیگر', 'search']], home]); }
    const intents = [[/امروز|چی بخونم|برنامه/, 'today'], [/ثبت|تست زدم/, 'log'], [/آزمون|آماده|قلمچی|پیش‌?بینی/, 'exam'], [/ضعیف/, 'weak'], [/اشتباه|نشتی|کجا.*(غلط|اشتباه)/, 'leak'], [/وضعیت|پیشرفت|درصدم/, 'status'], [/حوصله|شروع نمی|اهمال|تنبل/, 'c:proc'], [/استرس|اضطراب/, 'c:anx'], [/فراموش|یادم میره/, 'c:forget'], [/پاداش|سکه|ماموریت/, 'rewards']];
    if (/تازه|تازه‌کار|از کجا شروع|چطور کار می|راهنما/.test(n)) return run('guide');
    if (/چه کار.*(کنم|بکنم)|کارهام|کارهای من|باید انجام/.test(n)) return run('todo');
    if (/شخصیت|نیمرخ|پرسشنامه/.test(n)) return run('tests');
    const hit = intents.find(([re]) => re.test(n)); if (hit) return run(hit[1]);
    const faq = searchFaq(n); if (faq.length) return bot(faq[0].a, [[[`رفتن به ${PAGE_GUIDE[faq[0].go]?.t || 'تست‌ها'}`, faq[0].go === 'tests' ? 'tab:tests' : `go:${faq[0].go}`]], ...faq.slice(1).map(f => [[`یا: ${f.q}`, `faq:${f.id}`]]), home]);
    bot('مطمئن نیستم منظورت را فهمیدم. یکی از این‌ها؟', [[['📅 امروز', 'today'], ['📝 ثبت تست', 'log']], [['🎯 آمادگی آزمون', 'exam'], ['🧭 مشاور', 'coach']]]);
  };

  const body = (
      <Card className={`flex flex-col p-0 ${compact ? 'h-full rounded-none shadow-none' : 'h-[70vh]'}`}>
        <div className="flex-1 overflow-auto p-4" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={m.id} className={`mb-3 flex ${m.from === 'me' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] ${m.from === 'me' ? '' : 'w-full sm:w-auto'}`}>
                <div className={`whitespace-pre-line rounded-[16px] px-4 py-3 text-[15px] leading-7 ${m.from === 'me' ? 'rounded-bl-[4px] bg-[var(--ink)] text-[var(--paper)]' : 'rounded-br-[4px] bg-[var(--wash)]'}`}>{m.t}</div>
                {m.b?.length > 0 && i === msgs.length - 1 && <div className="mt-2 grid gap-1.5">{m.b.map((row, r) => <div key={r} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0,1fr))` }}>{row.map(([l, a]) => <button key={a + l} type="button" onClick={() => run(a, l)} className="rounded-[10px] border-2 border-[var(--rule)] bg-[var(--card)] px-3 min-h-[40px] text-[14px] font-bold text-[var(--ink-deep)] hover:border-[var(--ink)]">{l}</button>)}</div>)}</div>}
              </div>
            </div>))}
          <div ref={end} />
        </div>
        <div className="flex gap-2 border-t-2 border-[var(--rule)] p-3">
          <input aria-label="پیام" className="min-w-0 flex-1 rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-4 py-2 text-[15px]" placeholder={ctx.await === 'answers' ? 'مثل ۳۱۴۰۲۲۱۴۳۱' : 'بنویس…'} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSend()} />
          <button type="button" onClick={onSend} className="rounded-[12px] bg-[var(--ink)] px-5 font-bold text-[var(--paper)]">ارسال</button>
        </div>
      </Card>);
  return compact ? body : <div><Head kicker="دستیار" title="مثل ربات تلگرام، ولی برای درس" />{body}</div>;
}
export default function Assistant(p) { return <AssistantChat {...p} />; }
