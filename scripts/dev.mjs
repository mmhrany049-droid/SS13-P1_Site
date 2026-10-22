#!/usr/bin/env node
// `npm run dev` — rebuilds the web app on every save (esbuild watch) and restarts the API on server changes.
// Open http://localhost:8080 (one port: API + site). Uses .env if present; data in ./data unless DATA_DIR is set.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch } from './web-build-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; await watch(() => console.log(`  ↻ رابط کاربری ساخته شد (${++n})`));
const api = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--watch-path=apps/api', '--watch-path=packages', '--import', './scripts/ss-resolve.mjs', 'apps/api/src/server.mjs'], { cwd: ROOT, stdio: 'inherit', env: { SS_TELEGRAM: '0', ...process.env } });
const stop = () => { api.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
