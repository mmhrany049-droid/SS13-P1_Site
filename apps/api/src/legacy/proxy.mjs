// Zero-dependency proxy support for the Telegram bot (Bot API = HTTPS to api.telegram.org).
//   socks5 (with or without user/pass) · http CONNECT (with or without basic auth).
//   MTProto proxies (tg://proxy?…&secret=…) are accepted into the list — like the Telegram app — but they only work
//   inside Telegram clients, not for bots; they are kept for sharing with students and skipped by the bot.
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import { randomUUID } from 'node:crypto';

export const TG_HOST = 'api.telegram.org';

/** Parse anything the admin may paste: t.me / tg:// links, socks5://, http://, «host:port». */
export function parseProxy(input) {
  const raw = String(input || '').trim(); if (!raw) return { error: 'empty' };
  let u; const norm = raw.replace(/^tg:\/\//, 'https://t.me/').replace(/^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\//, 'https://t.me/');
  try {
    if (/^https:\/\/t\.me\/(socks|proxy)\?/.test(norm)) {
      u = new URL(norm); const q = u.searchParams; const kind = u.pathname.replace(/^\//, '');
      const p = { host: q.get('server') || '', port: +q.get('port') || 0 };
      if (kind === 'proxy') return valid({ ...p, type: 'mtproto', secret: q.get('secret') || '' });
      return valid({ ...p, type: 'socks5', user: q.get('user') || '', pass: q.get('pass') || '' });
    }
    if (/^(socks5h?|socks|http|https):\/\//i.test(raw)) {
      u = new URL(raw); const type = /^http/i.test(u.protocol) ? 'http' : 'socks5';
      return valid({ type, host: u.hostname.replace(/^\[|\]$/g, ''), port: +u.port || (type === 'http' ? 8080 : 1080), user: decodeURIComponent(u.username || ''), pass: decodeURIComponent(u.password || '') });
    }
    const m = /^([^\s:]+|\[[^\]]+\]):(\d{1,5})(?::([^:]*):(.*))?$/.exec(raw);
    if (m) return valid({ type: 'socks5', host: m[1].replace(/^\[|\]$/g, ''), port: +m[2], user: m[3] || '', pass: m[4] || '' });
  } catch { /* fallthrough */ }
  return { error: 'unrecognized' };
}
function valid(p) {
  if (!p.host || !/^[a-zA-Z0-9.\-:]+$/.test(p.host)) return { error: 'bad-host' };
  if (!(p.port > 0 && p.port < 65536)) return { error: 'bad-port' };
  if (p.type === 'mtproto' && !/^[0-9a-fA-F]{32,}$|^(ee|dd)[0-9a-zA-Z_\-=+/]+$/.test(p.secret || '')) return { error: 'bad-secret' };
  return { proxy: { id: randomUUID(), enabled: true, ...p } };
}
export const proxyLink = p => p.type === 'mtproto' ? `https://t.me/proxy?server=${encodeURIComponent(p.host)}&port=${p.port}&secret=${encodeURIComponent(p.secret)}`
  : p.type === 'socks5' ? `https://t.me/socks?server=${encodeURIComponent(p.host)}&port=${p.port}${p.user ? `&user=${encodeURIComponent(p.user)}&pass=${encodeURIComponent(p.pass || '')}` : ''}` : `http://${p.host}:${p.port}`;
export const usableByBot = p => p && p.enabled !== false && (p.type === 'socks5' || p.type === 'http');

/** Open a TCP connection to host:port through the proxy (or directly when proxy is null). */
export function connectVia(proxy, host, port, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const fail = e => { try { sock.destroy(); } catch { /* */ } reject(e instanceof Error ? e : new Error(String(e))); };
    const target = proxy ? [proxy.port, proxy.host] : [port, host];
    const sock = net.connect(target[0], target[1]);
    sock.setTimeout(timeout, () => fail(new Error('timeout')));
    sock.once('error', fail);
    if (!proxy) { sock.once('connect', () => { sock.setTimeout(0); resolve(sock); }); return; }
    if (proxy.type === 'http') {
      sock.once('connect', () => {
        const auth = proxy.user ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.user}:${proxy.pass || ''}`).toString('base64')}\r\n` : '';
        sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
      });
      let buf = Buffer.alloc(0);
      const onData = d => { buf = Buffer.concat([buf, d]); const i = buf.indexOf('\r\n\r\n'); if (i < 0) { if (buf.length > 8192) fail(new Error('proxy-bad-response')); return; }
        sock.off('data', onData); const line = buf.slice(0, buf.indexOf('\r\n')).toString(); if (!/^HTTP\/1\.[01] 200/.test(line)) return fail(new Error('proxy-refused: ' + line.slice(0, 60)));
        sock.setTimeout(0); const rest = buf.slice(i + 4); if (rest.length) sock.unshift(rest); resolve(sock); };
      sock.on('data', onData); return;
    }
    if (proxy.type !== 'socks5') return fail(new Error('unsupported-proxy-type'));
    // SOCKS5 (RFC 1928 / 1929), remote DNS (ATYP=3)
    let stage = 'greet'; let buf = Buffer.alloc(0);
    sock.once('connect', () => sock.write(Buffer.from(proxy.user ? [5, 2, 0, 2] : [5, 1, 0])));
    const sendConnect = () => { const h = Buffer.from(host); stage = 'connect'; sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, h.length]), h, Buffer.from([port >> 8, port & 255])])); };
    const onData = d => {
      buf = Buffer.concat([buf, d]);
      if (stage === 'greet') { if (buf.length < 2) return; const m = buf[1]; buf = buf.slice(2);
        if (m === 0) return sendConnect();
        if (m === 2 && proxy.user) { const u = Buffer.from(proxy.user), p = Buffer.from(proxy.pass || ''); stage = 'auth'; return sock.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p])); }
        return fail(new Error('socks-auth-method-rejected')); }
      if (stage === 'auth') { if (buf.length < 2) return; const ok = buf[1] === 0; buf = buf.slice(2); if (!ok) return fail(new Error('socks-auth-failed')); return sendConnect(); }
      if (stage === 'connect') {
        if (buf.length < 5) return; if (buf[1] !== 0) return fail(new Error('socks-connect-failed:' + buf[1]));
        const at = buf[3]; const len = at === 1 ? 4 : at === 4 ? 16 : buf[4] + 1; const total = 4 + len + 2; if (buf.length < total) return;
        sock.off('data', onData); sock.setTimeout(0); const rest = buf.slice(total); if (rest.length) sock.unshift(rest); stage = 'done'; resolve(sock);
      }
    };
    sock.on('data', onData);
  });
}

