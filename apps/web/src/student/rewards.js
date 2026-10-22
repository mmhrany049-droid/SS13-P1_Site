// SS 7.1 — personalised rewards: what motivates ME (onboarding), shop priced from my own study:leisure ratio,
// quests built from my weak spots + my active habits + starred tests, a weekly challenge picked from my data,
// one-time badges and a savings goal. Everything lands in the same append-only ledger (store.settleRewards).
import * as E from '@ss/domain/engine.js';
import { attemptsOf, questsFor, sessionStats, todayStr, addDays, weekStart, uid, DAY, reviewQueue, rewardSummary } from '@ss/domain/store.js';
import { dayDone, planned, habitStage } from '@ss/domain/habits.js';

export const MOTIVATORS = [
  { id: 'game', fa: 'بازی', emoji: '🎮', items: [['۳۰ دقیقه بازی', 30], ['یک ساعت بازی آخر هفته', 60]] },
  { id: 'series', fa: 'فیلم و سریال', emoji: '🎬', items: [['یک قسمت سریال', 45], ['یک فیلم کامل', 120]] },
  { id: 'social', fa: 'شبکه‌های اجتماعی', emoji: '📱', items: [['۲۰ دقیقه گوشی آزاد', 20], ['۴۵ دقیقه گوشی آزاد', 45]] },
  { id: 'outing', fa: 'بیرون رفتن', emoji: '🚶', items: [['بیرون رفتن با دوستان', 150], ['پیاده‌روی و کافه', 90]] },
  { id: 'food', fa: 'خوراکی', emoji: '🍕', items: [['خوراکی محبوب', 20], ['شام بیرون', 120]] },
  { id: 'buy', fa: 'خرید', emoji: '🛍️', items: [['خرید کوچک', 120], ['خرید بزرگ‌تر', 400]] },
  { id: 'sport', fa: 'ورزش و بازی بیرون', emoji: '⚽', items: [['فوتبال/ورزش اضافه', 90]] },
  { id: 'music', fa: 'موسیقی و ساز', emoji: '🎵', items: [['یک ساعت ساز یا موسیقی', 60]] },
  { id: 'rest', fa: 'استراحت و خواب', emoji: '😴', items: [['صبح جمعه بدون برنامه', 120], ['چرت ۲۰ دقیقه‌ای', 20]] },
  { id: 'hobby', fa: 'سرگرمی شخصی', emoji: '🎨', items: [['یک ساعت سرگرمی', 60]] },
];
export const RATIOS = [[2, 'سخاوتمند (۲ به ۱)'], [3, 'متعادل (۳ به ۱)'], [4, 'سخت‌گیر (۴ به ۱)']];
/** coins = study minutes; an item worth L minutes of leisure costs L × ratio coins. */
/** Dynamic price: frequent/easy-to-use rewards become slightly more expensive;
 * difficult or rarely used rewards get a discount. The bounds prevent punishment loops. */
export const priceOf = (leisureMin, ratio = 3, { uses = 0, difficulty = 1, recentUses = 0 } = {}) => {
  const demand = Math.min(0.35, uses * 0.04 + recentUses * 0.06);
  const effort = Math.max(-0.20, Math.min(0.20, (difficulty - 1) * 0.12));
  return Math.max(10, Math.round(leisureMin * ratio * (1 + demand - effort) / 5) * 5);
};
export function suggestShop(profile, existing = []) {
  const have = new Set(existing.map(x => x.title)); const out = [];
  for (const m of MOTIVATORS.filter(x => (profile.motivators || []).includes(x.id))) for (const [t, min] of m.items) if (!have.has(t)) out.push({ id: uid(), title: t, emoji: m.emoji, price: priceOf(min, profile.ratio, { difficulty: min < 30 ? 0.9 : 1.1 }), minutes: min, motivator: m.id, weekly: min >= 100 ? 1 : 3 });
  return out;
}
export const weeklyUses = (s, itemId, ws = weekStart()) => (s.redemptions || []).filter(r => r.itemId === itemId && todayStr(new Date(r.at)) >= ws).length;
export function canRedeem(s, it, coins) {
  if (coins < it.price) return { ok: false, why: `${E.toFa(it.price - coins)} سکه کم داری.` };
  if (it.weekly && weeklyUses(s, it.id) >= it.weekly) return { ok: false, why: `سقف این پاداش ${E.toFa(it.weekly)} بار در هفته است.` };
  return { ok: true };
}

