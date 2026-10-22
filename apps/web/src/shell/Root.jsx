// SS 12 — the single route tree (report §20). The server decides who you are and which surface you land on;
// the client only follows `next`. No public path is called admin or student.
//   /login  /setup  /choose-role  →  /today (student experience)  |  /workspace (organisation desk)
//   /demo  = local demo mode (no server, data stays in this browser) — clearly labelled, never «online».
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { call } from './api.js';
import { Login, Setup, ChooseRole } from './Auth.jsx';
import { Sheet, SHELL_THEME } from './Sheet.jsx';

const StudentApp = lazy(() => import('../student/App.jsx'));
const WorkspaceApp = lazy(() => import('../workspace/App.jsx'));

const PUBLIC = new Set(['/login', '/setup', '/demo']);
const norm = p => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p) || '/';
const SITE = typeof __SS_SITE__ !== 'undefined' && __SS_SITE__; // site build: public pages on the same domain; app build: straight to the login
const Landing = lazy(() => import('./Landing.jsx')); const PUBLIC_SITE = new Set(['/', '/features', '/pace', '/privacy', '/terms', '/contact']);
const surfaceOf = p => p.startsWith('/workspace') ? 'workspace' : p.startsWith('/today') ? 'today' : null;

function Splash({ text = 'SS…' }) {
  return <div dir="rtl" lang="fa" className="ss grid min-h-screen place-items-center bg-[var(--paper)]"><style>{SHELL_THEME}</style><p className="text-[22px] font-black text-[var(--ink)]">{text}</p></div>;
}

export default function Root() {
  const [path, setPath] = useState(() => norm(location.pathname));
  const [ses, setSes] = useState(null); // null = loading · {offline:true} · server session view
  const go = useCallback((p, replace = false) => { const n = norm(p); if (n !== norm(location.pathname)) history[replace ? 'replaceState' : 'pushState'](null, '', n); setPath(n); }, []);
  const load = useCallback(async () => { try { setSes(await call('/api/auth/session')); } catch (e) { setSes(e.offline ? { offline: true } : { authenticated: false, error: e.message }); } }, []);
  useEffect(() => { load(); const f = () => setPath(norm(location.pathname)); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, [load]);
  const after = useCallback(async next => { await load(); go(next || '/', true); }, [load, go]);
  const logout = useCallback(async () => { try { await call('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* already gone */ } await load(); go('/login', true); }, [load, go]);
  const switchRole = useCallback(() => go('/choose-role'), [go]);

  // where should this visitor be?
  let want = path;
  if (ses && !ses.offline) {
    const role = ses.activeRole;
    if (ses.needsSetup) want = '/setup';
    else if (!ses.authenticated) want = SITE && PUBLIC_SITE.has(path) ? path : path === '/demo' && ses.demo ? '/demo' : '/login';
    else if (!role) want = '/choose-role';
    else if (PUBLIC.has(path) || path === '/' || (SITE && PUBLIC_SITE.has(path))) want = role.surface === 'workspace' ? '/workspace' : '/today';
    else if (surfaceOf(path) && surfaceOf(path) !== role.surface) want = role.surface === 'workspace' ? '/workspace' : '/today';
  } else if (ses?.offline) want = '/demo';
  useEffect(() => { if (ses && want !== path) go(want, true); }, [ses, want, path, go]);
  useEffect(() => { document.body.classList.toggle('surface-workspace', surfaceOf(want) === 'workspace'); }, [want]);

  if (!ses || want !== path) return <Splash />;
  if (SITE && PUBLIC_SITE.has(path) && !ses.authenticated) return <Suspense fallback={<Splash />}><Landing path={path} go={go} /></Suspense>;
  if (path === '/setup') return <Setup onDone={after} />;
  if (path === '/login') return <Login onDone={after} go={go} demoAllowed={!!ses.demo} />;
  if (path === '/choose-role') return <ChooseRole session={ses} onDone={after} onLogout={logout} />;
  if (path === '/demo') return <Suspense fallback={<Splash />}><StudentApp localDemo serverReachable={!ses.offline} onExitDemo={() => go('/login')} /></Suspense>;
  const unified = { user: ses.user, roles: ses.roleAssignments || [], activeRole: ses.activeRole, logout, switchRole };
  if (path.startsWith('/workspace')) return <Suspense fallback={<Splash />}><WorkspaceApp unified={unified} /></Suspense>;
  if (path.startsWith('/today')) return <Suspense fallback={<Splash />}><StudentApp unified={unified} /></Suspense>;
  return <Sheet kicker="۴۰۴" title="این صفحه نیست"><a className="font-bold text-[var(--ink-deep)] underline" href="/">برگشت به SS</a></Sheet>;
}