/** HTTPS request (JSON) through an optional proxy. */
export async function httpsJson(proxy, { host = TG_HOST, port = 443, path, method = 'GET', body = null, timeout = 30000, insecure = false }) {
  const raw = await connectVia(proxy, host, port, Math.min(timeout, 15000));
  const sock = tls.connect({ socket: raw, servername: host, rejectUnauthorized: !insecure, ALPNProtocols: ['http/1.1'] });
  await new Promise((ok, bad) => { sock.once('secureConnect', ok); sock.once('error', bad); });
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const req = https.request({ host, port, path, method, createConnection: () => sock, agent: false, timeout, headers: { Host: host, Connection: 'close', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch { /* */ } resolve({ status: res.statusCode, json: j, text: t }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    if (data) req.write(data); req.end();
  });
}

/** Ping: TCP+TLS handshake time to api.telegram.org via the proxy; with a token also calls getMe. */
export async function testProxy(proxy, token = '') {
  if (proxy && !usableByBot(proxy)) return { ok: false, error: proxy.type === 'mtproto' ? 'mtproto-not-for-bots' : 'disabled' };
  const t0 = Date.now();
  try {
    if (token) { const r = await httpsJson(proxy, { path: `/bot${token}/getMe`, timeout: 15000 }); const ms = Date.now() - t0; return r.json?.ok ? { ok: true, ms, bot: r.json.result.username } : { ok: false, ms, error: r.json?.description || `HTTP ${r.status}` }; }
    const raw = await connectVia(proxy, TG_HOST, 443, 12000); const s = tls.connect({ socket: raw, servername: TG_HOST });
    await new Promise((ok, bad) => { s.once('secureConnect', ok); s.once('error', bad); }); s.destroy(); return { ok: true, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, ms: Date.now() - t0, error: e.message }; }
}
