#!/usr/bin/env node
// `npm run demo` — a throw-away demo on ./data-demo: seeds an organisation with an owner, a manager, a teacher and
// two students (passwords printed below), turns MFA OFF (demo only, loudly labelled) and starts the site.
// Never point this at real data. Real installs: `npm start` (MFA mandatory for management roles).
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, DATA_DIR: process.env.DATA_DIR || path.join(ROOT, 'data-demo'), SS_DEMO: '1', SS_REQUIRE_MFA: '0', SS_TELEGRAM: '0' };
const node = (args, opts = {}) => [process.execPath, ['--disable-warning=ExperimentalWarning', '--import', './scripts/ss-resolve.mjs', ...args], { cwd: ROOT, env, stdio: 'inherit', ...opts }];
const seeded = spawnSync(...node(['scripts/seed-demo.mjs']));
if (seeded.status) process.exit(seeded.status);
const srv = spawn(...node(['apps/api/src/server.mjs']));
process.on('SIGINT', () => srv.kill('SIGINT')); srv.on('exit', c => process.exit(c ?? 0));
