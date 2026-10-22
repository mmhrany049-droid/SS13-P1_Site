/*
 SS 12 — the unified entry, drawn as the cover of an answer sheet (پاسخ‌برگ): crimson print ink on off-white paper,
 timing marks down the sheet edge (the scanner's clock), bubbles you fill with a pencil. Same spine as the student
 cockpit since v4 and the workspace in fountain-pen blue, so the three surfaces read as ONE site.
 Signature: choosing a role is filling a bubble — it inks in, then the sheet turns to that surface.
*/
export const SHELL_THEME = `.ss{--paper:#F6F1EA;--card:#FFFCF8;--ink:#B3184A;--ink-deep:#7E0F33;--ink-faint:#E3A9BA;--graphite:#26232B;--pencil:#57515B;--wash:#F3E3E8;--rule:#EBD3DA;--ok:#2F7D4F;--bad:#C2362B;--amber:#B9800F;--pen:#1D5FA8;--pen-wash:#E3ECF7;font-family:Vazirmatn,"Vazir",Tahoma,system-ui,sans-serif;font-size:16px}
.ss input,.ss button,.ss select,.ss textarea{font-family:inherit}
.rail{background:repeating-linear-gradient(to bottom,var(--graphite) 0 5px,transparent 5px 22px)}
@keyframes drift{0%{transform:translateY(0)}100%{transform:translateY(22px)}}
.rail-live{animation:drift 6s linear infinite}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.rise-in{animation:rise .42s cubic-bezier(.2,.8,.2,1) both}
@keyframes ink{0%{transform:scale(.2);opacity:.2}70%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
.bubble-ink{animation:ink .36s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes shake{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.shake{animation:shake .32s ease-in-out}
@media (prefers-reduced-motion:reduce){.rail-live,.rise-in,.bubble-ink,.shake{animation:none}}`;

export const inp = 'mt-1.5 block w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3.5 py-3 text-[16px] text-[var(--graphite)] outline-none transition focus:border-[var(--ink)] focus:bg-[var(--card)]';
export const btn = 'inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[10px] bg-[var(--ink)] px-6 text-[16px] font-black text-[var(--paper)] transition hover:bg-[var(--ink-deep)] disabled:cursor-not-allowed disabled:opacity-55';
export const ghost = 'inline-flex min-h-[44px] items-center justify-center rounded-[10px] px-4 text-[15px] font-bold text-[var(--ink-deep)] hover:bg-[var(--wash)]';

export function Sheet({ kicker, title, sub, children, aside, wide = false }) {
  return (
    <div dir="rtl" lang="fa" className="ss min-h-screen bg-[var(--paper)] text-[var(--graphite)]">
      <style>{SHELL_THEME}</style>
      <div className="mx-auto flex min-h-screen max-w-[1180px] gap-0 px-3 sm:px-6">
        <div className="relative w-[18px] shrink-0 overflow-hidden" aria-hidden><div className="rail rail-live absolute inset-x-[4px] -top-[22px] bottom-0 opacity-80" /></div>
        <main className={`grid flex-1 items-center gap-10 py-10 pr-4 sm:pr-10 ${aside ? 'lg:grid-cols-[1fr_minmax(0,460px)]' : ''}`}>
          {aside && <section className="hidden lg:block">{aside}</section>}
          <section className={`rise-in mx-auto w-full ${wide ? 'max-w-[640px]' : 'max-w-[460px]'}`}>
            <header className="mb-6">
              <p className="text-[14px] font-black tracking-[.04em] text-[var(--ink)]">{kicker}</p>
              <h1 className="mt-1 text-[34px] font-black leading-[1.15] tracking-[-0.02em] sm:text-[40px]">{title}</h1>
              {sub && <p className="mt-2 text-[16px] leading-7 text-[var(--pencil)]">{sub}</p>}
            </header>
            <div className="rounded-[18px] bg-[var(--card)] p-6 shadow-[0_1px_0_var(--rule),0_26px_60px_-30px_rgba(126,15,51,.4)] outline outline-2 outline-[var(--rule)] sm:p-8">{children}</div>
          </section>
        </main>
      </div>
    </div>
  );
}

/** The big quiet left page: the subject's own artifact — candidate row + timing column + four bubbles. */
export function Cover() {
  const rows = ['امروز', 'مطالعه و تست', 'مرور', 'برنامه', 'آزمون'];
  return (
    <div className="max-w-[520px]">
      <p className="text-[15px] font-black text-[var(--ink)]">SS · نسخه ۱۲</p>
      <p className="mt-3 text-[64px] font-black leading-[1] tracking-[-0.04em] xl:text-[80px]">یک برگه،<br /><span className="text-[var(--ink)]">همه نقش‌ها.</span></p>
      <p className="mt-5 max-w-[420px] text-[18px] leading-8 text-[var(--pencil)]">دانش‌آموز، معلم، مدیر یا مالک: با همان حساب وارد شو. سرور نقش تو را تشخیص می‌دهد، نه آدرس صفحه.</p>
      <ol className="mt-10 space-y-2.5" aria-label="پنج بخش اصلی دانش‌آموز">
        {rows.map((r, i) => (
          <li key={r} className="flex items-center gap-4 text-[16px] font-bold">
            <span className="w-6 text-left text-[14px] text-[var(--pencil)]">{(i + 1).toLocaleString('fa-IR')}</span>
            <span className="flex gap-2" aria-hidden>{[0, 1, 2, 3].map(k => <span key={k} className={`h-[18px] w-[30px] rounded-full border-2 ${k === (i * 3 + 1) % 4 ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--ink-faint)]'}`} />)}</span>
            <span>{r}</span>
          </li>))}
      </ol>
    </div>
  );
}

export const Alert = ({ children, tone = 'bad' }) => children ? <p role={tone === 'bad' ? 'alert' : 'status'} className={`shake mt-4 rounded-[10px] px-3.5 py-2.5 text-[15px] font-bold ${tone === 'bad' ? 'bg-[color-mix(in_srgb,var(--bad)_12%,var(--card))] text-[var(--bad)]' : 'bg-[var(--wash)] text-[var(--ink-deep)]'}`}>{children}</p> : null;
export const Field = ({ label, hint, ...p }) => <label className="mt-4 block text-[15px] font-bold first:mt-0">{label}<input className={inp} {...p} />{hint && <span className="mt-1 block text-[14px] font-normal text-[var(--pencil)]">{hint}</span>}</label>;
