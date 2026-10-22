#!/usr/bin/env node
// SS 12 — start the single site: API + web (apps/web/dist) on one port. `npm start`
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadEnv(path.join(ROOT, '.env'));
const { createApp, VERSION } = await import('./app.mjs');
const PORT = +(process.env.PORT || 8080);
const app = await createApp({ startBot: process.env.SS_TELEGRAM !== '0' });
const server = http.createServer((req, res) => { app.handle(req, res); });
server.headersTimeout = 20e3; server.requestTimeout = 60e3; server.keepAliveTimeout = 5e3;
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nپورت ${PORT} در حال استفاده است. برنامه قبلی را ببندید یا PORT دیگری در فایل .env بگذارید.\n`);
    process.exitCode = 1;
    return;
  }
  console.error(err);
  process.exitCode = 1;
});
server.listen(PORT, () => {
  console.log(`SS ${VERSION} · http://localhost:${PORT}  (داده: ${process.env.DATA_DIR || 'data/'} · پایگاه: ${app.db.kind})`);
  if (process.env.SS_REQUIRE_MFA === '0') console.log('  ⚠ ورود دومرحله‌ای برای نقش‌های مدیریتی اجباری نیست (SS_REQUIRE_MFA=0) — فقط برای دمو');
});
// graceful shutdown: stop accepting, finish in-flight requests, close storage
let closing = false;
const stop = sig => { if (closing) return; closing = true; console.log(`\n${sig}: در حال بستن…`); server.close(async () => { await app.close(); process.exit(0); }); setTimeout(() => process.exit(1), 10e3).unref(); };
process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
// purge expired sessions every 6 hours
setInterval(() => app.sessions.purge().catch(() => {}), 6 * 3600e3).unref();
