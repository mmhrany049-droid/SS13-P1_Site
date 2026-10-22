// SS Admin v3 — Gmail (or any SMTP/IMAP provider) without dependencies.
//   send():  SMTP over TLS (465) or STARTTLS (587), AUTH PLAIN, UTF-8 MIME (text + html).
//   inbox(): IMAP over TLS (993), read-only: newest N message headers; message(): one message as plain text.
// Gmail: turn on 2-Step Verification → https://myaccount.google.com/apppasswords → 16-char App Password.
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

export const GMAIL = { smtpHost: 'smtp.gmail.com', smtpPort: 465, imapHost: 'imap.gmail.com', imapPort: 993 };
const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
const wrap76 = s => s.replace(/.{1,76}/g, m => m + '\r\n');
export const encWord = s => /^[\x20-\x7e]*$/.test(String(s)) ? String(s) : `=?UTF-8?B?${b64(s)}?=`;
const addr = (email, name) => name ? `${encWord(name)} <${email}>` : `<${email}>`;
const safeHeader = s => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 300);

/** Build an RFC 5322 message. to: string | string[]; bcc goes only into the envelope. */
export function buildMime({ from, fromName, to, subject, text, html, replyTo, headers = {} }) {
  const bnd = 'ss-' + randomBytes(12).toString('hex'); const dom = String(from).split('@')[1] || 'ss.local';
  const tos = [].concat(to || []);
  const h = [`From: ${addr(from, safeHeader(fromName))}`, tos.length ? `To: ${tos.map(x => `<${x}>`).join(', ')}` : 'To: undisclosed-recipients:;', `Subject: ${encWord(safeHeader(subject))}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, `Message-ID: <${randomBytes(10).toString('hex')}@${dom}>`, 'MIME-Version: 1.0',
    replyTo && `Reply-To: <${safeHeader(replyTo)}>`, ...Object.entries(headers).map(([k, v]) => `${k}: ${safeHeader(v)}`),
    `Content-Type: multipart/alternative; boundary="${bnd}"`].filter(Boolean);
  const part = (type, body) => `--${bnd}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(body))}`;
  return `${h.join('\r\n')}\r\n\r\n${part('text/plain', text || htmlToText(html || ''))}${part('text/html', html || `<div dir="rtl">${escapeHtml(text || '').replace(/\n/g, '<br>')}</div>`)}--${bnd}--\r\n`;
}
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const htmlToText = h => String(h).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

/** RTL, blue, mobile-friendly email layout used for every message the hub sends. */
export function layout({ title, body, button, footer = '', brand = 'SS' }) {
  const btn = button ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#1D5FA8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;display:inline-block">${escapeHtml(button.text)}</a></p>` : '';
  return `<!doctype html><html lang="fa" dir="rtl"><body style="margin:0;background:#EEF3F8;font-family:Vazirmatn,Tahoma,Arial,sans-serif;color:#1E2733">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><p style="font-size:26px;font-weight:900;color:#1D5FA8;margin:0 0 12px">${escapeHtml(brand)}</p>
<div style="background:#FBFDFF;border-radius:14px;padding:22px;line-height:1.9;font-size:15px;border:1px solid #CFDCEB"><h1 style="font-size:20px;margin:0 0 10px">${escapeHtml(title)}</h1>${body}${btn}</div>
<p style="font-size:12px;color:#5B6675;margin-top:14px;line-height:1.8">${footer}</p></div></body></html>`;
}