const realSessions = s => s.sessions.filter(x => !x.legacy && !x.historical);
const avgBlock = s => { const r = realSessions(s).filter(x => Date.now() - Date.parse(x.at) < 14 * DAY).map(x => Object.keys(x.answers || {}).length).filter(Boolean); return r.length ? r.reduce((a, x) => a + x, 0) / r.length : 12; };

/** Today's quests = the standard three (adaptive weak-topic size) + one per habit planned today + starred review. */
export function dailyQuests(s, atts = attemptsOf(s), date = todayStr()) {
  const base = questsFor(s, atts, date).map(q => q.id === 'weak' ? { ...q, target: Math.max(8, Math.min(25, Math.round(avgBlock(s)))), title: q.title.replace(/^[۰-۹]+/, E.toFa(Math.max(8, Math.min(25, Math.round(avgBlock(s)))))) } : q).map(q => ({ ...q, done: q.progress >= q.target }));
  const out = [...base];
  for (const h of (s.habits?.list || []).filter(h => h.active !== false && planned(h, date)).slice(0, 2)) {
    const g = habitStage(s, h).k; const v = dayDone(s, h, date);
    out.push({ id: 'hb-' + h.id, title: `عادت «${h.title}»`, target: 1, progress: v ? 1 : 0, xp: [6, 6, 5, 4, 3][g], coins: [6, 6, 5, 4, 3][g], done: !!v, personal: true, hint: 'هرچه عادت جاافتاده‌تر باشد پاداش بیرونی‌اش کمتر می‌شود؛ خودِ عادت جای پاداش را می‌گیرد.' });
  }
  const starDue = reviewQueue(s, atts).dueNow.filter(x => x.starred).length;
  if (starDue >= 3) { const done = Object.entries(s.reviews || {}).filter(([ref]) => s.starred?.[ref]).reduce((a, [, r]) => a + (r.history || []).filter(h => todayStr(new Date(h.at)) === date).length, 0); out.push({ id: 'star', title: 'مرور ۵ تست ستاره‌دار', target: 5, progress: done, xp: 10, coins: 10, done: done >= 5, personal: true }); }
  return out;
}

/** Weekly challenge chosen from what my data says I need most. */
export function weeklyChallenge(s, atts = attemptsOf(s), today = todayStr()) {
  const ws = weekStart(today); const inWeek = d => d >= ws && d <= addDays(ws, 6);
  const ses = realSessions(s).filter(x => inWeek(todayStr(new Date(x.at))));
  const st = ses.map(x => sessionStats(s, x)); const N = st.reduce((a, x) => a + x.N, 0), B = st.reduce((a, x) => a + x.B, 0);
  const all = realSessions(s).slice(-60).map(x => sessionStats(s, x)); const aN = all.reduce((a, x) => a + x.N, 0), aB = all.reduce((a, x) => a + x.B, 0);
  const due = reviewQueue(s, atts).dueNow.length; const days = new Set(ses.map(x => todayStr(new Date(x.at)))).size;
  let c;
  if (aN >= 60 && aB / aN > 0.28) c = { id: 'blank', title: 'نزده‌های این هفته زیر ۲۰٪', why: `میانگین نزده‌هایت ${E.toFa(Math.round(100 * aB / aN))}٪ است`, progress: N >= 40 ? (B / N < 0.2 ? 1 : 0) : 0, target: 1, label: N ? `الان ${E.toFa(Math.round(100 * B / N))}٪ از ${E.toFa(N)} تست` : 'هنوز تستی نزده‌ای' };
  else if (due >= 25) c = { id: 'queue', title: 'صف مرور را به زیر ۱۰ کارت برسان', why: `${E.toFa(due)} کارت سررسید داری`, progress: due < 10 ? 1 : 0, target: 1, label: `الان ${E.toFa(due)} کارت` };
  else c = { id: 'days', title: '۵ روز از ۷ روز این هفته تست بزن', why: 'منظم بودن مهم‌تر از حجم است', progress: Math.min(5, days), target: 5, label: `${E.toFa(days)} روز تا الان` };
  return { ...c, key: `wk:${ws}:${c.id}`, week: ws, xp: 40, coins: 60, done: c.progress >= c.target };
}

