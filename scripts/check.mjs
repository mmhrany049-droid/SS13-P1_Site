import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'apps/api/src/app.mjs',
  'apps/web/dist/index.html',
  'packages/auth/src/security.mjs',
  'packages/persistence/src/commands.mjs',
  'README_FA.md',
  '.env.example'
];

const missing = required.filter(file => !existsSync(path.join(root, file)));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const ok = missing.length === 0 && pkg.version === '13.0.0';

if (!ok) {
  console.error(JSON.stringify({ ok: false, missing, version: pkg.version }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, version: pkg.version, required: required.length }));
}