// ---------- SMTP ----------
function lineReader(sock) {
  let buf = ''; const waiters = []; let err = null;
  sock.on('data', d => { buf += d.toString('utf8'); pump(); }); sock.on('error', e => { err = e; pump(); }); sock.on('close', () => { err ||= new Error('connection closed'); pump(); });
  function pump() { while (waiters.length) { const m = /(^|\r\n)(\d{3}) [^\r\n]*\r\n/.exec(buf); if (m) { const end = m.index + m[0].length; const chunk = buf.slice(0, end); buf = buf.slice(end); waiters.shift().ok({ code: +m[2], text: chunk.trim() }); } else if (err) waiters.shift().bad(err); else break; } }
  return { next: () => new Promise((ok, bad) => { waiters.push({ ok, bad }); pump(); }), detach: () => sock.removeAllListeners('data') };
}
export async function smtpSend(cfg, { from, to, raw }, { timeout = 20000 } = {}) {
  const host = cfg.smtpHost || GMAIL.smtpHost; const port = +(cfg.smtpPort || GMAIL.smtpPort); const implicit = port === 465 || cfg.secure === true;
  let sock = await new Promise((ok, bad) => { const s = implicit ? tls.connect({ host, port, servername: host, rejectUnauthorized: cfg.insecure !== true }, () => ok(s)) : net.connect({ host, port }, () => ok(s)); s.once('error', bad); s.setTimeout(timeout, () => s.destroy(new Error('SMTP timeout'))); });
  let rd = lineReader(sock);
  const cmd = async (line, expect) => { if (line != null) sock.write(line + '\r\n'); const r = await rd.next(); if (expect && !expect.includes(r.code)) throw Object.assign(new Error(`SMTP ${r.code}: ${r.text.split('\r\n').pop()}`), { smtp: r.code }); return r; };
  try {
    await cmd(null, [220]); let ehlo = await cmd('EHLO ss-hub', [250]);
    if (!implicit && /STARTTLS/i.test(ehlo.text) && cfg.starttls !== false) {
      await cmd('STARTTLS', [220]); rd.detach();
      sock = await new Promise((ok, bad) => { const s = tls.connect({ socket: sock, servername: host, rejectUnauthorized: cfg.insecure !== true }, () => ok(s)); s.once('error', bad); });
      rd = lineReader(sock); ehlo = await cmd('EHLO ss-hub', [250]);
    }
    if (cfg.user) await cmd('AUTH PLAIN ' + Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString('base64'), [235]);
    await cmd(`MAIL FROM:<${from}>`, [250]);
    for (const r of [].concat(to)) await cmd(`RCPT TO:<${r}>`, [250, 251]);
    await cmd('DATA', [354]);
    const body = raw.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    sock.write(body + (body.endsWith('\r\n') ? '' : '\r\n') + '.\r\n'); await cmd(null, [250]);
    await cmd('QUIT').catch(() => {});
  } finally { sock.destroy(); }
  return { ok: true };
}