export const BADGES = [
  { id: 'first', fa: 'اولین جلسه', emoji: '🌱', test: x => x.sessions >= 1, xp: 10 },
  { id: 't100', fa: '۱۰۰ تست', emoji: '💯', test: x => x.tests >= 100, xp: 20 },
  { id: 't500', fa: '۵۰۰ تست', emoji: '🏅', test: x => x.tests >= 500, xp: 40 },
  { id: 't2000', fa: '۲۰۰۰ تست', emoji: '🏆', test: x => x.tests >= 2000, xp: 80 },
  { id: 'e25', fa: 'تحلیلگر خطا (۲۵)', emoji: '🔍', test: x => x.analyzed >= 25, xp: 20 },
  { id: 'e200', fa: 'کارآگاه خطا (۲۰۰)', emoji: '🕵️', test: x => x.analyzed >= 200, xp: 60 },
  { id: 'r100', fa: '۱۰۰ مرور', emoji: '🔁', test: x => x.reviews >= 100, xp: 30 },
  { id: 'star10', fa: '۱۰ تست ستاره‌دار', emoji: '⭐', test: x => x.starred >= 10, xp: 10 },
  { id: 'mock1', fa: 'اولین شبه‌کنکور', emoji: '🎯', test: x => x.mocks >= 1, xp: 30 },
  { id: 'week5', fa: 'هفته منظم (۵ از ۷)', emoji: '📅', test: x => x.bestWeek >= 5, xp: 30 },
  { id: 'habit2', fa: 'عادت در مرحله تکرار', emoji: '🔗', test: x => x.habitMax >= 2, xp: 30 },
  { id: 'habit4', fa: 'اولین عادت خودکار', emoji: '⚙️', test: x => x.habitMax >= 4, xp: 100 },
];
export function badgeStats(s) {
  const real = realSessions(s); const days = [...new Set(real.map(x => todayStr(new Date(x.at))))];
  const weeks = {}; for (const d of days) { const w = weekStart(d); weeks[w] = (weeks[w] || 0) + 1; }
  return {
    sessions: real.length, tests: real.reduce((a, x) => a + Object.keys(x.answers || {}).length, 0),
    analyzed: s.sessions.reduce((a, x) => a + Object.values(x.reasons || {}).filter(r => r.length).length, 0),
    reviews: Object.values(s.reviews || {}).reduce((a, r) => a + (r.history || []).length, 0), starred: Object.keys(s.starred || {}).length,
    mocks: s.exams.filter(e => e.mockKey && (e.sittings || []).length).length, bestWeek: Math.max(0, ...Object.values(weeks)),
    habitMax: Math.max(0, ...(s.habits?.list || []).map(h => habitStage(s, h).k)),
  };
}
export const earnedBadges = s => { const st = badgeStats(s); return BADGES.filter(b => b.test(st)); };

/** Extra ledger candidates (personal quests, habit check-ins, weekly challenge, badges). */
export function personalCandidates(s) {
  if (!s.settings?.rewards) return [];
  const atts = attemptsOf(s); const today = todayStr(); const out = [];
  for (const q of dailyQuests(s, atts, today).filter(q => q.personal && q.done)) out.push({ key: `pq:${today}:${q.id}`, kind: 'quest', xp: q.xp, coins: q.coins, day: today, cap: ['pq', 30, 30], fa: 'ماموریت شخصی: ' + q.title });
  for (const h of (s.habits?.list || []).filter(h => h.active !== false)) for (let i = 0; i < 7; i++) { const d = addDays(today, -i); if (planned(h, d) && dayDone(s, h, d) === true) out.push({ key: `hb:${h.id}:${d}`, kind: 'habit', xp: 3, coins: 3, day: d, cap: ['hb', 15, 15], fa: `عادت «${h.title}»` }); }
  const wc = weeklyChallenge(s, atts, today); if (wc.done) out.push({ key: wc.key, kind: 'challenge', xp: wc.xp, coins: wc.coins, day: today, cap: ['wk', 40, 60], fa: 'چالش هفته: ' + wc.title });
  for (const b of earnedBadges(s)) out.push({ key: `bd:${b.id}`, kind: 'badge', xp: b.xp, coins: Math.round(b.xp / 2), day: today, cap: ['bd' + b.id, b.xp, b.xp], fa: `نشان ${b.emoji} ${b.fa}` });
  return out;
}
export function goalProgress(s) { const g = s.rewardProfile?.goal; if (!g?.price) return null; const r = rewardSummary(s); return { ...g, coins: r.coins, pct: Math.min(100, Math.round(100 * r.coins / g.price)) }; }
