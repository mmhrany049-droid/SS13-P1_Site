import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKG = { '@ss/domain': 'packages/domain/src', '@ss/ui': 'packages/ui/src', '@ss/auth': 'packages/auth/src', '@ss/contracts': 'packages/contracts/src', '@ss/persistence': 'packages/persistence/src' };
export async function resolve(spec, ctx, next) {
  if (spec === 'vitest') return { url: pathToFileURL(path.join(ROOT, 'tests/support/vitest-shim.mjs')).href, shortCircuit: true };
  for (const [name, dir] of Object.entries(PKG)) {
    if (spec === name) return { url: pathToFileURL(path.join(ROOT, dir, 'index.mjs')).href, shortCircuit: true };
    if (spec.startsWith(name + '/')) return { url: pathToFileURL(path.join(ROOT, dir, spec.slice(name.length + 1))).href, shortCircuit: true };
  }
  return next(spec, ctx);
}
