// SS 12 — zero-install test bootstrap. `node --import ./tests/support/register.mjs --test …`
// Resolves the workspace packages (@ss/domain, @ss/ui, @ss/auth, @ss/contracts, @ss/persistence) straight from
// packages/*/src, and maps `vitest` to a small node:test shim so the 32 legacy Vitest tests run without npm.
// With `npm install` the same packages resolve through node_modules; this hook only fills the gap when offline.
import { register } from 'node:module';
register('./resolve-hooks.mjs', import.meta.url);
const mem = {};
globalThis.localStorage ??= { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
globalThis.sessionStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
