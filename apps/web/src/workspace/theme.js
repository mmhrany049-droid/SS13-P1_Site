// SS Admin v3 design: the student site's answer-sheet spine (timing-mark rail, bubble nav, 900-weight headlines),
// re-inked in blue. Paper is cool office white, ink is fountain-pen blue.
export const THEME = `.ss{--paper:#EDF2F8;--card:#FAFCFF;--ink:#1D5FA8;--ink-deep:#0F3B6E;--ink-faint:#A8C2E2;--graphite:#1E2733;--pencil:#556070;--wash:#E0EAF6;--rule:#CCDAEA;--ok:#2F7D4F;--bad:#C2362B;--amber:#B9800F;--shadow:rgba(15,45,90,.35);font-family:Vazirmatn,Tahoma,system-ui,sans-serif;font-size:16px}
.ss input,.ss button,.ss select,.ss textarea{font-family:inherit}
.rail{background:repeating-linear-gradient(to bottom,var(--ink-deep) 0 5px,transparent 5px 22px)}
@keyframes drift{0%{transform:translateY(0)}100%{transform:translateY(22px)}}
.rail-live{animation:drift 6s linear infinite}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.page-in{animation:rise .28s ease-out}
@keyframes pop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.pop-in{animation:pop .22s cubic-bezier(.2,.9,.3,1.2)}
@media (prefers-reduced-motion:reduce){.rail-live,.page-in,.pop-in{animation:none}}`;
export const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 text-[15px] font-normal focus:border-[var(--ink)] focus:outline-none';
