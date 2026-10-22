#!/usr/bin/env node
// `npm run reset` — deletes ONLY the demo data folder (./data-demo). Real data (./data or DATA_DIR) is never touched
// by this script; to start a real install from zero, move that folder away yourself (keep it as a backup).
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'data-demo');
if (!existsSync(dir)) { console.log('داده دمو وجود ندارد؛ کاری لازم نبود.'); process.exit(0); }
rmSync(dir, { recursive: true, force: true }); console.log('داده دمو (data-demo) پاک شد. دوباره: npm run demo');
