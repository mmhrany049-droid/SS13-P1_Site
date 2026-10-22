#!/usr/bin/env node
// `npm run build` → apps/web/dist (one site; served by `npm start` on the same port as the API).
import { build } from './web-build-lib.mjs';
const t = Date.now();
const r = await build();
console.log(`SS 13 web: ${r.files.length} فایل · ${(r.bytes / 1024).toFixed(0)} KB · ${Date.now() - t} ms → apps/web/dist`);
