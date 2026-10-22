// SS 12 — web build without Vite: esbuild (bundle, code-split, minify) + Tailwind 3 through PostCSS.
// Same tool chain for `npm run build` and `npm run dev`; output = apps/web/dist (served by the API on one port).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web'); export const DIST = path.join(WEB, 'dist');
const PKG = { domain: 'packages/domain/src', ui: 'packages/ui/src', contracts: 'packages/contracts/src' };

async function tools() {
  try {
    const [esbuild, tailwind, postcss] = await Promise.all([import('esbuild'), import('tailwindcss'), import('postcss')]);
    return { esbuild: esbuild.default || esbuild, tailwind: tailwind.default || tailwind, postcss: postcss.default || postcss };
  } catch (e) {
    console.error('\n  ابزار ساخت پیدا نشد. یک بار «npm install» را اجرا کن (اینترنت لازم است).\n  (یا از نسخه از پیش ساخته‌شده در apps/web/dist استفاده کن: npm start)\n');
    throw e;
  }
}
const aliasPlugin = {
  name: 'ss-workspace',
  setup(b) {
    b.onResolve({ filter: /^@ss\/(domain|ui|contracts)(\/.*)?$/ }, a => {
      const [, name, rest] = /^@ss\/(domain|ui|contracts)(\/.*)?$/.exec(a.path);
      return { path: path.join(ROOT, PKG[name], rest ? rest.slice(1) : 'index.mjs') };
    });
    b.onResolve({ filter: /^@ss\/(auth|persistence)/ }, a => ({ errors: [{ text: `${a.path} is server-only and must never be bundled into the web app` }] }));
  },
};
const cssPlugin = (tailwind, postcss) => ({
  name: 'ss-tailwind',
  setup(b) {
    const config = { content: [path.join(WEB, 'index.html'), path.join(WEB, 'src/**/*.{js,jsx}'), path.join(ROOT, 'packages/ui/src/**/*.{js,jsx}')], theme: { extend: {} }, plugins: [] };
    b.onLoad({ filter: /\.css$/ }, async a => {
      const src = await readFile(a.path, 'utf8');
      const out = await postcss([tailwind(config)]).process(src, { from: a.path });
      return { contents: out.css, loader: 'css', resolveDir: path.dirname(a.path), watchFiles: [a.path] };
    });
  },
});
export async function options({ dev = false } = {}) {
  const { tailwind, postcss } = await tools();
  return {
    absWorkingDir: ROOT, entryPoints: { app: path.join(WEB, 'src', 'main.jsx') }, bundle: true, splitting: true, format: 'esm', platform: 'browser',
    // Keep modern syntax intact. Older esbuild binaries installed by npm on Windows
    // cannot lower React destructuring reliably and abort the dev watcher.
    target: 'esnext', outdir: path.join(DIST, 'assets'), publicPath: '/assets/',
    entryNames: '[name]-[hash]', chunkNames: 'c-[hash]', assetNames: '[name]-[hash]', metafile: true, minify: !dev, sourcemap: dev ? 'inline' : false, legalComments: 'none',
    jsx: 'automatic', loader: { '.js': 'jsx', '.woff2': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file', '.json': 'json' },
    define: { __SS_SITE__: String(process.env.SS_BUILD === 'site'), __SS_CONTACT__: JSON.stringify(process.env.SS_CONTACT_EMAIL || ''), 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'), 'import.meta.env.PROD': String(!dev), 'import.meta.env.DEV': String(dev) },
    plugins: [aliasPlugin, cssPlugin(tailwind, postcss)], logLevel: 'warning',
  };
}
/** index.html + public/ → dist, pointing at the hashed entry files from the esbuild metafile. */
export async function writeHtml(meta) {
  const outs = Object.entries(meta.outputs).filter(([, o]) => o.entryPoint);
  const js = outs.find(([f]) => f.endsWith('.js'))?.[0]; const css = Object.keys(meta.outputs).find(f => /assets[/\\]app-[^/\\]+\.css$/.test(f));
  const rel = f => '/assets/' + path.basename(f);
  let html = await readFile(path.join(WEB, 'index.html'), 'utf8');
  // v13 fix: the source index.html is Vite-style (/src/main.jsx, no stylesheet link); v12 only replaced placeholders that did not exist, so every real build shipped an index that loaded nothing.
  html = html.replace('/assets/app.css', css ? rel(css) : '').replace('/assets/app.js', rel(js)).replace('/src/main.jsx', rel(js));
  if (css && !html.includes(rel(css))) html = html.replace('</head>', `    <link rel="stylesheet" href="${rel(css)}" />\n  </head>`);
  if (!css) html = html.replace(/\s*<link rel="stylesheet" href="" \/>/, '');
  await cp(path.join(WEB, 'public'), DIST, { recursive: true });
  await writeFile(path.join(DIST, 'index.html'), html);
}
export async function build({ dev = false } = {}) {
  const { esbuild } = await tools();
  await rm(DIST, { recursive: true, force: true }); await mkdir(path.join(DIST, 'assets'), { recursive: true });
  const r = await esbuild.build(await options({ dev }));
  await writeHtml(r.metafile);
  const files = await readdir(path.join(DIST, 'assets'));
  return { files, bytes: Object.values(r.metafile.outputs).reduce((n, o) => n + o.bytes, 0) };
}
export async function watch(onBuilt = () => {}) {
  const { esbuild } = await tools();
  await rm(DIST, { recursive: true, force: true }); await mkdir(path.join(DIST, 'assets'), { recursive: true });
  const ctx = await esbuild.context({ ...(await options({ dev: true })), plugins: [...(await options({ dev: true })).plugins, { name: 'ss-html', setup(b) { b.onEnd(async r => { if (r.metafile && !r.errors.length) { await writeHtml(r.metafile); onBuilt(); } }); } }] });
  await ctx.watch(); return ctx;
}
