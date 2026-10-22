import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'apps', 'web');
const source = name => path.join(ROOT, 'packages', name, 'src');

const ssAliases = {
  domain: source('domain'),
  ui: source('ui'),
  contracts: source('contracts'),
};

const ssWorkspace = {
  name: 'ss-workspace-aliases',
  resolveId(id) {
    const m = /^@ss\/(domain|ui|contracts)(?:\/(.*))?$/.exec(id);
    if (!m) return null;
    return path.join(ssAliases[m[1]], m[2] || 'index.mjs');
  },
};

export default defineConfig(({ mode }) => ({
  root: WEB,
  base: '/',
  plugins: [react(), ssWorkspace],
  publicDir: path.join(WEB, 'public'),
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
  },
  resolve: { extensions: ['.mjs', '.js', '.jsx', '.json'] },
  css: { postcss: path.join(ROOT, 'postcss.config.js') },
  build: {
    outDir: path.join(WEB, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'esnext',
    rollupOptions: { input: path.join(WEB, 'index.html') },
  },
  server: { fs: { allow: [ROOT] } },
}));
