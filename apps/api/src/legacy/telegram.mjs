// SS hub Telegram bot (long polling, zero dependencies). Students link their chat by sharing their own contact;
// the phone must match the phone registered in the SS app (registration or the latest .sspack).
// Answers come from the latest «summary» the student's app sent with its pack (consent «telegram»).
import { httpsJson, usableByBot, testProxy } from './proxy.mjs';

const FA = '۰۱۲۳۴۵۶۷۸۹'; export const fa = x => String(x ?? '').replace(/\d/g, d => FA[d]);
export function normPhone(raw) {
  let p = String(raw || '').replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[\s\-()]/g, '');
  if (p.startsWith('+')) p = p.slice(1); else if (p.startsWith('00')) p = p.slice(2);
  if (/^09\d{9}$/.test(p)) p = '98' + p.slice(1); else if (/^9\d{9}$/.test(p)) p = '98' + p;
  return /^\d{8,15}$/.test(p) ? p : null;
}
const jdate = iso => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)); } catch { return iso; } };
const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 60 ? `${fa(m)} دقیقه پیش` : m < 1440 ? `${fa(Math.round(m / 60))} ساعت پیش` : `${fa(Math.round(m / 1440))} روز پیش`; };

export const MENU = [['📅 برنامه امروز', '🗓 این هفته'], ['🎯 آزمون‌ها', '📊 وضعیت من'], ['🔁 مرورها', '🌱 عادت‌ها'], ['📣 اطلاعیه‌ها', '❓ راهنما']];
const kb = { keyboard: MENU.map(r => r.map(text => ({ text }))), resize_keyboard: true };
const contactKb = { keyboard: [[{ text: '📱 ارسال شماره من', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };

export class Bot {
  /** ctx: { store, findStudentByPhone(phone) → {id,name}|null, packOf(id) → pack|null, announcementsFor(id) → [], log } */
  constructor(ctx) { this.ctx = ctx; this.running = false; this.status = { state: 'stopped', error: null, username: null, since: null, lastPoll: null, proxyId: null, sent: 0, received: 0 }; this.failures = 0; }
  get cfg() { return this.ctx.store.read('telegram.json', defaultTelegram()); }
  saveCfg(fn) { return this.ctx.store.update('telegram.json', defaultTelegram(), fn); }
  proxies() { const c = this.cfg; return (c.proxies || []).filter(usableByBot); }
  /** Active proxy: the selected one; in auto mode the fastest working one; null = direct. */
  currentProxy() {
    const c = this.cfg; const list = this.proxies();
    if (c.proxyMode === 'direct' || !list.length) return null;
    if (c.proxyMode === 'auto') { const ok = list.filter(p => p.lastTest?.ok).sort((a, z) => a.lastTest.ms - z.lastTest.ms); return ok[this.failures % Math.max(1, ok.length)] || list[this.failures % list.length]; }
    return list.find(p => p.id === c.activeProxyId) || null;
  }
  async api(method, params = {}, timeout = 35000) {
    const token = this.cfg.token; if (!token) throw new Error('no-token');
    const proxy = this.currentProxy(); this.status.proxyId = proxy?.id || null;
    const r = await httpsJson(proxy, { path: `/bot${token}/${method}`, method: 'POST', body: params, timeout });
    if (!r.json) throw new Error(`HTTP ${r.status}`);
    if (!r.json.ok) { const e = new Error(r.json.description || 'telegram-error'); e.code = r.json.error_code; e.retry = r.json.parameters?.retry_after; throw e; }
    return r.json.result;
  }
  async start() {
    if (this.running) return; const c = this.cfg; if (!c.token || !c.enabled) { this.status.state = c.token ? 'disabled' : 'no-token'; return; }
    this.running = true; this.status = { ...this.status, state: 'starting', error: null };
    try { const me = await this.api('getMe', {}, 20000); this.status.username = me.username; this.saveCfg(x => ({ ...x, username: me.username })); this.status.state = 'running'; this.status.since = new Date().toISOString(); this.failures = 0;
      await this.api('setMyCommands', { commands: [['start', 'شروع و اتصال با شماره'], ['today', 'برنامه امروز'], ['week', 'این هفته'], ['exams', 'آزمون‌ها'], ['status', 'وضعیت من'], ['help', 'راهنما'], ['stop', 'قطع اتصال']].map(([command, description]) => ({ command, description })) }).catch(() => {});
    } catch (e) { this.status.state = 'error'; this.status.error = e.message; this.running = false; this.failures++; this.retryLater(); return; }
    this.loop();
  }
  stop() { this.running = false; this.status.state = 'stopped'; clearTimeout(this.retryT); }
  async restart() { this.stop(); await new Promise(r => setTimeout(r, 300)); return this.start(); }
  retryLater() { clearTimeout(this.retryT); if (!this.cfg.enabled) return; this.retryT = setTimeout(() => this.start(), Math.min(120000, 5000 * 2 ** Math.min(5, this.failures))); }
  async loop() {
    while (this.running) {
      try {
        const offset = this.cfg.offset || 0;
        const ups = await this.api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 40000);
        this.status.lastPoll = new Date().toISOString(); this.status.state = 'running'; this.status.error = null; this.failures = 0;
        for (const u of ups) { this.saveCfg(x => ({ ...x, offset: u.update_id + 1 })); this.status.received++; await this.handle(u).catch(e => this.ctx.log?.('bot handler: ' + e.message)); }
      } catch (e) {
        if (!this.running) break;
        this.failures++; this.status.state = 'reconnecting'; this.status.error = e.message;
        if (e.code === 401 || e.code === 404) { this.status.state = 'error'; this.status.error = 'توکن ربات نامعتبر است'; this.running = false; break; }
        if (e.code === 409) { this.status.error = 'ربات جای دیگری هم روشن است (webhook یا سرور دیگر)'; }
        await new Promise(r => setTimeout(r, (e.retry ? e.retry * 1000 : Math.min(60000, 2000 * 2 ** Math.min(5, this.failures)))));
      }
    }
  }
  send(chatId, text, extra = {}) { this.status.sent++; return this.api('sendMessage', { chat_id: chatId, text: text.slice(0, 4000), reply_markup: kb, ...extra }, 20000); }
  links() { return this.cfg.links || {}; }
  async handle(u) {
    const m = u.message; if (!m || m.chat?.type !== 'private') return;
    const chat = m.chat.id; const link = this.links()[chat];
    if (m.contact) {
      if (m.contact.user_id !== m.from.id) return this.send(chat, 'فقط شماره خودت را با دکمه «📱 ارسال شماره من» بفرست.', { reply_markup: contactKb });
      const phone = normPhone(m.contact.phone_number); const st = phone && this.ctx.findStudentByPhone(phone);
      if (!st) return this.send(chat, `شماره ${fa(phone ? '0' + phone.slice(2) : m.contact.phone_number)} در «${this.ctx.hubName()}» ثبت نشده.\nاول در اپ SS ثبت‌نام کن (همین شماره)، به مرکز وصل شو و یک بار «همگام‌سازی» بزن؛ بعد دوباره شماره را بفرست.`, { reply_markup: contactKb });
      this.saveCfg(x => ({ ...x, links: { ...(x.links || {}), [chat]: { studentId: st.id, phone, name: st.name, tgUser: m.from.username || '', at: new Date().toISOString() } } }));
      return this.send(chat, `سلام ${st.name} 👋\nحسابت وصل شد. از منوی پایین انتخاب کن.\n${this.cfg.welcome || ''}`.trim());
    }
    const text = String(m.text || '').trim();
    if (/^\/start/.test(text) && !link) return this.send(chat, `به ربات «${this.ctx.hubName()}» خوش آمدی.\nبرای دیدن برنامه، آزمون‌ها و وضعیتت، شماره موبایلی را که در اپ SS ثبت کرده‌ای با دکمه زیر بفرست.`, { reply_markup: contactKb });
    if (!link) return this.send(chat, 'اول با دکمه «📱 ارسال شماره من» حسابت را وصل کن.', { reply_markup: contactKb });
    if (/^\/stop|قطع اتصال/.test(text)) { this.saveCfg(x => { const l = { ...(x.links || {}) }; delete l[chat]; return { ...x, links: l }; }); return this.send(chat, 'اتصال قطع شد. هر وقت خواستی /start بزن.', { reply_markup: { remove_keyboard: true } }); }
    const pack = this.ctx.packOf(link.studentId); const sm = pack?.summary;
    const head = sm ? `\n\n⏱ آخرین همگام‌سازی: ${ago(sm.at)}` : '';
    if (!sm && !/راهنما|\/help|اطلاعیه/.test(text)) return this.send(chat, 'هنوز خلاصه‌ای از اپت نرسیده.\nدر اپ SS: «مرکز و همگام‌سازی» ← اجازه «ربات تلگرام» را روشن کن و «همگام‌سازی» را بزن.');
    if (/^\/start/.test(text)) return this.send(chat, `سلام ${link.name} 👋 از منو انتخاب کن.`);
    if (/امروز|\/today/.test(text)) {
      const t = sm.today; if (t.mode === 'off') return this.send(chat, `📅 ${jdate(t.date)}\nامروز تعطیل است؛ استراحت کن 🌿` + head);
      const items = t.items.length ? t.items.map(x => `${x.done ? '✅' : '▫️'} ${x.at ? fa(x.at) + ' · ' : ''}${x.title} (${fa(x.minutes)}′)`).join('\n') : 'کار تأییدشده‌ای نیست.';
      const ses = t.sessions.length ? `جلسه‌ها: ${fa(t.sessions.join('، '))}` : ''; const ev = t.events.length ? `\nکارهای ثابت: ${t.events.map(e => `${e.title} ${fa(e.from)}–${fa(e.to)}`).join('، ')}` : '';
      return this.send(chat, `📅 ${jdate(t.date)}${t.mode === 'catchup' ? ' (جبرانی)' : ''}\n${ses}${ev}\n\n${items}\n\n🔁 مرور سررسید: ${fa(sm.reviewsDue)} کارت` + head);
    }
    if (/هفته|\/week/.test(text)) return this.send(chat, '🗓 هفت روز پیش رو\n' + sm.week.map(d => `${jdate(d.date)}: ${fa(d.count)} کار، ${fa(d.minutes)} دقیقه · فشار ${fa(d.pct)}٪`).join('\n') + head);
    if (/آزمون|\/exams/.test(text)) return this.send(chat, sm.exams.length ? '🎯 آزمون‌های پیش رو\n' + sm.exams.map(e => `• ${e.title} — ${jdate(e.date)} (${fa(e.daysLeft)} روز دیگر)${e.P50 != null ? ` · پیش‌بینی ${fa(e.P50)}٪` : ''}`).join('\n') + head : 'آزمون پیش‌رویی ثبت نشده.' + head);
    if (/وضعیت|\/status/.test(text)) return this.send(chat, `📊 ${sm.name || link.name}\n۷ روز اخیر: ${fa(sm.last7.tests)} تست${sm.last7.percent != null ? `، درصد ${fa(sm.last7.percent)}٪` : ''}\n${sm.best ? `بهترین درصد ممکن الان: ${fa(sm.best.bestNow)}٪ (فعلی ${fa(sm.best.current)}٪)\n` : ''}سطح ${fa(sm.rewards.level)} · ${fa(sm.rewards.coins)} سکه\n⭐ تست‌های ستاره‌دار: ${fa(sm.starred)}` + head);
    if (/مرور/.test(text)) return this.send(chat, `🔁 ${fa(sm.reviewsDue)} کارت مرور سررسید داری.${sm.reviewsDue ? '\nاول مرورها، بعد تست جدید؛ ۱۵ دقیقه کافی است.' : ' 👏'}` + head);
    if (/عادت/.test(text)) return this.send(chat, sm.habits.length ? '🌱 عادت‌ها\n' + sm.habits.map(h => `• ${h.title}: مرحله «${h.stage}»${h.adherence != null ? ` · پایبندی ${fa(h.adherence)}٪` : ''}`).join('\n') + head : 'هنوز عادت فعالی نداری؛ در اپ «سیستم عادت» را ببین.' + head);
    if (/اطلاعیه/.test(text)) { const a = this.ctx.announcementsFor(link.studentId).slice(0, 5); return this.send(chat, a.length ? '📣 اطلاعیه‌ها\n\n' + a.map(x => `• ${x.title}\n${x.text || ''}`).join('\n\n') : 'اطلاعیه تازه‌ای نیست.'); }
    return this.send(chat, 'راهنما:\n📅 برنامه امروز · 🗓 این هفته · 🎯 آزمون‌ها · 📊 وضعیت من · 🔁 مرورها · 🌱 عادت‌ها · 📣 اطلاعیه‌ها\n/stop قطع اتصال\n\nداده‌ها از آخرین همگام‌سازی اپ SS می‌آیند.');
  }
  /** Send a text to linked students (optionally only some student ids). Returns count. */
  async broadcast(text, studentIds = null) {
    let n = 0; for (const [chat, l] of Object.entries(this.links())) { if (studentIds && !studentIds.includes(l.studentId)) continue; try { await this.send(chat, text); n++; } catch (e) { if (e.code === 403) this.saveCfg(x => { const ls = { ...(x.links || {}) }; delete ls[chat]; return { ...x, links: ls }; }); } await new Promise(r => setTimeout(r, 60)); }
    return n;
  }
  async testAll() { const c = this.cfg; const out = [];
    for (const p of c.proxies || []) { const r = await testProxy(p.type === 'mtproto' ? p : p, c.token); out.push([p.id, r]); }
    this.saveCfg(x => ({ ...x, proxies: (x.proxies || []).map(p => { const r = out.find(o => o[0] === p.id); return r ? { ...p, lastTest: { ...r[1], at: new Date().toISOString() } } : p; }) }));
    return out; }
}
export const defaultTelegram = () => ({ token: '', enabled: false, username: null, proxies: [], proxyMode: 'direct', activeProxyId: null, links: {}, offset: 0, notifyOnPublish: true, welcome: '' });
