// SS 12 — lets `node` find the workspace packages (@ss/auth, @ss/domain, …) straight from packages/*/src,
// so the server starts with ZERO npm dependencies (only Node 22.5+). After `npm install` the same names also
// resolve through node_modules; this hook just makes a fresh unzip runnable.
import { register } from 'node:module';
register('./ss-resolve-hooks.mjs', import.meta.url);
