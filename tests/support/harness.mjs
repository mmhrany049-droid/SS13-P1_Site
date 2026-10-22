// Test harness: a real HTTP server on a random port over a fresh temp data dir; one cookie jar per client.
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../../apps/api/src/app.mjs';
export async function boot(env = {}, { seedLegacy = null, kind = 'json' } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'ss12-'));
  if (seedLegacy) for (const [f, v] of Object.entries(seedLegacy)) writeFileSync(path.join(dataDir, f), JSON.stringify(v));
  const app = await createApp({ dataDir, env: { SS_SETUP_TOKEN: 'setup-token-123', SS_DB: kind, ...env }, log: () => {}, startBot: false, webDist: path.join(dataDir, 'no-web') });
  const server = http.createServer((q, s) => app.handle(q, s)); await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => { let jar = ''; return async (p, { method = 'GET', body, headers = {}, csrf = true, raw } = {}) => {
    const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf && method !== 'GET' ? { 'X-SS-CSRF': '1' } : {}), ...(jar ? { Cookie: jar } : {}), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j, headers: r.headers, cookie: sc };
  }; };
  const close = async () => { server.close(); await app.close(); };
  return { app, base, client, close, dataDir };
}
export const OWNER = { email: 'owner@ss.ir', password: 'Sabz-kooh-2026!', name: 'مالک', orgName: 'آموزشگاه آزمایشی' };
export async function setupOwner(h, env) { const c = h.client(); const r = await c('/api/setup', { method: 'POST', body: { ...OWNER, setupToken: 'setup-token-123' } }); if (r.status !== 201) throw new Error('setup failed ' + JSON.stringify(r.body)); return c; }
