// Minimal .env loader (no dependency). Existing process.env values win; secrets are never logged.
import { existsSync, readFileSync } from 'node:fs';
export function loadEnv(file) {
  if (!existsSync(file)) return {};
  const out = {}; for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line); if (!m || line.trim().startsWith('#')) continue; let v = m[2]; if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1); out[m[1]] = v; if (process.env[m[1]] === undefined) process.env[m[1]] = v; }
  return out;
}
