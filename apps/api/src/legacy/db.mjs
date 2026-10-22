// v12 fix (S3): 'dossiers' is created at start — uploading a pack WITH a dossier used to fail with HTTP 500.
// Tiny JSON-file storage with atomic writes (write tmp → rename). Good for a school-sized hub (hundreds of students).
import { promises as fs, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) { this.dir = path.resolve(dir); for (const d of ['', 'packs', 'bulletins', 'dossiers', 'backups']) mkdirSync(path.join(this.dir, d), { recursive: true }); this.cache = new Map(); }
  file(name) { return path.join(this.dir, name); }
  read(name, fallback) { if (this.cache.has(name)) return this.cache.get(name); let v = fallback; try { v = JSON.parse(readFileSync(this.file(name), 'utf8')); } catch { /* default */ } this.cache.set(name, v); return v; }
  write(name, value) { this.cache.set(name, value); const f = this.file(name); const tmp = f + '.' + process.pid + '.tmp'; writeFileSync(tmp, JSON.stringify(value)); renameSync(tmp, f); }
  update(name, fallback, fn) { const v = fn(structuredClone(this.read(name, fallback))); this.write(name, v); return v; }
  async list(sub) { try { return (await fs.readdir(this.file(sub))).filter(n => n.endsWith('.json')); } catch { return []; } }
  readRaw(name) { try { return readFileSync(this.file(name), 'utf8'); } catch { return null; } }
  writeRaw(name, text) { const f = this.file(name); const tmp = f + '.tmp'; writeFileSync(tmp, text); renameSync(tmp, f); this.cache.delete(name); }
  ensure(sub) { mkdirSync(path.join(this.dir, sub), { recursive: true }); }
  exists(name) { return existsSync(this.file(name)); }
  async remove(name) { this.cache.delete(name); try { await fs.unlink(this.file(name)); } catch { /* */ } }
}