// ---------- IMAP (read-only) ----------
export class Imap {
  constructor(cfg) { this.cfg = cfg; this.n = 0; this.buf = Buffer.alloc(0); this.waiting = null; }
  async connect(timeout = 20000) {
    const host = this.cfg.imapHost || GMAIL.imapHost, port = +(this.cfg.imapPort || GMAIL.imapPort);
    this.sock = await new Promise((ok, bad) => { const s = this.cfg.imapTls === false ? net.connect({ host, port }, () => ok(s)) : tls.connect({ host, port, servername: host, rejectUnauthorized: this.cfg.insecure !== true }, () => ok(s)); s.once('error', bad); s.setTimeout(timeout, () => s.destroy(new Error('IMAP timeout'))); });
    this.sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.pump(); }); this.sock.on('error', e => { this.err = e; this.pump(); }); this.sock.on('close', () => { this.err ||= new Error('closed'); this.pump(); });
    await this.read('*');
    const q = s => '"' + String(s).replace(/(["\\])/g, '\\$1') + '"';
    await this.cmd(`LOGIN ${q(this.cfg.user)} ${q(this.cfg.pass)}`);
  }
  /** Reads one response terminated by a line starting with `tag ` (or the greeting when tag = '*'). Literals {n} are inlined. */
  read(tag) { return new Promise((ok, bad) => { this.waiting = { tag, ok, bad, lines: [] }; this.pump(); }); }
  pump() {
    const w = this.waiting; if (!w) return;
    for (;;) {
      const i = this.buf.indexOf('\r\n'); if (i < 0) break;
      let line = this.buf.subarray(0, i).toString('utf8'); const lit = /\{(\d+)\}$/.exec(line);
      if (lit) { const n = +lit[1]; if (this.buf.length < i + 2 + n) break; const data = this.buf.subarray(i + 2, i + 2 + n); this.buf = this.buf.subarray(i + 2 + n); w.lines.push({ line: line.slice(0, lit.index), literal: data }); continue; }
      this.buf = this.buf.subarray(i + 2); w.lines.push({ line });
      if (w.tag === '*' ? line.startsWith('* ') : line.startsWith(w.tag + ' ')) { this.waiting = null; if (w.tag !== '*' && !/^\S+ OK/i.test(line)) return w.bad(new Error('IMAP: ' + line.replace(/^\S+ /, ''))); return w.ok(w.lines); }
    }
    if (this.err) { this.waiting = null; w.bad(this.err); }
  }
  async cmd(c) { const tag = 'A' + (++this.n); this.sock.write(`${tag} ${c}\r\n`); return this.read(tag); }
  async close() { try { await this.cmd('LOGOUT'); } catch { /* */ } this.sock?.destroy(); }
}
export async function inbox(cfg, { limit = 25, box = 'INBOX' } = {}) {
  const im = new Imap(cfg); await im.connect();
  try {
    const sel = await im.cmd(`EXAMINE "${box}"`); const exists = +(sel.map(x => /^\* (\d+) EXISTS/.exec(x.line)).find(Boolean)?.[1] || 0);
    if (!exists) return { total: 0, items: [] };
    const from = Math.max(1, exists - limit + 1);
    const res = await im.cmd(`FETCH ${from}:${exists} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])`);
    const items = [];
    for (const r of res) if (r.literal && /FETCH/.test(r.line)) { const uid = +(/UID (\d+)/.exec(r.line)?.[1] || 0); const hd = parseHeaders(r.literal.toString('utf8')); items.push({ uid, seen: /\\Seen/.test(r.line), from: hd.from || '', to: hd.to || '', subject: hd.subject || '(بدون موضوع)', date: hd.date ? new Date(hd.date).toISOString() : null }); }
    return { total: exists, items: items.reverse() };
  } finally { await im.close(); }
}
export async function message(cfg, uid, { box = 'INBOX', maxBytes = 400000 } = {}) {
  const im = new Imap(cfg); await im.connect();
  try { await im.cmd(`EXAMINE "${box}"`); const res = await im.cmd(`UID FETCH ${+uid} (BODY.PEEK[]<0.${maxBytes}>)`); const lit = res.find(r => r.literal); if (!lit) return null; return parseMessage(lit.literal); }
  finally { await im.close(); }
}

// ---------- MIME parsing (good enough for reading mail in the panel) ----------
export function decodeWords(s) {
  return String(s || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
    const bytes = enc.toUpperCase() === 'B' ? Buffer.from(txt, 'base64') : Buffer.from(txt.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
    try { return new TextDecoder(cs.toLowerCase()).decode(bytes); } catch { return bytes.toString('utf8'); }
  });
}
export function parseHeaders(raw) { const out = {}; const unf = String(raw).replace(/\r?\n[ \t]+/g, ' '); for (const l of unf.split(/\r?\n/)) { const i = l.indexOf(':'); if (i > 0) { const k = l.slice(0, i).trim().toLowerCase(); if (!(k in out)) out[k] = decodeWords(l.slice(i + 1).trim()); } } return out; }
const qp = s => Buffer.from(s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
function decodeBody(body, cte, charset) { const enc = String(cte || '').toLowerCase(); const bytes = enc === 'base64' ? Buffer.from(body.replace(/\s/g, ''), 'base64') : enc === 'quoted-printable' ? qp(body) : Buffer.from(body, 'latin1'); try { return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(bytes); } catch { return bytes.toString('utf8'); } }
export function parseMessage(buf) {
  const raw = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf);
  const walk = part => {
    const i = part.search(/\r?\n\r?\n/); const head = i < 0 ? part : part.slice(0, i); const body = i < 0 ? '' : part.slice(i).replace(/^\r?\n\r?\n/, '');
    const h = parseHeaders(Buffer.from(head, 'latin1').toString('utf8')); const ct = h['content-type'] || 'text/plain'; const bnd = /boundary="?([^";]+)"?/i.exec(ct)?.[1];
    if (/^multipart\//i.test(ct) && bnd) { const parts = body.split('--' + bnd).slice(1).filter(p => !p.startsWith('--')); const found = parts.map(walk); return found.find(x => x.type === 'text/plain' && x.text) || found.find(x => x.text) || { type: 'none', text: '' }; }
    const cs = /charset="?([^";]+)"?/i.exec(ct)?.[1]; const type = ct.split(';')[0].trim().toLowerCase();
    if (!/^text\//.test(type)) return { type, text: '' };
    const t = decodeBody(body, h['content-transfer-encoding'], cs); return { type, text: type === 'text/html' ? htmlToText(t) : t };
  };
  const i = raw.search(/\r?\n\r?\n/); const top = parseHeaders(Buffer.from(raw.slice(0, i), 'latin1').toString('utf8'));
  return { from: top.from || '', to: top.to || '', subject: top.subject || '', date: top.date || '', replyTo: top['reply-to'] || '', messageId: top['message-id'] || '', text: walk(raw).text.slice(0, 20000) };
}
export const emailOf = s => (/<([^>]+)>/.exec(String(s))?.[1] || String(s)).trim().toLowerCase();
